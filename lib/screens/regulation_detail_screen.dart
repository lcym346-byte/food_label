import 'package:flutter/material.dart';

import '../models/regulation_entry.dart';

class RegulationDetailScreen extends StatelessWidget {
  const RegulationDetailScreen({super.key, required this.entry});

  final RegulationEntry entry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('法規明細')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(entry.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(label: Text(entry.source.label)),
              Chip(label: Text(entry.regulationType)),
              Chip(label: Text(entry.publishDate ?? '未標示日期')),
            ],
          ),
          const SizedBox(height: 12),
          SelectableText('來源網址：${entry.sourceUrl}'),
          SelectableText('抓取時間：${entry.fetchedAt}'),
          if ((entry.effectiveDate ?? '').isNotEmpty) SelectableText('生效日期：${entry.effectiveDate}'),
          const SizedBox(height: 16),
          Text(entry.fullText?.trim().isNotEmpty == true ? entry.fullText! : '目前僅同步到標題與來源資訊，可再次同步或從來源網址查看。'),
        ],
      ),
    );
  }
}
