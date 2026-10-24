import { count } from 'drizzle-orm';
import { buildApp } from './app.ts';
import { users } from './db/schema.ts';
import { LocalStorage } from './lib/storage.ts';
import { seedDemo } from './seed-data.ts';

const app = await buildApp();
const { PORT, HOST, NODE_ENV, UPLOAD_DIR } = app.deps.env;

// Geliştirmede veritabanı boşsa (ilk kurulum) örnek okul ve giriş hesapları kendiliğinden oluşturulur
if (NODE_ENV === 'development') {
  const [{ n }] = (await app.deps.db.select({ n: count() }).from(users)) as [{ n: number }];
  if (n === 0) {
    const result = await seedDemo(app.deps.db, {
      storage: new LocalStorage(UPLOAD_DIR),
      superAdmin: { email: 'admin@okulpano.local', password: 'Pano2026!' },
    });
    console.log('\nVeritabanı boştu; örnek okul oluşturuldu. Giriş bilgileri:');
    console.table(result.accounts);
  }
}

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Okul Pano API hazır: http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
