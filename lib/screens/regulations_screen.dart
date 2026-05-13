import 'package:flutter/material.dart';

import '../models/regulation_entry.dart';
import '../services/regulation_service.dart';
import '../services/sync_service.dart';
import 'regulation_detail_screen.dart';

class RegulationsScreen extends StatefulWidget {
  const RegulationsScreen({super.key});

  @override
  State<RegulationsScreen> createState() => _RegulationsScreenState();
}

class _RegulationsScreenState extends State<RegulationsScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _loading = true;
  bool _syncing = false;
  List<RegulationEntry> _items = const [];

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
    final items = await RegulationService.instance.listRegulations(keyword: _searchController.text.trim());
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    final result = await SyncService.instance.fullSync();
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('法規同步完成：新增 ${result.regulationReport?.newRecords ?? 0} 筆')),
    );
    setState(() => _syncing = false);
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
                  hintText: '搜尋營養標示、食安法、包裝食品',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(onPressed: _load, icon: const Icon(Icons.arrow_forward)),
                ),
                onSubmitted: (_) => _load(),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _syncing ? null : _sync,
                      icon: const Icon(Icons.sync),
                      label: Text(_syncing ? '同步中...' : '同步法規資料'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(onPressed: _load, icon: const Icon(Icons.refresh), label: const Text('重新載入')),
                  ),
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
                  child: _items.isEmpty
                      ? ListView(children: const [SizedBox(height: 120), Center(child: Text('目前沒有資料，請先同步。'))])
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final item = _items[index];
                            return ListTile(
                              title: Text(item.title),
                              subtitle: Text('${item.source.label}｜${item.regulationType}｜${item.publishDate ?? item.fetchedAt.split('T').first}'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RegulationDetailScreen(entry: item))),
                            );
                          },
                        ),
                ),
        ),
      ],
    );
  }
}
