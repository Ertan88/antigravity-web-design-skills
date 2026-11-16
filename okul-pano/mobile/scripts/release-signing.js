// Expo'nun ürettiği Android projesinde sürüm (release) APK'sını kalıcı anahtarla imzalar.
// Kullanım (expo prebuild'den sonra, mobile klasöründe): node scripts/release-signing.js
// Anahtar dosyası android/app/release.keystore'dadır; şifreler derleme sırasında ortam değişkenlerinden okunur
// (APP_KEYSTORE_PASSWORD, APP_KEY_ALIAS, APP_KEY_PASSWORD). Depoya şifre ya da anahtar yazılmaz.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let s = fs.readFileSync(file, 'utf8');

// 1) Sürüm derlemesi geliştirme anahtarı yerine "release" imzasını kullanır (buildTypes içindeki release bloğu)
const buildTypes = s.indexOf('buildTypes {');
const rel = s.indexOf('release {', buildTypes);
const debugSign = s.indexOf('signingConfig signingConfigs.debug', rel);
if (buildTypes < 0 || rel < 0 || debugSign < 0) throw new Error('build.gradle beklenen yapıda değil: release imzası eklenemedi');
s = s.slice(0, debugSign) + 'signingConfig signingConfigs.release' + s.slice(debugSign + 'signingConfig signingConfigs.debug'.length);

// 2) "release" imza ayarı eklenir
const block = [
  'signingConfigs {',
  '        release {',
  "            storeFile file('release.keystore')",
  "            storePassword System.getenv('APP_KEYSTORE_PASSWORD')",
  "            keyAlias System.getenv('APP_KEY_ALIAS')",
  "            keyPassword System.getenv('APP_KEY_PASSWORD')",
  '        }',
].join('\n');
if (!s.includes('signingConfigs {')) throw new Error('build.gradle içinde signingConfigs bulunamadı');
s = s.replace('signingConfigs {', block);

fs.writeFileSync(file, s);
console.log('Sürüm APK’sı kalıcı anahtarla imzalanacak');
