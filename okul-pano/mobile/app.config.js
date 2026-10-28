const fs = require('node:fs');
const path = require('node:path');

/**
 * app.json'daki ayarlara derleme ortamından gelenleri ekler (anahtarlar depoya yazılmaz):
 * - google-services.json (Firebase): Android'de telefon bildirimleri için. Derlemede GitHub sırrından yazılır.
 * - EXPO_PUBLIC_EAS_PROJECT_ID: bildirimlerin gönderildiği Expo projesinin kimliği.
 */
module.exports = ({ config }) => {
  const firebase = path.join(__dirname, 'google-services.json');
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return {
    ...config,
    android: { ...config.android, ...(fs.existsSync(firebase) ? { googleServicesFile: './google-services.json' } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
