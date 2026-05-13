import 'package:flutter/foundation.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';

class PrinterSession {
  PrinterSession._();

  static final ValueNotifier<Printer?> selectedPrinter = ValueNotifier<Printer?>(null);
}
