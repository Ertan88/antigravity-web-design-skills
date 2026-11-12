const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withAndroidStyles, withDangerousMod } = require('expo/config-plugins');

/**
 * Android otomatik doldurma (kayıtlı e-posta / şifre) kutuyu köşeli sarı bir zeminle boyar; yuvarlak kutuların
 * dışına taşar. Bu vurgu saydam yapılır (doldurma çalışmaya devam eder).
 */
function withoutAutofillHighlight(config) {
  return withAndroidStyles(config, (c) => {
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:autofilledHighlight',
      value: '@android:color/transparent',
    });
    return c;
  });
}

/**
 * Okul ağları (MEB) şifreli bağlantıları denetlemek için araya kendi sertifikasıyla girer. O sertifika telefona
 * yüklendiyse (Ayarlar › Güvenlik › Sertifika yükle) uygulama da onu tanısın: Android 7'den sonra uygulamalar
 * kullanıcının yüklediği sertifikaları kendiliğinden tanımaz. Düz http (okulun kendi sunucusu) önceki gibi açık kalır.
 */
const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function withSchoolNetworkCertificates(config) {
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), NETWORK_SECURITY_XML);
      return c;
    },
  ]);
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return c;
  });
}

/**
 * app.json'daki ayarlara derleme ortamından gelenleri ekler (anahtarlar depoya yazılmaz):
 * - google-services.json (Firebase): Android'de telefon bildirimleri için. Derlemede GitHub sırrından yazılır.
 * - EXPO_PUBLIC_EAS_PROJECT_ID: bildirimlerin gönderildiği Expo projesinin kimliği.
 */
module.exports = ({ config }) => {
  const firebase = path.join(__dirname, 'google-services.json');
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return withSchoolNetworkCertificates(withoutAutofillHighlight({
    ...config,
    android: { ...config.android, ...(fs.existsSync(firebase) ? { googleServicesFile: './google-services.json' } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  }));
};
