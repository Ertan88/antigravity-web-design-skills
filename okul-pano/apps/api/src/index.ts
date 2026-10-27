import { count } from 'drizzle-orm';
import { buildApp } from './app.ts';
import { users } from './db/schema.ts';
import { hashPassword } from './lib/crypto.ts';
import { seedDemo } from './seed-data.ts';

const app = await buildApp();
const { PORT, HOST, NODE_ENV } = app.deps.env;

const [{ n: userCount }] = (await app.deps.db.select({ n: count() }).from(users)) as [{ n: number }];
if (userCount === 0) {
  if (NODE_ENV === 'development') {
    // Geliştirmede veritabanı boşsa (ilk kurulum) örnek okul ve giriş hesapları kendiliğinden oluşturulur
    const result = await seedDemo(app.deps.db, {
      storage: app.deps.storage,
      superAdmin: { email: 'admin@okulpano.local', password: 'Pano2026!' },
    });
    console.log('\nVeritabanı boştu; örnek okul oluşturuldu. Giriş bilgileri:');
    console.table(result.accounts);
  } else {
    // Sunucuda ilk açılış: platform yöneticisi ortam değişkenlerinden oluşturulur (kabuk erişimi olmayan
    // ücretsiz barındırmalar için). SEED_DEMO=true ise tanıtım için örnek okul da kurulur; örnek hesapların
    // şifresi platform yöneticisinin şifresiyle aynıdır (bilinen geliştirme şifreleri kullanılmaz).
    const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_SUPERADMIN_PASSWORD;
    if (!email || !password) {
      console.warn('Veritabanı boş: ilk yönetici için SEED_SUPERADMIN_EMAIL ve SEED_SUPERADMIN_PASSWORD ortam değişkenlerini verin.');
    } else if (process.env.SEED_DEMO === 'true') {
      const result = await seedDemo(app.deps.db, { storage: app.deps.storage, superAdmin: { email, password }, demoPassword: password });
      console.log('İlk açılış: platform yöneticisi ve örnek okul oluşturuldu:', result.accounts.map((a) => `${a.role}: ${a.email}`).join(' · '));
    } else {
      await app.deps.db.insert(users).values({ email, fullName: 'Platform Yöneticisi', isSuperAdmin: true, passwordHash: await hashPassword(password) });
      console.log(`İlk açılış: platform yöneticisi oluşturuldu (${email}).`);
    }
  }
}

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Panokul API hazır: http://localhost:${PORT}`);
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
