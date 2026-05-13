import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/recipe_models.dart';
import '../services/recipe_service.dart';
import 'recipe_detail_screen.dart';
import 'recipe_editor_screen.dart';

class RecipesScreen extends StatefulWidget {
  const RecipesScreen({super.key});

  @override
  State<RecipesScreen> createState() => _RecipesScreenState();
}

class _RecipesScreenState extends State<RecipesScreen> {
  bool _loading = true;
  List<Recipe> _recipes = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final recipes = await RecipeService.instance.listRecipes();
    if (!mounted) return;
    setState(() {
      _recipes = recipes;
      _loading = false;
    });
  }

  Future<void> _openEditor([int? id]) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => RecipeEditorScreen(recipeId: id)));
    await _load();
  }

  Future<void> _openDetail(int id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => RecipeDetailScreen(recipeId: id)));
    await _load();
  }

  Future<void> _delete(int id) async {
    await RecipeService.instance.deleteRecipe(id);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: () => _openEditor(), icon: const Icon(Icons.add), label: const Text('新增配方')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _recipes.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Center(child: Text('尚未建立任何配方，請按右下角新增。')),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _recipes.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final recipe = _recipes[index];
                        final dt = DateTime.tryParse(recipe.updatedAt)?.toLocal();
                        return Card(
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(16),
                            title: Text(recipe.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text('總重 ${recipe.packageWeightG.toStringAsFixed(1)} g｜每份 ${recipe.servingSizeG.toStringAsFixed(1)} g｜${recipe.servings} 份\n更新 ${dt == null ? recipe.updatedAt : DateFormat('yyyy/MM/dd HH:mm').format(dt)}'),
                            isThreeLine: true,
                            onTap: () => _openDetail(recipe.id!),
                            trailing: PopupMenuButton<String>(
                              onSelected: (value) {
                                if (value == 'edit') _openEditor(recipe.id);
                                if (value == 'delete') _delete(recipe.id!);
                              },
                              itemBuilder: (context) => const [
                                PopupMenuItem(value: 'edit', child: Text('編輯')),
                                PopupMenuItem(value: 'delete', child: Text('刪除')),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
