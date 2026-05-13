import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';

import '../services/ingredient_service.dart';
import '../services/printer_service.dart';
import '../services/printer_session.dart';
import '../services/sync_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _loading = true;
  bool _discoveringBluetooth = false;
  bool _discoveringNetwork = false;
  List<Printer> _bluetoothPrinters = const [];
  List<Printer> _networkPrinters = const [];
  List<Map<String, dynamic>> _additives = const [];
  List<Map<String, dynamic>> _servingRefs = const [];
  String? _lastSyncAt;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final additives = await IngredientService.instance.listAdditives();
    final servingRefs = await IngredientService.instance.listServingReferences();
    final lastSyncAt = await SyncService.instance.lastSyncAt();
    if (!mounted) return;
    setState(() {
      _additives = additives;
      _servingRefs = servingRefs;
      _lastSyncAt = lastSyncAt;
      _loading = false;
    });
  }

  String _formatDate(String? value) {
    if (value == null) return '尚未同步';
    final dt = DateTime.tryParse(value)?.toLocal();
    if (dt == null) return value;
    return DateFormat('yyyy/MM/dd HH:mm').format(dt);
  }

  Future<void> _discoverBluetooth() async {
    setState(() => _discoveringBluetooth = true);
    try {
      final printers = await PrinterService.instance.loadBluetoothPrinters();
      if (!mounted) return;
      setState(() => _bluetoothPrinters = printers);
    } finally {
      if (mounted) setState(() => _discoveringBluetooth = false);
    }
  }

  Future<void> _discoverNetwork() async {
    setState(() => _discoveringNetwork = true);
    try {
      final printers = await PrinterService.instance.discoverNetworkPrinters();
      if (!mounted) return;
      setState(() => _networkPrinters = printers);
    } finally {
      if (mounted) setState(() => _discoveringNetwork = false);
    }
  }

  Future<void> _connectPrinter(Printer printer) async {
    final ok = await PrinterService.instance.connect(printer);
    if (!mounted) return;
    if (ok) {
      PrinterSession.selectedPrinter.value = printer;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已連接 ${printer.name}')));
      setState(() {});
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('無法連接 ${printer.name}')));
    }
  }

  Future<void> _disconnectPrinter() async {
    final printer = PrinterSession.selectedPrinter.value;
    if (printer == null) return;
    await PrinterService.instance.disconnect(printer);
    PrinterSession.selectedPrinter.value = null;
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已中斷印表機連線')));
    setState(() {});
  }

  Future<void> _testPrint() async {
    final printer = PrinterSession.selectedPrinter.value;
    if (printer == null) return;
    await PrinterService.instance.printTest(printer);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已送出測試列印')));
  }

  Future<void> _manualNetworkDialog() async {
    final nameController = TextEditingController(text: 'Network Printer');
    final ipController = TextEditingController();
    final portController = TextEditingController(text: '9100');
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('手動新增網路印表機'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: '名稱')),
            TextField(controller: ipController, decoration: const InputDecoration(labelText: 'IP 位址')),
            TextField(controller: portController, decoration: const InputDecoration(labelText: 'Port')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
          FilledButton(
            onPressed: () {
              final printer = PrinterService.instance.buildNetworkPrinter(
                name: nameController.text.trim().isEmpty ? 'Network Printer' : nameController.text.trim(),
                ip: ipController.text.trim(),
                port: portController.text.trim().isEmpty ? '9100' : portController.text.trim(),
              );
              setState(() => _networkPrinters = [printer, ..._networkPrinters]);
              Navigator.pop(context);
            },
            child: const Text('加入'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: ValueListenableBuilder<Printer?>(
              valueListenable: PrinterSession.selectedPrinter,
              builder: (context, printer, _) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('列印設定', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(printer == null ? '目前未連接印表機' : '目前連接：${printer.name}'),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        FilledButton.icon(onPressed: _discoveringBluetooth ? null : _discoverBluetooth, icon: const Icon(Icons.bluetooth_searching), label: Text(_discoveringBluetooth ? '搜尋中...' : '搜尋藍牙印表機')),
                        OutlinedButton.icon(onPressed: _discoveringNetwork ? null : _discoverNetwork, icon: const Icon(Icons.wifi_tethering), label: Text(_discoveringNetwork ? '掃描中...' : '掃描網路印表機')),
                        OutlinedButton.icon(onPressed: _manualNetworkDialog, icon: const Icon(Icons.add_link), label: const Text('手動新增網路印表機')),
                        if (printer != null) FilledButton.icon(onPressed: _testPrint, icon: const Icon(Icons.print_outlined), label: const Text('測試列印')),
                        if (printer != null) OutlinedButton.icon(onPressed: _disconnectPrinter, icon: const Icon(Icons.link_off), label: const Text('中斷連線')),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_bluetoothPrinters.isNotEmpty) ...[
          Text('藍牙印表機', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ..._bluetoothPrinters.map((printer) => Card(child: ListTile(title: Text(printer.name), trailing: FilledButton(onPressed: () => _connectPrinter(printer), child: const Text('連接'))))),
          const SizedBox(height: 16),
        ],
        if (_networkPrinters.isNotEmpty) ...[
          Text('網路印表機', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ..._networkPrinters.map((printer) => Card(child: ListTile(title: Text(printer.name), subtitle: Text('${printer.ip ?? ''}:${printer.port ?? ''}'), trailing: FilledButton(onPressed: () => _connectPrinter(printer), child: const Text('連接'))))),
          const SizedBox(height: 16),
        ],
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('同步資訊', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text('最近同步：${_formatDate(_lastSyncAt)}'),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () async {
                    final result = await SyncService.instance.fullSync();
                    await _load();
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('同步完成：法規新增 ${result.regulationReport?.newRecords ?? 0} 筆')));
                  },
                  icon: const Icon(Icons.sync),
                  label: const Text('立即同步全部資料'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('份量參考值', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        ..._servingRefs.map((item) => Card(child: ListTile(title: Text(item['food_category']?.toString() ?? ''), subtitle: Text('參考份量 ${item['reference_serving']} ${item['unit']}')))),
        const SizedBox(height: 16),
        Text('食品添加物示例', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        ..._additives.map((item) => Card(child: ListTile(title: Text(item['name_zh']?.toString() ?? ''), subtitle: Text('${item['category']}｜${item['applicable_food']}')))),
      ],
    );
  }
}
