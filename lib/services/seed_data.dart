import '../models/ingredient.dart';

class SeedData {
  static List<Ingredient> ingredients(String now) => [
        Ingredient(code: 'TFDA_RICE', name: '白飯', category: '穀物類', source: 'TFDA_SEED', calories: 183, protein: 3.1, fat: 0.3, saturatedFat: 0.1, transFat: 0, carbohydrate: 40.6, sugar: 0.1, sodium: 1, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_BROWN_RICE', name: '糙米飯', category: '穀物類', source: 'TFDA_SEED', calories: 177, protein: 3.5, fat: 1.0, saturatedFat: 0.2, transFat: 0, carbohydrate: 36.7, sugar: 0.2, sodium: 2, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_CHICKEN_BREAST', name: '雞胸肉', category: '肉類', source: 'TFDA_SEED', calories: 165, protein: 31.0, fat: 3.6, saturatedFat: 1.0, transFat: 0, carbohydrate: 0, sugar: 0, sodium: 74, servingRefG: 100, note: '去皮熟重', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_PORK', name: '豬里肌', category: '肉類', source: 'TFDA_SEED', calories: 143, protein: 22.0, fat: 5.0, saturatedFat: 1.7, transFat: 0, carbohydrate: 0, sugar: 0, sodium: 57, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_SALMON', name: '鮭魚', category: '魚類', source: 'TFDA_SEED', calories: 208, protein: 20.4, fat: 13.4, saturatedFat: 3.1, transFat: 0.1, carbohydrate: 0, sugar: 0, sodium: 59, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_SHRIMP', name: '蝦仁', category: '海鮮類', source: 'TFDA_SEED', calories: 99, protein: 24.0, fat: 0.3, saturatedFat: 0.1, transFat: 0, carbohydrate: 0.2, sugar: 0, sodium: 111, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_EGG', name: '雞蛋', category: '蛋類', source: 'TFDA_SEED', calories: 143, protein: 12.6, fat: 9.5, saturatedFat: 3.1, transFat: 0.1, carbohydrate: 1.1, sugar: 1.1, sodium: 142, servingRefG: 50, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_WHOLE_MILK', name: '全脂牛奶', category: '乳品類', source: 'TFDA_SEED', calories: 61, protein: 3.2, fat: 3.3, saturatedFat: 2.1, transFat: 0.1, carbohydrate: 4.8, sugar: 5.0, sodium: 43, servingRefG: 240, note: '每100毫升換算近似', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_YOGURT', name: '原味優格', category: '乳品類', source: 'TFDA_SEED', calories: 63, protein: 5.3, fat: 1.6, saturatedFat: 1.0, transFat: 0.0, carbohydrate: 7.0, sugar: 6.5, sodium: 70, servingRefG: 150, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_TOFU', name: '板豆腐', category: '豆類', source: 'TFDA_SEED', calories: 76, protein: 8.0, fat: 4.8, saturatedFat: 0.7, transFat: 0, carbohydrate: 1.9, sugar: 0.6, sodium: 7, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_SOYMILK', name: '無糖豆漿', category: '豆類', source: 'TFDA_SEED', calories: 33, protein: 3.0, fat: 1.7, saturatedFat: 0.3, transFat: 0, carbohydrate: 1.6, sugar: 0.7, sodium: 20, servingRefG: 240, note: '每100毫升換算近似', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_FLOUR', name: '麵粉', category: '穀物類', source: 'TFDA_SEED', calories: 364, protein: 10.3, fat: 1.0, saturatedFat: 0.2, transFat: 0, carbohydrate: 76.3, sugar: 0.3, sodium: 2, servingRefG: 30, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_SUGAR', name: '砂糖', category: '調味料', source: 'TFDA_SEED', calories: 387, protein: 0, fat: 0, saturatedFat: 0, transFat: 0, carbohydrate: 100, sugar: 100, sodium: 1, servingRefG: 5, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_SALT', name: '食鹽', category: '調味料', source: 'TFDA_SEED', calories: 0, protein: 0, fat: 0, saturatedFat: 0, transFat: 0, carbohydrate: 0, sugar: 0, sodium: 38758, servingRefG: 1, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_SOY_SAUCE', name: '醬油', category: '調味料', source: 'TFDA_SEED', calories: 53, protein: 8.1, fat: 0.1, saturatedFat: 0, transFat: 0, carbohydrate: 4.9, sugar: 0.4, sodium: 5490, servingRefG: 10, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_OLIVE_OIL', name: '橄欖油', category: '油脂類', source: 'TFDA_SEED', calories: 884, protein: 0, fat: 100, saturatedFat: 14, transFat: 0, carbohydrate: 0, sugar: 0, sodium: 2, servingRefG: 10, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_BUTTER', name: '奶油', category: '油脂類', source: 'TFDA_SEED', calories: 717, protein: 0.9, fat: 81.1, saturatedFat: 51.4, transFat: 3.3, carbohydrate: 0.1, sugar: 0.1, sodium: 11, servingRefG: 10, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_APPLE', name: '蘋果', category: '水果類', source: 'TFDA_SEED', calories: 52, protein: 0.3, fat: 0.2, saturatedFat: 0, transFat: 0, carbohydrate: 14.0, sugar: 10.4, sodium: 1, servingRefG: 130, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_BANANA', name: '香蕉', category: '水果類', source: 'TFDA_SEED', calories: 89, protein: 1.1, fat: 0.3, saturatedFat: 0.1, transFat: 0, carbohydrate: 22.8, sugar: 12.2, sodium: 1, servingRefG: 120, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_BROCCOLI', name: '青花菜', category: '蔬菜類', source: 'TFDA_SEED', calories: 34, protein: 2.8, fat: 0.4, saturatedFat: 0.1, transFat: 0, carbohydrate: 6.6, sugar: 1.7, sodium: 33, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_CABBAGE', name: '高麗菜', category: '蔬菜類', source: 'TFDA_SEED', calories: 25, protein: 1.3, fat: 0.1, saturatedFat: 0, transFat: 0, carbohydrate: 5.8, sugar: 3.2, sodium: 18, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_POTATO', name: '馬鈴薯', category: '蔬菜類', source: 'TFDA_SEED', calories: 77, protein: 2.0, fat: 0.1, saturatedFat: 0, transFat: 0, carbohydrate: 17.0, sugar: 0.8, sodium: 6, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_CORN', name: '玉米粒', category: '蔬菜類', source: 'TFDA_SEED', calories: 86, protein: 3.3, fat: 1.4, saturatedFat: 0.2, transFat: 0, carbohydrate: 19.0, sugar: 3.2, sodium: 15, servingRefG: 100, note: '每100公克', updatedAt: now, isCustom: false),
        Ingredient(code: 'TFDA_OAT', name: '燕麥片', category: '穀物類', source: 'TFDA_SEED', calories: 389, protein: 16.9, fat: 6.9, saturatedFat: 1.2, transFat: 0, carbohydrate: 66.3, sugar: 0.9, sodium: 2, servingRefG: 40, note: '每100公克', updatedAt: now, isCustom: false),
      ];

  static const List<Map<String, String>> additives = [
    {'name_zh': '己二烯酸', 'name_en': 'Sorbic Acid', 'category': '防腐劑', 'usage_limit': '依食品類別限制', 'applicable_food': '烘焙、加工食品'},
    {'name_zh': '檸檬酸', 'name_en': 'Citric Acid', 'category': '酸味劑', 'usage_limit': '依食品類別限制', 'applicable_food': '飲料、糖果'},
    {'name_zh': '卵磷脂', 'name_en': 'Lecithin', 'category': '乳化劑', 'usage_limit': '依食品類別限制', 'applicable_food': '烘焙、乳製品'},
  ];

  static const List<Map<String, String>> servingReferences = [
    {'food_category': '飲料', 'reference_serving': '240', 'unit': 'mL'},
    {'food_category': '餅乾', 'reference_serving': '30', 'unit': 'g'},
    {'food_category': '穀粉沖泡品', 'reference_serving': '35', 'unit': 'g'},
    {'food_category': '乳品', 'reference_serving': '240', 'unit': 'mL'},
    {'food_category': '醬料', 'reference_serving': '15', 'unit': 'g'},
  ];
}
