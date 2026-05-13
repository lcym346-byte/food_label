import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/ingredient_service.dart';
import '../services/recipe_service.dart';
import '../services/regulation_service.dart';
import '../services/sync_service.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  bool _syncing = false;
  int _ingredientCount = 0;
  int _recipeCount = 0;
  int _regulationCount = 0;
  String? _lastSyncAt;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final ingredientCount = await IngredientService.instance.countIngredients();
    final recipeCount = await RecipeService.instance.countRecipes();
    final regulationCount = await RegulationService.instance.countRegulations();
    final lastSyncAt = await SyncService.instance.lastSyncAt();
    if (!mounted) return;
    setState(() {
      _ingredientCount = ingredientCount;
      _recipeCount = recipeCount;
      _regulationCount = regulationCount;
      _lastSyncAt = lastSyncAt;
      _loading = false;
    });
  }

  Future<void> _syncNow() async {
    setState(() => _syncing = true);
    final result = await SyncService.instance.fullSync();
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('同步完成：食材 ${result.ingredientCount} 筆、法規新增 ${result.regulationReport?.newRecords ?? 0} 筆')),
    );
    setState(() => _syncing = false);
  }

  String _formatDate(String? value) {
    if (value == null) return '尚未同步';
    final dt = DateTime.tryParse(value)?.toLocal();
    if (dt == null) return value;
    return DateFormat('yyyy/MM/dd HH:mm').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: const Color(0xFF0F172A),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('食品標示與法規助手', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('最近同步：${_formatDate(_lastSyncAt)}', style: const TextStyle(color: Color(0xFFCBD5E1))),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _syncing ? null : _syncNow,
                    icon: const Icon(Icons.sync),
                    label: Text(_syncing ? '同步中...' : '立即同步資料'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.35,
            children: [
              _StatCard(title: '食材資料', value: '$_ingredientCount', hint: 'SQLite 離線可查', icon: Icons.kitchen_outlined),
              _StatCard(title: '已存配方', value: '$_recipeCount', hint: '可直接產出標示', icon: Icons.receipt_long_outlined),
              _StatCard(title: '法規資料', value: '$_regulationCount', hint: '支援全文搜尋', icon: Icons.gavel_outlined),
              _StatCard(title: '更新策略', value: '48h', hint: '啟動時自動檢查', icon: Icons.schedule_outlined),
            ],
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.kitchen_outlined),
                  title: const Text('管理食材資料庫'),
                  subtitle: const Text('新增自訂食材、查詢八大營養素'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => widget.onNavigate(1),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: const Text('建立配方與標示'),
                  subtitle: const Text('儲存配方、生成 A/B 版標示並列印'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => widget.onNavigate(2),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.gavel_outlined),
                  title: const Text('查詢食安法規'),
                  subtitle: const Text('同步 TFDA / 食品標示平台 / 全國法規'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => widget.onNavigate(3),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.print_outlined),
                  title: const Text('設定熱感印表機'),
                  subtitle: const Text('搜尋藍牙或新增網路印表機'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => widget.onNavigate(4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.title, required this.value, required this.hint, required this.icon});

  final String title;
  final String value;
  final String hint;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const Spacer(),
            Text(value, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(hint, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
