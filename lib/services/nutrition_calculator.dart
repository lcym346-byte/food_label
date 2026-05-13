import '../models/recipe_models.dart';

class NutritionSummary {
  final double totalWeight;
  final double calories;
  final double protein;
  final double fat;
  final double saturatedFat;
  final double transFat;
  final double carbohydrate;
  final double sugar;
  final double sodium;

  const NutritionSummary({
    required this.totalWeight,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.saturatedFat,
    required this.transFat,
    required this.carbohydrate,
    required this.sugar,
    required this.sodium,
  });

  static const labels = ['熱量', '蛋白質', '脂肪', '飽和脂肪', '反式脂肪', '碳水化合物', '糖', '鈉'];

  Map<String, double> perServing(double servingSize) {
    final ratio = totalWeight <= 0 || servingSize <= 0 ? 0 : servingSize / totalWeight;
    return {
      '熱量': calories * ratio,
      '蛋白質': protein * ratio,
      '脂肪': fat * ratio,
      '飽和脂肪': saturatedFat * ratio,
      '反式脂肪': transFat * ratio,
      '碳水化合物': carbohydrate * ratio,
      '糖': sugar * ratio,
      '鈉': sodium * ratio,
    };
  }

  Map<String, double> per100g() {
    final ratio = totalWeight <= 0 ? 0 : 100 / totalWeight;
    return {
      '熱量': calories * ratio,
      '蛋白質': protein * ratio,
      '脂肪': fat * ratio,
      '飽和脂肪': saturatedFat * ratio,
      '反式脂肪': transFat * ratio,
      '碳水化合物': carbohydrate * ratio,
      '糖': sugar * ratio,
      '鈉': sodium * ratio,
    };
  }
}

class NutritionCalculator {
  static NutritionSummary calculate(List<RecipeItemEntry> items) {
    double totalWeight = 0;
    double calories = 0;
    double protein = 0;
    double fat = 0;
    double saturatedFat = 0;
    double transFat = 0;
    double carbohydrate = 0;
    double sugar = 0;
    double sodium = 0;

    for (final item in items) {
      final ratio = item.grams / 100;
      totalWeight += item.grams;
      calories += item.ingredient.calories * ratio;
      protein += item.ingredient.protein * ratio;
      fat += item.ingredient.fat * ratio;
      saturatedFat += item.ingredient.saturatedFat * ratio;
      transFat += item.ingredient.transFat * ratio;
      carbohydrate += item.ingredient.carbohydrate * ratio;
      sugar += item.ingredient.sugar * ratio;
      sodium += item.ingredient.sodium * ratio;
    }

    return NutritionSummary(
      totalWeight: totalWeight,
      calories: calories,
      protein: protein,
      fat: fat,
      saturatedFat: saturatedFat,
      transFat: transFat,
      carbohydrate: carbohydrate,
      sugar: sugar,
      sodium: sodium,
    );
  }

  static String display(double value, {bool kcal = false}) {
    final normalized = value.abs() < 0.5 ? 0 : double.parse(value.toStringAsFixed(1));
    return kcal ? '${normalized.toStringAsFixed(normalized % 1 == 0 ? 0 : 1)} kcal' : normalized.toStringAsFixed(normalized % 1 == 0 ? 0 : 1);
  }
}
