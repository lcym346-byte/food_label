import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class DatabaseHelper {
  DatabaseHelper._();

  static final DatabaseHelper instance = DatabaseHelper._();
  static Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final path = join(await getDatabasesPath(), 'food_label_pro_complete.db');
    return openDatabase(path, version: 1, onCreate: _onCreate);
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL NOT NULL,
        fat REAL NOT NULL,
        saturated_fat REAL NOT NULL,
        trans_fat REAL NOT NULL,
        carbohydrate REAL NOT NULL,
        sugar REAL NOT NULL,
        sodium REAL NOT NULL,
        serving_ref_g REAL NOT NULL,
        note TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_custom INTEGER NOT NULL DEFAULT 0
      )
    ''');

    await db.execute('''
      CREATE TABLE recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        package_weight_g REAL NOT NULL,
        serving_size_g REAL NOT NULL,
        servings INTEGER NOT NULL,
        notes TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE recipe_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        grams REAL NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
        FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
      )
    ''');

    await db.execute('''
      CREATE TABLE regulation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_url TEXT,
        regulation_type TEXT,
        title TEXT NOT NULL,
        full_text TEXT,
        publish_date TEXT,
        effective_date TEXT,
        attachment_urls TEXT,
        fetched_at TEXT NOT NULL,
        data_version TEXT,
        checksum TEXT,
        tags TEXT,
        is_active INTEGER DEFAULT 1,
        is_deleted INTEGER DEFAULT 0
      )
    ''');
    await db.execute('CREATE UNIQUE INDEX idx_regulation_source_title ON regulation(source, title)');

    await db.execute('''
      CREATE VIRTUAL TABLE regulation_fts USING fts5(
        title,
        full_text,
        tags,
        content='regulation',
        content_rowid='id'
      )
    ''');

    await db.execute('''
      CREATE TRIGGER regulation_ai AFTER INSERT ON regulation BEGIN
        INSERT INTO regulation_fts(rowid, title, full_text, tags)
        VALUES (new.id, new.title, new.full_text, new.tags);
      END;
    ''');

    await db.execute('''
      CREATE TRIGGER regulation_ad AFTER DELETE ON regulation BEGIN
        INSERT INTO regulation_fts(regulation_fts, rowid, title, full_text, tags)
        VALUES ('delete', old.id, old.title, old.full_text, old.tags);
      END;
    ''');

    await db.execute('''
      CREATE TRIGGER regulation_au AFTER UPDATE ON regulation BEGIN
        INSERT INTO regulation_fts(regulation_fts, rowid, title, full_text, tags)
        VALUES ('delete', old.id, old.title, old.full_text, old.tags);
        INSERT INTO regulation_fts(rowid, title, full_text, tags)
        VALUES (new.id, new.title, new.full_text, new.tags);
      END;
    ''');

    await db.execute('''
      CREATE TABLE regulation_update_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        update_type TEXT,
        sources_checked TEXT,
        new_records INTEGER DEFAULT 0,
        updated_records INTEGER DEFAULT 0,
        deleted_records INTEGER DEFAULT 0,
        errors TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        triggered_by TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE food_additive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_zh TEXT,
        name_en TEXT,
        category TEXT,
        usage_limit TEXT,
        applicable_food TEXT,
        source_url TEXT,
        fetched_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE serving_reference (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_category TEXT,
        reference_serving TEXT,
        unit TEXT,
        source_url TEXT,
        fetched_at TEXT NOT NULL
      )
    ''');
  }
}
