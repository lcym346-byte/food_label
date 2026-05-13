import 'package:flutter/material.dart';

import 'dashboard_screen.dart';
import 'ingredients_screen.dart';
import 'recipes_screen.dart';
import 'regulations_screen.dart';
import 'settings_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final titles = ['總覽', '食材資料庫', '配方管理', '法規資料庫', '設定與列印'];
    final pages = [
      DashboardScreen(onNavigate: (index) => setState(() => _index = index)),
      const IngredientsScreen(),
      const RecipesScreen(),
      const RegulationsScreen(),
      const SettingsScreen(),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(titles[_index])),
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.space_dashboard_outlined), label: '總覽'),
          NavigationDestination(icon: Icon(Icons.kitchen_outlined), label: '食材'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: '配方'),
          NavigationDestination(icon: Icon(Icons.gavel_outlined), label: '法規'),
          NavigationDestination(icon: Icon(Icons.print_outlined), label: '設定'),
        ],
      ),
    );
  }
}
