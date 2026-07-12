# Dev Tools Suite

SAP entegrasyon geliştirmesini hızlandırmak için yazılmış, Electron tabanlı bir masaüstü aracı. Elle tekrar tekrar yapılan XML/JSON formatlama ve WSDL'den XSLT mapping çıkarma işlerini otomatikleştirir.

## Özellikler

### XML / JSON Formatter (Beautifier)
- XML ve JSON'u tek tıkla okunaklı hale getirir (format / minify / validate)
- Format otomatik algılanır, ister XML ister JSON yapıştır
- Satır ve sütun bazlı hata gösterimi — bozuk bir tag'i ya da eksik virgülü tam olarak nerede olduğunu göstererek bulur
- Kapanmamış tag, tag uyuşmazlığı gibi XML'e özgü hataları da yakalar (sadece "geçersiz XML" demekle kalmaz)

### WSDL → XSL Generator
- Bir WSDL dosyasını (ya da doğrudan bir SOAP örnek isteğini) verip operasyonları otomatik ayrıştırır
- Parametreleri SIMPLE / RANGE / TABLE / STRUCT olarak otomatik sınıflandırır ve buna göre doğru XSLT şablonunu (`xsl:for-each`, `SIGN/OPTION/LOW/HIGH` range yapısı vb.) üretir
- **WSDL URL'den canlı çekme**: WSDL dosyasını elle indirip SoapUI'de açmaya gerek yok — URL ve kullanıcı bilgilerini gir, uygulama WSDL'i getirsin, ayrıştırsın ve (tek operasyon varsa) XSL'i otomatik üretsin
- Üretilen XSL çıktısı elle de düzenlenebilir, ince ayar gerektiğinde doğrudan üzerinde revizyon yapılabilir

### XSL → Request
- Üretilen (veya elden yazılmış) bir XSLT'den örnek bir istek gövdesi üretir — JSON veya SOAP/XML formatında
- Hızlıca test isteği hazırlamak veya beklenen payload yapısını görmek için kullanılır

### Diff (XML / JSON Karşılaştırma)
- İki XML/JSON gövdesini yan yana (split view) karşılaştırır — eklenen satırlar yeşil, silinen satırlar kırmızı, değişmeyenler nötr renkte
- Karşılaştırmadan önce her iki taraf da otomatik biçimlendirilir (tip otomatik algılanır), böylece sadece girinti farkından kaynaklanan gürültü elenir
- "Boşlukları Yoksay" açıldığında satır başı/sonu boşluk farkları göz ardı edilir
- Geçersiz XML/JSON girilirse o taraf ham metin olarak karşılaştırılır ve kullanıcı uyarılır
- Alt statusbar'da eklenen/silinen/değişmeyen satır sayıları gösterilir

## Kurulum

```bash
npm install
npm start
```

## Paketleme

```bash
npm run dist       # Windows (.exe / NSIS installer)
npm run dist-mac   # macOS (.dmg)
```
