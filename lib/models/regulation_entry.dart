enum RegulationSource {
  tfdNewsApi,
  foodlabelLaw,
  mojLaw,
  tfdLawList,
  sgsFoodNews,
  manualSeed,
}

extension RegulationSourceX on RegulationSource {
  String get label {
    switch (this) {
      case RegulationSource.tfdNewsApi:
        return 'TFDA 新聞 API';
      case RegulationSource.foodlabelLaw:
        return '食品標示諮詢平台';
      case RegulationSource.mojLaw:
        return '全國法規資料庫';
      case RegulationSource.tfdLawList:
        return 'TFDA 法規列表';
      case RegulationSource.sgsFoodNews:
        return 'SGS 食安快訊';
      case RegulationSource.manualSeed:
        return '離線內建資料';
    }
  }
}

class RegulationEntry {
  final int? id;
  final RegulationSource source;
  final String sourceUrl;
  final String regulationType;
  final String title;
  final String? fullText;
  final String? publishDate;
  final String? effectiveDate;
  final String fetchedAt;
  final String dataVersion;
  final String checksum;
  final String tags;

  const RegulationEntry({
    this.id,
    required this.source,
    required this.sourceUrl,
    required this.regulationType,
    required this.title,
    required this.fullText,
    required this.publishDate,
    required this.effectiveDate,
    required this.fetchedAt,
    required this.dataVersion,
    required this.checksum,
    required this.tags,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'source': source.name,
      'source_url': sourceUrl,
      'regulation_type': regulationType,
      'title': title,
      'full_text': fullText,
      'publish_date': publishDate,
      'effective_date': effectiveDate,
      'attachment_urls': '',
      'fetched_at': fetchedAt,
      'data_version': dataVersion,
      'checksum': checksum,
      'tags': tags,
      'is_active': 1,
      'is_deleted': 0,
    };
  }

  factory RegulationEntry.fromMap(Map<String, dynamic> map) {
    final sourceName = map['source']?.toString() ?? RegulationSource.manualSeed.name;
    final source = RegulationSource.values.where((e) => e.name == sourceName).firstOrNull ?? RegulationSource.manualSeed;
    return RegulationEntry(
      id: map['id'] as int?,
      source: source,
      sourceUrl: map['source_url']?.toString() ?? '',
      regulationType: map['regulation_type']?.toString() ?? '',
      title: map['title']?.toString() ?? '',
      fullText: map['full_text']?.toString(),
      publishDate: map['publish_date']?.toString(),
      effectiveDate: map['effective_date']?.toString(),
      fetchedAt: map['fetched_at']?.toString() ?? '',
      dataVersion: map['data_version']?.toString() ?? '',
      checksum: map['checksum']?.toString() ?? '',
      tags: map['tags']?.toString() ?? '',
    );
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull => isEmpty ? null : first;
}
