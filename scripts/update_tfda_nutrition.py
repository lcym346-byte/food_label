#!/usr/bin/env python3
"""
TFND / TFDA 食品營養成分資料庫離線資料產生器。

用途：
1. 從使用者指定的台灣政府「食品營養成分資料庫」頁面擷取最新版 Excel 下載連結。
2. 下載 2025 版 UPDATE Excel，轉換成 App 可快速搜尋的每 100g 營養資料。
3. 同步下載 TFDA OpenData 長表資料，補齊英文名等欄位作為輔助 metadata。
4. 輸出 web/data/tfda_nutrition_compact.json，Android assets 會同步同一份檔案。

注意：此腳本必須在專案根目錄執行，所有輸出都在 /home/user/webapp 內。
"""
from __future__ import annotations

import html
import json
import re
import shutil
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

TFND_PAGE_URL = "https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178"
TFDA_OPEN_DATA_URL = "https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=5"
OUTPUT = Path("web/data/tfda_nutrition_compact.json")
ANDROID_OUTPUT = Path("app/src/main/assets/web/data/tfda_nutrition_compact.json")
USER_AGENT = "FoodLabelPro/1.0 (+https://github.com/lcym346-byte/food_label)"

# App 需要的 8 大營養素與 TFDA OpenData 長表分析項名稱對照，用來補舊資料與英文名。
OPEN_DATA_NUTRIENT_MAP = {
    "熱量": "calories",
    "修正熱量": "caloriesAdjusted",
    "粗蛋白": "protein",
    "粗脂肪": "fat",
    "飽和脂肪": "saturatedFat",
    "反式脂肪": "transFat",
    "總碳水化合物": "carbohydrate",
    "糖質總量": "sugar",
    "鈉": "sodium",
    "膳食纖維": "fiber",
}

# TFND 消費者專區 Excel 是寬表；這裡只抽取營養標示常用欄位。
EXCEL_FIELD_MAP = {
    "熱量(kcal)": "calories",
    "修正熱量(kcal)": "caloriesAdjusted",
    "粗蛋白(g)": "protein",
    "粗脂肪(g)": "fat",
    "飽和脂肪(g)": "saturatedFat",
    "反式脂肪(mg)": "transFatMg",
    "總碳水化合物(g)": "carbohydrate",
    "糖質總量(g)": "sugar",
    "鈉(mg)": "sodium",
    "膳食纖維(g)": "fiber",
}


def download(url: str, timeout: int = 90) -> bytes:
    """下載公開資料；統一加上 User-Agent，避免部分政府站台拒絕預設 Python UA。"""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def parse_number(value: object) -> float | None:
    """將 TFDA/TFND 文字型態數值轉成 float；遇到 trace/空值則回傳 None 或 0。"""
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    if text in {"-", "--", "未檢出", "ND", "nd", "Tr", "tr", "Trace", "trace"}:
        return 0.0
    match = re.search(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", text)
    return float(match.group(0)) if match else None


def round_or_zero(value: object, digits: int = 2) -> float:
    number = parse_number(value)
    return round(number, digits) if number is not None else 0


def find_tfnd_excel_link(page_html: str) -> tuple[str, str]:
    """從 https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178 找出最新版 EXCEL 下載連結。"""
    for match in re.finditer(r'<a\s+[^>]*href="([^"]*GetFile\.ashx[^"]*)"[^>]*>(.*?)</a>', page_html, re.S | re.I):
        href = html.unescape(match.group(1))
        label = re.sub(r"<.*?>", "", html.unescape(match.group(2))).strip()
        label = re.sub(r"[（(]另開新視窗[）)]", "", label).strip()
        if "EXCEL" in label.upper() or href.lower().endswith(".xlsx"):
            return urllib.parse.urljoin(TFND_PAGE_URL, href), label
    raise RuntimeError("找不到 TFND 食品營養成分資料庫 EXCEL 下載連結")


def column_index(cell_ref: str) -> int:
    """將 Excel 欄位代碼 A/B/AA 轉成 0-based index。"""
    letters = re.match(r"[A-Z]+", cell_ref or "")
    if not letters:
        return 0
    index = 0
    for char in letters.group(0):
        index = index * 26 + (ord(char) - ord("A") + 1)
    return index - 1


def xlsx_rows(xlsx_bytes: bytes) -> list[list[str]]:
    """以標準函式庫解析 XLSX 第一個工作表，避免額外依賴 openpyxl。"""
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(BytesIO(xlsx_bytes)) as workbook:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall("x:si", ns):
                shared_strings.append("".join(t.text or "" for t in item.findall(".//x:t", ns)))

        # 本資料庫目前只有一個 sheet；若未來新增工作表，仍以 workbook 第一個 worksheet 為準。
        sheet_name = sorted(name for name in workbook.namelist() if name.startswith("xl/worksheets/sheet"))[0]
        sheet = ET.fromstring(workbook.read(sheet_name))
        result: list[list[str]] = []
        for row in sheet.findall(".//x:sheetData/x:row", ns):
            cells: dict[int, str] = {}
            for cell in row.findall("x:c", ns):
                idx = column_index(cell.get("r", "A"))
                value_node = cell.find("x:v", ns)
                inline_node = cell.find("x:is/x:t", ns)
                if inline_node is not None:
                    value = inline_node.text or ""
                elif value_node is None:
                    value = ""
                else:
                    value = value_node.text or ""
                    if cell.get("t") == "s" and value:
                        value = shared_strings[int(value)]
                cells[idx] = value
            max_idx = max(cells.keys(), default=-1)
            result.append([cells.get(i, "") for i in range(max_idx + 1)])
        return result


def build_open_data_metadata() -> dict[str, dict]:
    """讀取 TFDA OpenData 長表，作為英文名與舊資料補充來源。"""
    print("下載 TFDA OpenData 輔助資料...")
    zip_bytes = download(TFDA_OPEN_DATA_URL)
    with zipfile.ZipFile(BytesIO(zip_bytes)) as archive:
        json_name = archive.namelist()[0]
        rows = json.loads(archive.read(json_name).decode("utf-8-sig"))

    foods: dict[str, dict] = {}
    for row in rows:
        code = row.get("整合編號")
        item = row.get("分析項")
        if not code:
            continue
        food = foods.setdefault(
            code,
            {
                "id": code,
                "name": row.get("樣品名稱") or "未命名食品",
                "commonName": row.get("俗名") or "",
                "englishName": row.get("樣品英文名稱") or "",
                "category": row.get("食品分類") or "",
                "description": row.get("內容物描述") or "",
                "source": "TFDA OpenData 食品營養成分資料集",
                "calories": 0,
                "protein": 0,
                "fat": 0,
                "saturatedFat": 0,
                "transFat": 0,
                "carbohydrate": 0,
                "sugar": 0,
                "sodium": 0,
                "fiber": 0,
            },
        )
        if item not in OPEN_DATA_NUTRIENT_MAP:
            continue
        key = OPEN_DATA_NUTRIENT_MAP[item]
        value = parse_number(row.get("每100克含量"))
        if value is None:
            continue
        unit = str(row.get("含量單位") or "").strip().lower()
        if key == "transFat" and unit == "mg":
            value = value / 1000
        if key == "caloriesAdjusted":
            if not food.get("calories"):
                food["calories"] = round(value, 2)
        else:
            food[key] = round(value, 2)
    return foods


def build_tfnd_foods(xlsx_bytes: bytes, label: str, open_data_foods: dict[str, dict]) -> dict[str, dict]:
    """將 TFND 消費者專區 Excel 寬表轉成 App 使用的精簡食品清單。"""
    rows = xlsx_rows(xlsx_bytes)
    header_index = next((idx for idx, row in enumerate(rows) if "整合編號" in row and "樣品名稱" in row), None)
    if header_index is None:
        raise RuntimeError("TFND Excel 找不到欄位列")

    headers = rows[header_index]
    column = {name: idx for idx, name in enumerate(headers) if name}
    foods: dict[str, dict] = {}

    for row in rows[header_index + 1 :]:
        code = row[column.get("整合編號", -1)].strip() if column.get("整合編號", -1) < len(row) else ""
        if not code:
            continue
        old = open_data_foods.get(code, {})
        get = lambda name: row[column[name]].strip() if name in column and column[name] < len(row) else ""
        food = {
            "id": code,
            "name": get("樣品名稱") or old.get("name") or "未命名食品",
            "commonName": get("俗名") or old.get("commonName", ""),
            "englishName": old.get("englishName", ""),
            "category": get("食品分類") or old.get("category", ""),
            "description": get("內容物描述") or old.get("description", ""),
            "source": f"TFND {label}".strip(),
            "calories": 0,
            "protein": 0,
            "fat": 0,
            "saturatedFat": 0,
            "transFat": 0,
            "carbohydrate": 0,
            "sugar": 0,
            "sodium": 0,
            "fiber": 0,
        }

        for excel_name, key in EXCEL_FIELD_MAP.items():
            if excel_name not in column:
                continue
            raw_value = row[column[excel_name]] if column[excel_name] < len(row) else ""
            value = parse_number(raw_value)
            if value is None:
                continue
            if key == "caloriesAdjusted":
                if not food.get("calories"):
                    food["calories"] = round(value, 2)
            elif key == "transFatMg":
                # TFND Excel「反式脂肪」單位為 mg，但 App 表單與營養標示以 g 輸入，因此需轉成公克；鈉則保留 mg。
                food["transFat"] = round(value / 1000, 2)
            else:
                food[key] = round(value, 2)

        # 若新版 Excel 某欄位空白，保留 OpenData 舊值作為補充；仍以 TFND Excel 為主要來源。
        for nutrient in ["calories", "protein", "fat", "saturatedFat", "transFat", "carbohydrate", "sugar", "sodium", "fiber"]:
            if food[nutrient] == 0 and old.get(nutrient):
                food[nutrient] = old[nutrient]
        foods[code] = food
    return foods


def main() -> None:
    print("下載 TFND 食品營養成分資料庫頁面...")
    page_html = download(TFND_PAGE_URL, timeout=45).decode("utf-8", "ignore")
    excel_url, excel_label = find_tfnd_excel_link(page_html)
    print(f"下載 TFND Excel：{excel_label}")
    xlsx_bytes = download(excel_url, timeout=90)

    open_data_foods = build_open_data_metadata()
    foods = build_tfnd_foods(xlsx_bytes, excel_label, open_data_foods)

    compact = {
        "meta": {
            "source": "衛福部食物營養成分資料庫（TFND）/ 食品藥物消費者專區",
            "sourceUrl": TFND_PAGE_URL,
            "downloadUrl": excel_url,
            "openDataUrl": TFDA_OPEN_DATA_URL,
            "sourceLabel": excel_label,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "foodCount": len(foods),
            "license": "政府資料開放授權條款第1版；使用前請以官方頁面最新公告為準",
            "note": "所有營養值為每 100 公克可食部分資料；正式食品標示仍需依最新法規與檢驗資料複核。",
        },
        "foods": sorted(foods.values(), key=lambda item: (item.get("category", ""), item.get("name", ""))),
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    ANDROID_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(compact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(OUTPUT, ANDROID_OUTPUT)
    print(f"完成：{len(foods)} 筆食品，輸出 {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
