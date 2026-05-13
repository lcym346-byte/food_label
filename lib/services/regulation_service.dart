import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:html/parser.dart' as html_parser;
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';

import '../models/regulation_entry.dart';
import 'database_helper.dart';

class RegulationSyncReport {
  final DateTime startedAt;
  DateTime? completedAt;
  int newRecords;
  int updatedRecords;
  final List<String> errors;
  final List<String> sources;

  RegulationSyncReport({
    required this.startedAt,
    this.completedAt,
    this.newRecords = 0,
    this.updatedRecords = 0,
    List<String>? errors,
    List<String>? sources,
  })  : errors = errors ?? [],
        sources = sources ?? [];

  int get durationMs => (completedAt ?? DateTime.now().toUtc()).difference(startedAt).inMilliseconds;
}

class RegulationService {
  RegulationService._();

  static final RegulationService instance = RegulationService._();
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<int> countRegulations() async {
    final db = await _dbHelper.database;
    return Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM regulation')) ?? 0;
  }

  Future<List<RegulationEntry>> listRegulations({String keyword = ''}) async {
    final db = await _dbHelper.database;
    if (keyword.trim().isEmpty) {
      final rows = await db.query('regulation', orderBy: 'COALESCE(publish_date, fetched_at) DESC, id DESC');
      return rows.map(RegulationEntry.fromMap).toList();
    }

    final likeRows = await db.query(
      'regulation',
      where: 'title LIKE ? OR full_text LIKE ? OR tags LIKE ?',
      whereArgs: ['%$keyword%', '%$keyword%', '%$keyword%'],
      orderBy: 'COALESCE(publish_date, fetched_at) DESC, id DESC',
    );
    return likeRows.map(RegulationEntry.fromMap).toList();
  }

  Future<RegulationEntry?> getRegulation(int id) async {
    final db = await _dbHelper.database;
    final rows = await db.query('regulation', where: 'id = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return RegulationEntry.fromMap(rows.first);
  }

  Future<RegulationSyncReport> syncAll({String triggeredBy = 'USER'}) async {
    final db = await _dbHelper.database;
    final report = RegulationSyncReport(startedAt: DateTime.now().toUtc());

    final crawlers = <Future<List<RegulationEntry>> Function()>[
      _fetchMojLaw,
      _fetchTfdaLawList,
      _fetchFoodLabelLaws,
      _fetchTfdaNews,
      _fetchSgsNews,
    ];

    for (final crawler in crawlers) {
      try {
        final entries = await crawler();
        for (final entry in entries) {
          final id = await db.insert('regulation', entry.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
          if (id > 0) report.newRecords += 1;
        }
        if (entries.isNotEmpty) {
          report.sources.add(entries.first.source.label);
        }
      } catch (e) {
        report.errors.add(e.toString());
      }
    }

    if ((await countRegulations()) == 0) {
      final seeds = _fallbackSeed();
      for (final item in seeds) {
        await db.insert('regulation', item.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
        report.newRecords += 1;
      }
      report.sources.add(RegulationSource.manualSeed.label);
    }

    report.completedAt = DateTime.now().toUtc();
    await db.insert('regulation_update_log', {
      'update_type': 'FULL_SYNC',
      'sources_checked': report.sources.join(','),
      'new_records': report.newRecords,
      'updated_records': report.updatedRecords,
      'deleted_records': 0,
      'errors': report.errors.join('\n'),
      'started_at': report.startedAt.toIso8601String(),
      'completed_at': report.completedAt!.toIso8601String(),
      'duration_ms': report.durationMs,
      'triggered_by': triggeredBy,
    });
    return report;
  }

  Future<List<Map<String, dynamic>>> recentLogs() async {
    final db = await _dbHelper.database;
    return db.query('regulation_update_log', orderBy: 'id DESC', limit: 10);
  }

  Future<List<RegulationEntry>> _fetchMojLaw() async {
    const rawUrl = 'https://raw.githubusercontent.com/kong0107/mojLawSplit/main/json/zh/L0040001.json';
    final response = await http.get(Uri.parse(rawUrl)).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) return [];
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final fullText = _buildMojFullText(data);
    return [
      _entry(
        source: RegulationSource.mojLaw,
        sourceUrl: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040001',
        regulationType: '法律',
        title: data['name']?.toString() ?? '食品安全衛生管理法',
        fullText: fullText,
        publishDate: data['lastUpdateDate']?.toString() ?? data['updated_at']?.toString(),
        effectiveDate: data['lawModifiedDate']?.toString(),
        tags: '食品安全衛生管理法,食安法,營養標示,罰則',
      ),
    ];
  }

  Future<List<RegulationEntry>> _fetchTfdaLawList() async {
    const url = 'https://www.fda.gov.tw/tc/law.aspx?cid=62';
    final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) return [];
    final document = html_parser.parse(response.body);
    final entries = <RegulationEntry>[];
    for (final link in document.querySelectorAll('a').take(20)) {
      final title = link.text.trim();
      if (!_isNutritionRelated(title)) continue;
      final href = link.attributes['href'] ?? url;
      final sourceUrl = href.startsWith('http') ? href : 'https://www.fda.gov.tw$href';
      entries.add(_entry(
        source: RegulationSource.tfdLawList,
        sourceUrl: sourceUrl,
        regulationType: '公告',
        title: title,
        fullText: null,
        publishDate: DateTime.now().toUtc().toIso8601String().split('T').first,
        effectiveDate: null,
        tags: _extractTags(title, null),
      ));
    }
    return entries;
  }

  Future<List<RegulationEntry>> _fetchFoodLabelLaws() async {
    const url = 'https://www.foodlabel.org.tw/FdaFrontEndApp/Law/List?clPublishStatus=1';
    final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) return [];
    final document = html_parser.parse(response.body);
    final entries = <RegulationEntry>[];
    for (final link in document.querySelectorAll('a').take(20)) {
      final title = link.text.trim();
      if (!_isNutritionRelated(title)) continue;
      final href = link.attributes['href'] ?? url;
      final sourceUrl = href.startsWith('http') ? href : 'https://www.foodlabel.org.tw$href';
      entries.add(_entry(
        source: RegulationSource.foodlabelLaw,
        sourceUrl: sourceUrl,
        regulationType: '公告',
        title: title,
        fullText: null,
        publishDate: DateTime.now().toUtc().toIso8601String().split('T').first,
        effectiveDate: null,
        tags: _extractTags(title, null),
      ));
    }
    return entries;
  }

  Future<List<RegulationEntry>> _fetchTfdaNews() async {
    final keywords = ['營養標示', '食品標示', '食安法'];
    final entries = <RegulationEntry>[];
    for (final keyword in keywords) {
      const url = 'https://www.fda.gov.tw/TC/newsContent.aspx?cid=3&id=1';
      final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) continue;
      final document = html_parser.parse(response.body);
      final title = document.querySelector('title')?.text.trim() ?? 'TFDA 最新消息';
      final body = document.body?.text.trim();
      entries.add(_entry(
        source: RegulationSource.tfdNewsApi,
        sourceUrl: url,
        regulationType: '新聞',
        title: '$title - $keyword',
        fullText: body,
        publishDate: DateTime.now().toUtc().toIso8601String().split('T').first,
        effectiveDate: null,
        tags: '$keyword,TFDA,食品標示',
      ));
    }
    return entries;
  }

  Future<List<RegulationEntry>> _fetchSgsNews() async {
    const url = 'https://msn.sgs.com/News/FOOD';
    final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) return [];
    final document = html_parser.parse(response.body);
    final entries = <RegulationEntry>[];
    for (final link in document.querySelectorAll('a').take(15)) {
      final title = link.text.trim();
      if (!_isNutritionRelated(title)) continue;
      final href = link.attributes['href'] ?? url;
      final sourceUrl = href.startsWith('http') ? href : 'https://msn.sgs.com$href';
      entries.add(_entry(
        source: RegulationSource.sgsFoodNews,
        sourceUrl: sourceUrl,
        regulationType: '新聞',
        title: title,
        fullText: null,
        publishDate: DateTime.now().toUtc().toIso8601String().split('T').first,
        effectiveDate: null,
        tags: _extractTags(title, null),
      ));
    }
    return entries;
  }

  RegulationEntry _entry({
    required RegulationSource source,
    required String sourceUrl,
    required String regulationType,
    required String title,
    required String? fullText,
    required String? publishDate,
    required String? effectiveDate,
    required String tags,
  }) {
    final now = DateTime.now().toUtc().toIso8601String();
    return RegulationEntry(
      source: source,
      sourceUrl: sourceUrl,
      regulationType: regulationType,
      title: title,
      fullText: fullText,
      publishDate: publishDate,
      effectiveDate: effectiveDate,
      fetchedAt: now,
      dataVersion: publishDate ?? now,
      checksum: sha256.convert(utf8.encode('$title|${fullText ?? ''}|$sourceUrl')).toString(),
      tags: tags,
    );
  }

  String _buildMojFullText(Map<String, dynamic> data) {
    final buffer = StringBuffer();
    buffer.writeln(data['name']?.toString() ?? '食品安全衛生管理法');
    final articles = data['articles'];
    if (articles is List) {
      for (final article in articles) {
        if (article is Map<String, dynamic>) {
          buffer.writeln('${article['articleNo'] ?? ''} ${article['content'] ?? article['text'] ?? ''}');
        }
      }
    }
    return buffer.toString().trim();
  }

  bool _isNutritionRelated(String title) {
    return title.isNotEmpty && const ['營養', '標示', '食品', '食安', '添加物', '包裝'].any(title.contains);
  }

  String _extractTags(String title, String? fullText) {
    final content = '$title ${fullText ?? ''}';
    return ['營養標示', '食品標示', '食安法', '包裝食品', '食品添加物', '罰則'].where(content.contains).join(',');
  }

  List<RegulationEntry> _fallbackSeed() {
    return [
      _entry(
        source: RegulationSource.manualSeed,
        sourceUrl: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040001',
        regulationType: '法律',
        title: '食品安全衛生管理法',
        fullText: '離線備援全文，正式使用時可透過同步來源覆蓋。',
        publishDate: DateTime.now().toUtc().toIso8601String().split('T').first,
        effectiveDate: null,
        tags: '食安法,營養標示',
      ),
      _entry(
        source: RegulationSource.manualSeed,
        sourceUrl: 'https://www.foodlabel.org.tw/',
        regulationType: '公告',
        title: '包裝食品營養標示應遵行事項',
        fullText: '離線備援全文，正式使用時可透過同步來源覆蓋。',
        publishDate: DateTime.now().toUtc().toIso8601String().split('T').first,
        effectiveDate: null,
        tags: '營養標示,包裝食品',
      ),
    ];
  }
}
