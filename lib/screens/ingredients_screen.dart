import 'package:flutter/material.dart';

import '../models/ingredient.dart';
import '../services/ingredient_service.dart';
import '../services/nutrition_calculator.dart';

class IngredientsScreen extends StatefulWidget {
  const IngredientsScreen({super.key});

  @override
  State<IngredientsScreen> createState() => _IngredientsScreenState();
}

class _IngredientsScreenState extends State<IngredientsScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _loading = true;
  List<Ingredient> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final items = await IngredientService.instance.listIngredients(keyword: _searchController.text.trim());
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  Future<void> _seed() async {
    await IngredientService.instance.seedBaseData(overwrite: false);
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已補齊內建食材資料')));
  }

  Future<void> _openEditor([Ingredient? ingredient]) async {
    final nameController = TextEditingController(text: ingredient?.name ?? '');
    final categoryController = TextEditingController(text: ingredient?.category ?? '');
    final sourceController = TextEditingController(text: ingredient?.source ?? 'CUSTOM');
    final caloriesController = TextEditingController(text: ingredient?.calories.toString() ?? '0');
    final proteinController = TextEditingController(text: ingredient?.protein.toString() ?? '0');
    final fatController = TextEditingController(text: ingredient?.fat.toString() ?? '0');
    final saturatedFatController = TextEditingController(text: ingredient?.saturatedFat.toString() ?? '0');
    final transFatController = TextEditingController(text: ingredient?.transFat.toString() ?? '0');
    final carbohydrateController = TextEditingController(text: ingredient?.carbohydrate.toString() ?? '0');
    final sugarController = TextEditingController(text: ingredient?.sugar.toString() ?? '0');
    final sodiumController = TextEditingController(text: ingredient?.sodium.toString() ?? '0');
    final servingRefController = TextEditingController(text: ingredient?.servingRefG.toString() ?? '100');
    final noteController = TextEditingController(text: ingredient?.note ?? '每100公克');

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(ingredient == null ? '新增食材' : '編輯食材'),
        content: SizedBox(
          width: 560,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameController, decoration: const InputDecoration(labelText: '名稱')),
                TextField(controller: categoryController, decoration: const InputDecoration(labelText: '分類')),
                TextField(controller: sourceController, decoration: const InputDecoration(labelText: '來源')),
                TextField(controller: caloriesController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '熱量')),
                TextField(controller: proteinController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '蛋白質')),
                TextField(controller: fatController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '脂肪')),
                TextField(controller: saturatedFatController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '飽和脂肪')),
                TextField(controller: transFatController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '反式脂肪')),
                TextField(controller: carbohydrateController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '碳水化合物')),
                TextField(controller: sugarController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '糖')),
                TextField(controller: sodiumController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '鈉')),
                TextField(controller: servingRefController, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '參考份量(g)')),
                TextField(controller: noteController, decoration: const InputDecoration(labelText: '備註')),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
          FilledButton(
            onPressed: () async {
              final name = nameController.text.trim();
              if (name.isEmpty) return;
              final now = DateTime.now().toUtc().toIso8601String();
              final code = ingredient?.code ?? 'CUSTOM_${DateTime.now().millisecondsSinceEpoch}';
              await IngredientService.instance.saveIngredient(
                Ingredient(
                  id: ingredient?.id,
                  code: code,
                  name: name,
                  category: categoryController.text.trim().isEmpty ? '自訂' : categoryController.text.trim(),
                  source: sourceController.text.trim().isEmpty ? 'CUSTOM' : sourceController.text.trim(),
                  calories: double.tryParse(caloriesController.text.trim()) ?? 0,
                  protein: double.tryParse(proteinController.text.trim()) ?? 0,
                  fat: double.tryParse(fatController.text.trim()) ?? 0,
                  saturatedFat: double.tryParse(saturatedFatController.text.trim()) ?? 0,
                  transFat: double.tryParse(transFatController.text.trim()) ?? 0,
                  carbohydrate: double.tryParse(carbohydrateController.text.trim()) ?? 0,
                  sugar: double.tryParse(sugarController.text.trim()) ?? 0,
                  sodium: double.tryParse(sodiumController.text.trim()) ?? 0,
                  servingRefG: double.tryParse(servingRefController.text.trim()) ?? 100,
                  note: noteController.text.trim(),
                  updatedAt: now,
                  isCustom: true,
                ),
              );
              if (!mounted) return;
              Navigator.pop(context);
              await _load();
            },
            child: const Text('儲存'),
          ),
        ],
      ),
    );
  }

  Future<void> _delete(Ingredient ingredient) async {
    if (ingredient.id == null) return;
    await IngredientService.instance.deleteIngredient(ingredient.id!);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            children: [
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: '搜尋食材、分類或來源',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(onPressed: _load, icon: const Icon(Icons.arrow_forward)),
                ),
                onSubmitted: (_) => _load(),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  FilledButton.icon(onPressed: () => _openEditor(), icon: const Icon(Icons.add), label: const Text('新增自訂食材')),
                  OutlinedButton.icon(onPressed: _seed, icon: const Icon(Icons.download_done_outlined), label: const Text('補齊內建資料')),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = _items[index];
                      return ListTile(
                        title: Text(item.name),
                        subtitle: Text('${item.category}｜${item.source}｜熱量 ${NutritionCalculator.display(item.calories, kcal: true)} / 100g'),
                        trailing: Wrap(
                          spacing: 4,
                          children: [
                            IconButton(onPressed: () => _openEditor(item), icon: const Icon(Icons.edit_outlined)),
                            IconButton(onPressed: () => _delete(item), icon: const Icon(Icons.delete_outline)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}
