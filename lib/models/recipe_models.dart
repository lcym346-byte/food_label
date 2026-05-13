import 'ingredient.dart';

class Recipe {
  final int? id;
  final String name;
  final double packageWeightG;
  final double servingSizeG;
  final int servings;
  final String notes;
  final String updatedAt;

  const Recipe({
    this.id,
    required this.name,
    required this.packageWeightG,
    required this.servingSizeG,
    required this.servings,
    required this.notes,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'package_weight_g': packageWeightG,
      'serving_size_g': servingSizeG,
      'servings': servings,
      'notes': notes,
      'updated_at': updatedAt,
    };
  }

  factory Recipe.fromMap(Map<String, dynamic> map) {
    return Recipe(
      id: map['id'] as int?,
      name: map['name']?.toString() ?? '',
      packageWeightG: (map['package_weight_g'] as num?)?.toDouble() ?? 0,
      servingSizeG: (map['serving_size_g'] as num?)?.toDouble() ?? 0,
      servings: (map['servings'] as num?)?.toInt() ?? 0,
      notes: map['notes']?.toString() ?? '',
      updatedAt: map['updated_at']?.toString() ?? '',
    );
  }
}

class RecipeItemEntry {
  final int? id;
  final int? recipeId;
  final Ingredient ingredient;
  final double grams;
  final int sortOrder;

  const RecipeItemEntry({
    this.id,
    this.recipeId,
    required this.ingredient,
    required this.grams,
    required this.sortOrder,
  });
}

class RecipeBundle {
  final Recipe recipe;
  final List<RecipeItemEntry> items;

  const RecipeBundle({required this.recipe, required this.items});
}
