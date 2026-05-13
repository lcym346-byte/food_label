import 'package:flutter/material.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';

import '../models/recipe_models.dart';
import '../services/nutrition_calculator.dart';
import '../services/printer_service.dart';
import '../services/printer_session.dart';
import '../services/recipe_service.dart';
import '../widgets/label_preview_card.dart';
import 'recipe_editor_screen.dart';

class RecipeDetailScreen extends StatefulWidget {
  const RecipeDetailScreen({super.key, required this.recipeId});

  final int recipeId;

  @override
  State<RecipeDetailScreen> createState() => _RecipeDetailScreenState();
}

class _RecipeDetailScreenState extends State<RecipeDetailScreen> {
  RecipeBundle? _bundle;
  bool _loading = true;
  String _labelType = 'A';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final bundle = await RecipeService.instance.getRecipeBundle(widget.recipeId);
    if (!mounted) return;
    setState(() {
      _bundle = bundle;
      _loading = false;
    });
  }

  Future<void> _edit() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => RecipeEditorScreen(recipeId: widget.recipeId)));
    await _load();
  }

  Future<void> _print() async {
    final bundle = _bundle;
    final printer = PrinterSession.selectedPrinter.value;
    if (bundle == null) return;
    if (printer == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請先到設定頁連接印表機')));
      return;
    }
    final summary = NutritionCalculator.calculate(bundle.items);
    await PrinterService.instance.printRecipeLabel(printer: printer, recipe: bundle.recipe, summary: summary, labelType: _labelType);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已送出列印')));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final bundle = _bundle;
    if (bundle == null) return const Scaffold(body: Center(child: Text('找不到配方資料')));

    final summary = NutritionCalculator.calculate(bundle.items);

    return Scaffold(
      appBar: AppBar(
        title: Text(bundle.recipe.name),
        actions: [
          IconButton(onPressed: _edit, icon: const Icon(Icons.edit_outlined)),
          IconButton(onPressed: _print, icon: const Icon(Icons.print_outlined)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  Chip(label: Text('總重 ${bundle.recipe.packageWeightG.toStringAsFixed(1)} g')),
                  Chip(label: Text('每份 ${bundle.recipe.servingSizeG.toStringAsFixed(1)} g')),
                  Chip(label: Text('${bundle.recipe.servings} 份')),
                  if (PrinterSession.selectedPrinter.value != null)
                    Chip(label: Text('已選擇印表機：${PrinterSession.selectedPrinter.value?.name ?? 'Unknown'}')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'A', label: Text('A版')),
              ButtonSegment(value: 'B', label: Text('B版')),
            ],
            selected: {_labelType},
            onSelectionChanged: (value) => setState(() => _labelType = value.first),
          ),
          const SizedBox(height: 12),
          LabelPreviewCard(summary: summary, servingSize: bundle.recipe.servingSizeG, servings: bundle.recipe.servings, labelType: _labelType),
          const SizedBox(height: 16),
          Text('配方明細', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          ...bundle.items.map(
            (item) => Card(
              child: ListTile(
                title: Text(item.ingredient.name),
                subtitle: Text('${item.ingredient.category}｜${item.grams.toStringAsFixed(1)} g'),
                trailing: Text('${NutritionCalculator.display(item.ingredient.calories * item.grams / 100, kcal: true)}'),
              ),
            ),
          ),
          if (bundle.recipe.notes.trim().isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('備註', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(bundle.recipe.notes),
          ],
        ],
      ),
    );
  }
}
