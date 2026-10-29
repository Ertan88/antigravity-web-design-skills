const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

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
 * app.json'daki ayarlara derleme ortamından gelenleri ekler (anahtarlar depoya yazılmaz):
 * - google-services.json (Firebase): Android'de telefon bildirimleri için. Derlemede GitHub sırrından yazılır.
 * - EXPO_PUBLIC_EAS_PROJECT_ID: bildirimlerin gönderildiği Expo projesinin kimliği.
 */
module.exports = ({ config }) => {
  const firebase = path.join(__dirname, 'google-services.json');
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return withoutAutofillHighlight({
    ...config,
    android: { ...config.android, ...(fs.existsSync(firebase) ? { googleServicesFile: './google-services.json' } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  });
};
