import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';

import '../models/recipe_models.dart';
import 'nutrition_calculator.dart';

class PrinterService {
  PrinterService._();

  static final PrinterService instance = PrinterService._();
  final ThermalPrinterFlutter _thermalPrinter = ThermalPrinterFlutter();

  Future<List<Printer>> loadBluetoothPrinters() async {
    return _thermalPrinter.getPrinters(printerType: PrinterType.bluethoot);
  }

  Future<List<Printer>> discoverNetworkPrinters() async {
    return _thermalPrinter.discoverNetworkPrinters();
  }

  Printer buildNetworkPrinter({required String name, required String ip, String port = '9100'}) {
    return Printer(type: PrinterType.network, name: name, ip: ip, port: port);
  }

  Future<bool> connect(Printer printer) async {
    return _thermalPrinter.connect(printer: printer);
  }

  Future<bool> isConnected(Printer printer) async {
    return _thermalPrinter.isConnected(printer: printer);
  }

  Future<void> disconnect(Printer printer) async {
    await _thermalPrinter.disconnect(printer: printer);
  }

  Future<void> printTest(Printer printer) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(PaperSize.mm58, profile);
    List<int> bytes = [];
    bytes += generator.text('Food Label Pro', styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2));
    bytes += generator.text('Printer test OK', styles: const PosStyles(align: PosAlign.center));
    bytes += generator.text(DateTime.now().toString(), styles: const PosStyles(align: PosAlign.center));
    bytes += generator.feed(2);
    bytes += generator.cut();
    await _thermalPrinter.printBytes(bytes: bytes, printer: printer);
  }

  Future<void> printRecipeLabel({
    required Printer printer,
    required Recipe recipe,
    required NutritionSummary summary,
    required String labelType,
  }) async {
    final bytes = await buildRecipeLabelBytes(recipe: recipe, summary: summary, labelType: labelType);
    await _thermalPrinter.printBytes(bytes: bytes, printer: printer);
  }

  Future<List<int>> buildRecipeLabelBytes({
    required Recipe recipe,
    required NutritionSummary summary,
    required String labelType,
  }) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(PaperSize.mm58, profile);
    final perServing = summary.perServing(recipe.servingSizeG);
    final per100g = summary.per100g();

    List<int> bytes = [];
    bytes += generator.text(recipe.name, styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2));
    bytes += generator.text('TFDA 營養標示 $labelType 版', styles: const PosStyles(align: PosAlign.center));
    bytes += generator.hr();
    bytes += generator.text('每一份量 ${recipe.servingSizeG.toStringAsFixed(1)} 公克');
    bytes += generator.text('本包裝含 ${recipe.servings} 份');
    bytes += generator.hr();
    bytes += generator.row([
      PosColumn(text: '項目', width: 4, styles: const PosStyles(bold: true)),
      PosColumn(text: '每份', width: 4, styles: const PosStyles(align: PosAlign.center, bold: true)),
      PosColumn(text: '每100g', width: 4, styles: const PosStyles(align: PosAlign.right, bold: true)),
    ]);

    for (final key in NutritionSummary.labels) {
      bytes += generator.row([
        PosColumn(text: key, width: 4),
        PosColumn(text: NutritionCalculator.display(perServing[key] ?? 0), width: 4, styles: const PosStyles(align: PosAlign.center)),
        PosColumn(text: NutritionCalculator.display(per100g[key] ?? 0), width: 4, styles: const PosStyles(align: PosAlign.right)),
      ]);
    }

    bytes += generator.hr();
    bytes += generator.text('總配方重 ${summary.totalWeight.toStringAsFixed(1)} g');
    bytes += generator.feed(2);
    bytes += generator.cut();
    return bytes;
  }
}
