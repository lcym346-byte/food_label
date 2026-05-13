import 'package:flutter/material.dart';

import '../models/ingredient.dart';
import '../models/recipe_models.dart';
import '../services/ingredient_service.dart';
import '../services/nutrition_calculator.dart';
import '../services/recipe_service.dart';
import '../widgets/label_preview_card.dart';

class RecipeEditorScreen extends StatefulWidget {
  const RecipeEditorScreen({super.key, this.recipeId});

  final int? recipeId;

  @override
  State<RecipeEditorScreen> createState() => _RecipeEditorScreenState();
}

class _RecipeEditorScreenState extends State<RecipeEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _packageWeightController = TextEditingController(text: '100');
  final _servingSizeController = TextEditingController(text: '100');
  final _notesController = TextEditingController();
  List<Ingredient> _ingredients = const [];
  final List<_EditableItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _packageWeightController.dispose();
    _servingSizeController.dispose();
    _notesController.dispose();
    for (final item in _items) {
      item.gramsController.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final ingredients = await IngredientService.instance.listIngredients();
    final bundle = widget.recipeId == null ? null : await RecipeService.instance.getRecipeBundle(widget.recipeId!);

    _ingredients = ingredients;
    if (bundle != null) {
      _nameController.text = bundle.recipe.name;
      _packageWeightController.text = bundle.recipe.packageWeightG.toStringAsFixed(1);
      _servingSizeController.text = bundle.recipe.servingSizeG.toStringAsFixed(1);
      _notesController.text = bundle.recipe.notes;
      for (final item in bundle.items) {
        _items.add(_EditableItem(ingredient: item.ingredient, gramsController: TextEditingController(text: item.grams.toStringAsFixed(1))));
      }
    }

    if (_items.isEmpty && _ingredients.isNotEmpty) {
      _items.add(_EditableItem(ingredient: _ingredients.first, gramsController: TextEditingController(text: '100')));
    }

    if (!mounted) return;
    setState(() => _loading = false);
  }

  void _addItem() {
    if (_ingredients.isEmpty) return;
    setState(() {
      _items.add(_EditableItem(ingredient: _ingredients.first, gramsController: TextEditingController(text: '100')));
    });
  }

  List<RecipeItemEntry> _currentRecipeItems() {
    final result = <RecipeItemEntry>[];
    for (var i = 0; i < _items.length; i++) {
      final editable = _items[i];
      if (editable.ingredient == null) continue;
      result.add(RecipeItemEntry(ingredient: editable.ingredient!, grams: double.tryParse(editable.gramsController.text.trim()) ?? 0, sortOrder: i));
    }
    return result.where((item) => item.grams > 0).toList();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final items = _currentRecipeItems();
    if (items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('至少需要一筆有效食材')));
      return;
    }

    final packageWeight = double.tryParse(_packageWeightController.text.trim()) ?? 0;
    final servingSize = double.tryParse(_servingSizeController.text.trim()) ?? 0;
    final servings = servingSize <= 0 ? 1 : (packageWeight / servingSize).ceil();

    await RecipeService.instance.saveRecipeBundle(
      Recipe(
        id: widget.recipeId,
        name: _nameController.text.trim(),
        packageWeightG: packageWeight,
        servingSizeG: servingSize,
        servings: servings,
        notes: _notesController.text.trim(),
        updatedAt: DateTime.now().toUtc().toIso8601String(),
      ),
      items,
    );
    if (!mounted) return;
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final previewItems = _currentRecipeItems();
    final previewSummary = NutritionCalculator.calculate(previewItems);
    final servingSize = double.tryParse(_servingSizeController.text.trim()) ?? 100;
    final packageWeight = double.tryParse(_packageWeightController.text.trim()) ?? 100;
    final servings = servingSize <= 0 ? 1 : (packageWeight / servingSize).ceil();

    return Scaffold(
      appBar: AppBar(title: Text(widget.recipeId == null ? '新增配方' : '編輯配方')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _save, icon: const Icon(Icons.save_outlined), label: const Text('儲存')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: '配方名稱'),
              validator: (value) => (value == null || value.trim().isEmpty) ? '請輸入配方名稱' : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _packageWeightController,
                    decoration: const InputDecoration(labelText: '包裝總重量(g)'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _servingSizeController,
                    decoration: const InputDecoration(labelText: '每份重量(g)'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _notesController, decoration: const InputDecoration(labelText: '備註'), maxLines: 2),
            const SizedBox(height: 16),
            Row(
              children: [
                Text('食材明細', style: Theme.of(context).textTheme.titleLarge),
                const Spacer(),
                FilledButton.icon(onPressed: _addItem, icon: const Icon(Icons.add), label: const Text('新增食材列')),
              ],
            ),
            const SizedBox(height: 12),
            ..._items.asMap().entries.map((entry) {
              final index = entry.key;
              final item = entry.value;
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      DropdownButtonFormField<Ingredient>(
                        value: item.ingredient,
                        isExpanded: true,
                        items: _ingredients
                            .map((ingredient) => DropdownMenuItem(value: ingredient, child: Text('${ingredient.name}｜${ingredient.category}')))
                            .toList(),
                        onChanged: (value) => setState(() => item.ingredient = value),
                        decoration: InputDecoration(labelText: '食材 ${index + 1}'),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: item.gramsController,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(labelText: '重量(g)'),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 12),
                          IconButton(
                            onPressed: () {
                              setState(() {
                                item.gramsController.dispose();
                                _items.removeAt(index);
                                if (_items.isEmpty && _ingredients.isNotEmpty) {
                                  _items.add(_EditableItem(ingredient: _ingredients.first, gramsController: TextEditingController(text: '100')));
                                }
                              });
                            },
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 16),
            if (previewItems.isNotEmpty)
              LabelPreviewCard(summary: previewSummary, servingSize: servingSize <= 0 ? 100 : servingSize, servings: servings, labelType: 'A'),
          ],
        ),
      ),
    );
  }
}

class _EditableItem {
  _EditableItem({required this.ingredient, required this.gramsController});

  Ingredient? ingredient;
  TextEditingController gramsController;
}
