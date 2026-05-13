import 'package:sqflite/sqflite.dart';

import '../models/ingredient.dart';
import '../models/recipe_models.dart';
import 'database_helper.dart';

class RecipeService {
  RecipeService._();

  static final RecipeService instance = RecipeService._();
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<List<Recipe>> listRecipes() async {
    final db = await _dbHelper.database;
    final rows = await db.query('recipes', orderBy: 'updated_at DESC');
    return rows.map(Recipe.fromMap).toList();
  }

  Future<RecipeBundle?> getRecipeBundle(int recipeId) async {
    final db = await _dbHelper.database;
    final recipes = await db.query('recipes', where: 'id = ?', whereArgs: [recipeId], limit: 1);
    if (recipes.isEmpty) return null;
    final recipe = Recipe.fromMap(recipes.first);
    final rows = await db.rawQuery('''
      SELECT ri.id AS recipe_item_id, ri.recipe_id, ri.grams, ri.sort_order,
             i.*
      FROM recipe_items ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
      ORDER BY ri.sort_order ASC, ri.id ASC
    ''', [recipeId]);

    final items = rows.map((row) {
      final ingredientMap = Map<String, dynamic>.from(row)
        ..remove('recipe_item_id')
        ..remove('recipe_id')
        ..remove('grams')
        ..remove('sort_order');
      return RecipeItemEntry(
        id: (row['recipe_item_id'] as num?)?.toInt(),
        recipeId: (row['recipe_id'] as num?)?.toInt(),
        ingredient: Ingredient.fromMap(ingredientMap),
        grams: (row['grams'] as num?)?.toDouble() ?? 0,
        sortOrder: (row['sort_order'] as num?)?.toInt() ?? 0,
      );
    }).toList();

    return RecipeBundle(recipe: recipe, items: items);
  }

  Future<int> saveRecipeBundle(Recipe recipe, List<RecipeItemEntry> items) async {
    final db = await _dbHelper.database;
    return db.transaction<int>((txn) async {
      final now = DateTime.now().toUtc().toIso8601String();
      final recipeMap = Recipe(
        id: recipe.id,
        name: recipe.name,
        packageWeightG: recipe.packageWeightG,
        servingSizeG: recipe.servingSizeG,
        servings: recipe.servings,
        notes: recipe.notes,
        updatedAt: now,
      ).toMap();

      int recipeId;
      if (recipe.id == null) {
        recipeId = await txn.insert('recipes', recipeMap, conflictAlgorithm: ConflictAlgorithm.replace);
      } else {
        await txn.update('recipes', recipeMap, where: 'id = ?', whereArgs: [recipe.id]);
        recipeId = recipe.id!;
        await txn.delete('recipe_items', where: 'recipe_id = ?', whereArgs: [recipeId]);
      }

      for (var index = 0; index < items.length; index++) {
        await txn.insert('recipe_items', {
          'recipe_id': recipeId,
          'ingredient_id': items[index].ingredient.id,
          'grams': items[index].grams,
          'sort_order': index,
        });
      }
      return recipeId;
    });
  }

  Future<void> deleteRecipe(int recipeId) async {
    final db = await _dbHelper.database;
    await db.transaction((txn) async {
      await txn.delete('recipe_items', where: 'recipe_id = ?', whereArgs: [recipeId]);
      await txn.delete('recipes', where: 'id = ?', whereArgs: [recipeId]);
    });
  }

  Future<int> countRecipes() async {
    final db = await _dbHelper.database;
    return Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM recipes')) ?? 0;
  }
}
