import { openDatabase } from './db/client.ts';
import { loadEnv } from './env.ts';
import { LocalStorage } from './lib/storage.ts';
import { seedDemo } from './seed-data.ts';

const env = loadEnv();
const database = await openDatabase({ databaseUrl: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });

const result = await seedDemo(database.db, {
  storage: new LocalStorage(env.UPLOAD_DIR),
  // Tanıtım için "bugün"ü değiştirmek isterseniz: SEED_NOW=2026-10-28T09:00:00+03:00
  now: process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : undefined,
  superAdmin: {
    email: process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@okulpano.local',
    password: process.env.SEED_SUPERADMIN_PASSWORD ?? 'Pano2026!',
  },
});
await database.close();

console.log('\nÖrnek okul oluşturuldu.\n');
console.table(result.accounts);
console.log(`\nÖrnek ekranı doğrudan açmak için:\n  http://localhost:5174/display/?key=${result.screenToken}\n`);
