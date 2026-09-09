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

## Otomatik güncelleme

Uygulama açılışta GitHub Releases'teki en son sürümü kontrol eder; yeni bir sürüm varsa
üstte bir banner çıkar ("Yeni sürüm mevcut: vX.Y.Z" → İndir → Yeniden Başlat & Yükle).
Bunun çalışması için **GitHub Release**'in var olması gerekir — sadece `git push` yeterli
değildir (commit push ≠ release).

**Yeni sürüm yayınlama akışı** (`.github/workflows/release.yml` otomatikleştirir):

1. `package.json` içindeki `"version"` alanını artır (örn. `1.2.0` → `1.3.0`)
2. Commit + `main`'e push
3. GitHub Actions otomatik olarak macOS (`.dmg`) ve Windows (`.exe`) paketlerini build
   edip `vX.Y.Z` etiketiyle GitHub Releases'e yayınlar
4. Uygulamayı açan herkes bir sonraki açılışta güncelleme banner'ını görür

Version alanı değişmeyen commit'ler workflow'u tetiklemez (gereksiz build/release yapılmaz).

Elle/lokal yayınlamak istersen (`GH_TOKEN` env değişkeni gerekir — repo yazma izinli bir
GitHub token):
```bash
GH_TOKEN=ghp_xxx npm run release-mac   # macOS
GH_TOKEN=ghp_xxx npm run release       # Windows
```

## Geliştirici

**Tuğrul Ceyhan** ([@xtceyhan](https://github.com/xtceyhan))

Bu projenin tüm hakları saklıdır. Kod izin alınmadan kopyalanamaz, dağıtılamaz veya kullanılamaz — bkz. [LICENSE](LICENSE).
