import 'package:flutter/material.dart';

import '../services/nutrition_calculator.dart';

class LabelPreviewCard extends StatelessWidget {
  const LabelPreviewCard({
    super.key,
    required this.summary,
    required this.servingSize,
    required this.servings,
    required this.labelType,
  });

  final NutritionSummary summary;
  final double servingSize;
  final int servings;
  final String labelType;

  @override
  Widget build(BuildContext context) {
    final perServing = summary.perServing(servingSize);
    final per100g = summary.per100g();

    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFDDE7EE))),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('TFDA 營養標示 ${labelType}版', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('每一份量 ${servingSize.toStringAsFixed(1)} 公克'),
            Text('本包裝含 $servings 份'),
            const SizedBox(height: 12),
            Table(
              border: TableBorder.all(color: const Color(0xFFE5E7EB)),
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              children: [
                const TableRow(
                  decoration: BoxDecoration(color: Color(0xFFF1F5F9)),
                  children: [
                    Padding(padding: EdgeInsets.all(8), child: Text('項目', style: TextStyle(fontWeight: FontWeight.bold))),
                    Padding(padding: EdgeInsets.all(8), child: Text('每份', style: TextStyle(fontWeight: FontWeight.bold))),
                    Padding(padding: EdgeInsets.all(8), child: Text('每100公克', style: TextStyle(fontWeight: FontWeight.bold))),
                  ],
                ),
                ...NutritionSummary.labels.map(
                  (key) => TableRow(
                    children: [
                      Padding(padding: const EdgeInsets.all(8), child: Text(key)),
                      Padding(padding: const EdgeInsets.all(8), child: Text(NutritionCalculator.display(perServing[key] ?? 0, kcal: key == '熱量'))),
                      Padding(padding: const EdgeInsets.all(8), child: Text(NutritionCalculator.display(per100g[key] ?? 0, kcal: key == '熱量'))),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
