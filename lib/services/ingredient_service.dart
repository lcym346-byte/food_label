import 'package:sqflite/sqflite.dart';

import '../models/ingredient.dart';
import 'database_helper.dart';
import 'seed_data.dart';

class IngredientService {
  IngredientService._();

  static final IngredientService instance = IngredientService._();
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<void> ensureSeeded() async {
    final db = await _dbHelper.database;
    final count = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM ingredients')) ?? 0;
    if (count == 0) {
      await seedBaseData(overwrite: true);
    }
    final additiveCount = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM food_additive')) ?? 0;
    if (additiveCount == 0) {
      await _seedAdditives();
    }
    final refCount = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM serving_reference')) ?? 0;
    if (refCount == 0) {
      await _seedServingReferences();
    }
  }

  Future<void> seedBaseData({bool overwrite = false}) async {
    final db = await _dbHelper.database;
    final now = DateTime.now().toUtc().toIso8601String();
    final ingredients = SeedData.ingredients(now);
    final batch = db.batch();
    for (final ingredient in ingredients) {
      batch.insert(
        'ingredients',
        ingredient.toMap(),
        conflictAlgorithm: overwrite ? ConflictAlgorithm.replace : ConflictAlgorithm.ignore,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> _seedAdditives() async {
    final db = await _dbHelper.database;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = db.batch();
    for (final item in SeedData.additives) {
      batch.insert('food_additive', {
        ...item,
        'source_url': 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040084',
        'fetched_at': now,
      });
    }
    await batch.commit(noResult: true);
  }

  Future<void> _seedServingReferences() async {
    final db = await _dbHelper.database;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = db.batch();
    for (final item in SeedData.servingReferences) {
      batch.insert('serving_reference', {
        ...item,
        'source_url': 'https://www.fda.gov.tw/tc/includes/GetFile.ashx?mID=19&id=21098&chk=ad7f40d5-27ef-4d73-8edc-27eca1fbd055',
        'fetched_at': now,
      });
    }
    await batch.commit(noResult: true);
  }

  Future<List<Ingredient>> listIngredients({String keyword = ''}) async {
    final db = await _dbHelper.database;
    final rows = keyword.trim().isEmpty
        ? await db.query('ingredients', orderBy: 'category ASC, name ASC')
        : await db.query(
            'ingredients',
            where: 'name LIKE ? OR category LIKE ? OR source LIKE ?',
            whereArgs: ['%$keyword%', '%$keyword%', '%$keyword%'],
            orderBy: 'category ASC, name ASC',
          );
    return rows.map(Ingredient.fromMap).toList();
  }

  Future<int> saveIngredient(Ingredient ingredient) async {
    final db = await _dbHelper.database;
    final map = ingredient.copyWith(updatedAt: DateTime.now().toUtc().toIso8601String()).toMap();
    if (ingredient.id == null) {
      return db.insert('ingredients', map, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await db.update('ingredients', map, where: 'id = ?', whereArgs: [ingredient.id]);
    return ingredient.id!;
  }

  Future<void> deleteIngredient(int id) async {
    final db = await _dbHelper.database;
    await db.delete('ingredients', where: 'id = ?', whereArgs: [id]);
  }

  Future<int> countIngredients() async {
    final db = await _dbHelper.database;
    return Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM ingredients')) ?? 0;
  }

  Future<List<Map<String, dynamic>>> listAdditives() async {
    final db = await _dbHelper.database;
    return db.query('food_additive', orderBy: 'category ASC, name_zh ASC');
  }

  Future<List<Map<String, dynamic>>> listServingReferences() async {
    final db = await _dbHelper.database;
    return db.query('serving_reference', orderBy: 'food_category ASC');
  }
}
