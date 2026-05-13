import 'package:flutter/material.dart';

import 'screens/home_shell.dart';
import 'services/database_helper.dart';
import 'services/ingredient_service.dart';
import 'services/sync_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await DatabaseHelper.instance.database;
  await IngredientService.instance.ensureSeeded();
  await SyncService.instance.ensureStartupSync();
  runApp(const FoodLabelProApp());
}

class FoodLabelProApp extends StatelessWidget {
  const FoodLabelProApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Food Label Pro',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E)),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      ),
      home: const HomeShell(),
    );
  }
}
