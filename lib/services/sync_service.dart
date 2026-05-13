import 'package:shared_preferences/shared_preferences.dart';

import 'ingredient_service.dart';
import 'regulation_service.dart';

class AppSyncResult {
  final bool executed;
  final int ingredientCount;
  final RegulationSyncReport? regulationReport;

  const AppSyncResult({
    required this.executed,
    required this.ingredientCount,
    required this.regulationReport,
  });
}

class SyncService {
  SyncService._();

  static final SyncService instance = SyncService._();
  static const _lastSyncKey = 'last_full_sync_at';

  Future<AppSyncResult> ensureStartupSync() async {
    final prefs = await SharedPreferences.getInstance();
    final lastSyncValue = prefs.getString(_lastSyncKey);
    final now = DateTime.now().toUtc();
    if (lastSyncValue != null) {
      final last = DateTime.tryParse(lastSyncValue)?.toUtc();
      if (last != null && now.difference(last).inHours < 48) {
        await IngredientService.instance.ensureSeeded();
        return AppSyncResult(executed: false, ingredientCount: await IngredientService.instance.countIngredients(), regulationReport: null);
      }
    }
    return fullSync(triggeredBy: 'AUTO');
  }

  Future<AppSyncResult> fullSync({String triggeredBy = 'USER'}) async {
    await IngredientService.instance.ensureSeeded();
    await IngredientService.instance.seedBaseData(overwrite: false);
    final regulationReport = await RegulationService.instance.syncAll(triggeredBy: triggeredBy);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastSyncKey, DateTime.now().toUtc().toIso8601String());
    return AppSyncResult(
      executed: true,
      ingredientCount: await IngredientService.instance.countIngredients(),
      regulationReport: regulationReport,
    );
  }

  Future<String?> lastSyncAt() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastSyncKey);
  }
}
