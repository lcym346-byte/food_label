class Ingredient {
  final int? id;
  final String code;
  final String name;
  final String category;
  final String source;
  final double calories;
  final double protein;
  final double fat;
  final double saturatedFat;
  final double transFat;
  final double carbohydrate;
  final double sugar;
  final double sodium;
  final double servingRefG;
  final String note;
  final String updatedAt;
  final bool isCustom;

  const Ingredient({
    this.id,
    required this.code,
    required this.name,
    required this.category,
    required this.source,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.saturatedFat,
    required this.transFat,
    required this.carbohydrate,
    required this.sugar,
    required this.sodium,
    required this.servingRefG,
    required this.note,
    required this.updatedAt,
    required this.isCustom,
  });

  Ingredient copyWith({
    int? id,
    String? code,
    String? name,
    String? category,
    String? source,
    double? calories,
    double? protein,
    double? fat,
    double? saturatedFat,
    double? transFat,
    double? carbohydrate,
    double? sugar,
    double? sodium,
    double? servingRefG,
    String? note,
    String? updatedAt,
    bool? isCustom,
  }) {
    return Ingredient(
      id: id ?? this.id,
      code: code ?? this.code,
      name: name ?? this.name,
      category: category ?? this.category,
      source: source ?? this.source,
      calories: calories ?? this.calories,
      protein: protein ?? this.protein,
      fat: fat ?? this.fat,
      saturatedFat: saturatedFat ?? this.saturatedFat,
      transFat: transFat ?? this.transFat,
      carbohydrate: carbohydrate ?? this.carbohydrate,
      sugar: sugar ?? this.sugar,
      sodium: sodium ?? this.sodium,
      servingRefG: servingRefG ?? this.servingRefG,
      note: note ?? this.note,
      updatedAt: updatedAt ?? this.updatedAt,
      isCustom: isCustom ?? this.isCustom,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'code': code,
      'name': name,
      'category': category,
      'source': source,
      'calories': calories,
      'protein': protein,
      'fat': fat,
      'saturated_fat': saturatedFat,
      'trans_fat': transFat,
      'carbohydrate': carbohydrate,
      'sugar': sugar,
      'sodium': sodium,
      'serving_ref_g': servingRefG,
      'note': note,
      'updated_at': updatedAt,
      'is_custom': isCustom ? 1 : 0,
    };
  }

  factory Ingredient.fromMap(Map<String, dynamic> map) {
    return Ingredient(
      id: map['id'] as int?,
      code: map['code']?.toString() ?? '',
      name: map['name']?.toString() ?? '',
      category: map['category']?.toString() ?? '',
      source: map['source']?.toString() ?? '',
      calories: (map['calories'] as num?)?.toDouble() ?? 0,
      protein: (map['protein'] as num?)?.toDouble() ?? 0,
      fat: (map['fat'] as num?)?.toDouble() ?? 0,
      saturatedFat: (map['saturated_fat'] as num?)?.toDouble() ?? 0,
      transFat: (map['trans_fat'] as num?)?.toDouble() ?? 0,
      carbohydrate: (map['carbohydrate'] as num?)?.toDouble() ?? 0,
      sugar: (map['sugar'] as num?)?.toDouble() ?? 0,
      sodium: (map['sodium'] as num?)?.toDouble() ?? 0,
      servingRefG: (map['serving_ref_g'] as num?)?.toDouble() ?? 100,
      note: map['note']?.toString() ?? '',
      updatedAt: map['updated_at']?.toString() ?? '',
      isCustom: ((map['is_custom'] as num?)?.toInt() ?? 0) == 1,
    );
  }
}
