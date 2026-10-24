import { openDatabase } from './db/client.ts';
import { loadEnv } from './env.ts';
import { LocalStorage } from './lib/storage.ts';
import { seedDemo } from './seed-data.ts';

const env = loadEnv();

function fail(step: string, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nÖrnek veri oluşturulamadı (${step}): ${message}`);
  console.error(
    [
      '',
      'Olası çözümler:',
      '  1) Sunucu açıksa (npm run dev) Ctrl+C ile kapatıp tekrar deneyin; veritabanını aynı anda iki program açamaz.',
      `  2) Veritabanı bozulmuş olabilir. Sıfırdan başlamak için şu klasörü silin ve "npm run dev" çalıştırın:`,
      `     ${env.PGLITE_DIR.startsWith('/') ? env.PGLITE_DIR : `apps/api/${env.PGLITE_DIR.replace(/^\.\//, '')}`}`,
      '     (Sunucu boş veritabanında örnek okulu ve giriş hesaplarını kendisi oluşturur.)',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const database = await openDatabase({ databaseUrl: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR }).catch((e) => fail('veritabanı açılamadı', e));

const result = await seedDemo(database.db, {
  storage: new LocalStorage(env.UPLOAD_DIR),
  // Tanıtım için "bugün"ü değiştirmek isterseniz: SEED_NOW=2026-10-28T09:00:00+03:00
  now: process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : undefined,
  superAdmin: {
    email: process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@okulpano.local',
    password: process.env.SEED_SUPERADMIN_PASSWORD ?? 'Pano2026!',
  },
}).catch((e) => fail('kayıtlar yazılamadı', e));
await database.close();

console.log('\nÖrnek okul oluşturuldu.\n');
console.table(result.accounts);
console.log(`\nÖrnek ekranı doğrudan açmak için:\n  http://localhost:5174/display/?key=${result.screenToken}\n`);
