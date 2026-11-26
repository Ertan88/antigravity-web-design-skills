/*
 * Tarayıcı duman testleri (uydurma örnek okulla): giriş, pano, panel sayfaları, iki adımlı doğrulama, hesap geçişi,
 * uygulamanın web sürümü. Her gönderimde Docker iş akışında, açılmış uygulamaya karşı çalışır.
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… MUDUR_PASSWORD=… OGRETMEN_PASSWORD=… node e2e/smoke.mjs
 * Gerçek okul verisiyle çalıştırılmaz; ekran görüntüleri yalnızca hata olursa e2e-hata/ klasörüne yazılır.
 */
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@okulpano.local', password: process.env.ADMIN_PASSWORD ?? 'Pano2026!' };
const MUDUR = { email: 'mudur@okulpano.local', password: process.env.MUDUR_PASSWORD ?? 'Mudur2026!' };
const OGRETMEN = { email: 'ogretmen@okulpano.local', password: process.env.OGRETMEN_PASSWORD ?? 'Ogretmen2026!' };

// RFC 6238 (doğrulayıcı uygulama kodu): sunucudaki uygulamadan bağımsız yazılır, ikisi birbirini sınar
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(s) {
  let bits = 0, v = 0;
  const out = [];
  for (const ch of s.replace(/\s/g, '')) {
    v = (v << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
const stepNow = () => Math.floor(Date.now() / 30000);
function totpAt(secret, step) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', b32(secret)).update(c).digest();
  const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
/** Sunucu aynı kodu iki kez kabul etmez: her seferinde kullanılmamış bir sonraki adımın kodu (gerekirse beklenir) */
let lastStep = 0;
async function freshCode(secret) {
  const step = Math.max(stepNow(), lastStep + 1);
  while (stepNow() + 1 < step) await new Promise((r) => setTimeout(r, 1000));
  lastStep = step;
  return totpAt(secret, step);
}

const browser = await chromium.launch();
const results = [];
let failed = 0;

async function step(name, fn, ctxOptions = { viewport: { width: 1280, height: 860 } }) {
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await fn(page);
    if (errors.length) throw new Error(`Sayfa hatası: ${errors[0]}`);
    results.push(`✓ ${name}`);
  } catch (e) {
    failed++;
    results.push(`✗ ${name}: ${e.message.split('\n')[0]}`);
    mkdirSync('e2e-hata', { recursive: true });
    await page.screenshot({ path: `e2e-hata/${name.replace(/[^\p{L}\d]+/gu, '-')}.png`, fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

async function panelLogin(page, user) {
  await page.goto(`${BASE}/admin/`);
  await page.fill('input[type=email]', user.email);
  await page.fill('input[type=password]', user.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
const expectText = async (page, text, timeout = 15000) => page.getByText(text).first().waitFor({ timeout });

await step('Panel: müdür girişi ve Genel Bakış', async (page) => {
  await panelLogin(page, MUDUR);
  await expectText(page, 'Genel Bakış');
  // Selam saate göre değişir (Dashboard: 11'den önce "Günaydın", 17'ye kadar "İyi günler", sonra "İyi akşamlar")
  await expectText(page, /Günaydın|İyi (sabahlar|günler|akşamlar|geceler)/);
});

await step('Panel: Duyurular, Nöbet Çizelgesi ve Zil Saatleri açılır', async (page) => {
  await panelLogin(page, MUDUR);
  await expectText(page, 'Genel Bakış');
  for (const [path, title] of [['/admin/duyurular', 'Duyurular'], ['/admin/nobet', 'Nöbet'], ['/admin/zil-saatleri', 'Zil']]) {
    await page.goto(`${BASE}${path}`);
    await page.getByRole('heading', { name: new RegExp(title) }).first().waitFor({ timeout: 15000 });
  }
});

await step('Panel: Hesabım › Güvenlik ve açık oturumlar', async (page) => {
  await panelLogin(page, MUDUR);
  await expectText(page, 'Genel Bakış');
  await page.goto(`${BASE}/admin/hesap?sekme=guvenlik`);
  await expectText(page, 'İki adımlı doğrulama');
  await page.getByRole('button', { name: 'Gör' }).click();
  await expectText(page, 'Bu cihaz');
});

let secret = '';
await step('Platform: iki adımlı doğrulama zorunlu kurulum, kodla giriş, cihazı hatırla', async (page) => {
  await panelLogin(page, ADMIN);
  // Doğrulama kapalıysa Güvenlik'e yönlendirilir; daha önce açılmışsa (ikinci çalıştırma) kod istenir
  await page.waitForURL(/hesap\?sekme=guvenlik/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Aç', exact: true }).click();
  await page.fill('#mfa-setup-form input[type=password]', ADMIN.password);
  await page.getByRole('button', { name: 'Devam et' }).click();
  const key = page.locator('.select-all');
  await key.waitFor();
  secret = (await key.innerText()).trim();
  await page.fill('#mfa-setup-form input[inputmode=numeric]', await freshCode(secret));
  await page.getByRole('button', { name: 'Doğrula ve aç' }).click();
  await expectText(page, 'Yedek kodlarınız');
  await page.getByRole('button', { name: 'Kaydettim' }).click();
  await page.goto(`${BASE}/admin/`);
  await expectText(page, 'Abonelikler');
  // Çıkış, kodla giriş (hatırla), çıkış, kod sorulmadan giriş
  await page.getByLabel('Çıkış yap').click();
  await panelLogin(page, ADMIN);
  await expectText(page, 'Doğrulama kodu');
  await page.fill('input[autocomplete=one-time-code]', await freshCode(secret));
  await page.getByLabel('Bu cihazı 30 gün hatırla').check();
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expectText(page, 'Abonelikler');
  await page.getByLabel('Çıkış yap').click();
  await panelLogin(page, ADMIN);
  await expectText(page, 'Abonelikler');
});

await step('Platform: okul hesabını bağla, geç, platforma dön', async (page) => {
  if (!secret) throw new Error('önceki adım başarısız');
  await panelLogin(page, ADMIN);
  await expectText(page, 'Doğrulama kodu');
  await page.fill('input[autocomplete=one-time-code]', await freshCode(secret));
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByText('Okul hesabımı bağla').first().click();
  await page.fill('#link-form input[type=email]', MUDUR.email);
  await page.fill('#link-form input[type=password]', MUDUR.password);
  await page.getByRole('button', { name: 'Bağla ve geç' }).click();
  await expectText(page, 'Platform hesabına dön');
  await page.getByText('Platform hesabına dön').click();
  await expectText(page, 'Okul hesabıma geç');
});

await step('Pano: /display açılır', async (page) => {
  await page.goto(`${BASE}/display/`);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
  if ((await page.locator('body').innerText()).trim().length < 5) throw new Error('pano boş');
}, { viewport: { width: 1920, height: 1080 } });

await step('Uygulama (web): öğretmen girişi ve Menü', async (page) => {
  await page.goto(`${BASE}/app/`);
  await page.getByLabel('E-posta').fill(OGRETMEN.email);
  await page.getByLabel('Şifre', { exact: true }).fill(OGRETMEN.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByText('Menü').first().waitFor({ timeout: 20000 });
  await page.goto(`${BASE}/app/hesap/guvenlik`);
  await expectText(page, 'Açık oturumlar');
}, { ...devices['Pixel 7'] });

await browser.close();
console.log(results.join('\n'));
if (failed) {
  console.error(`${failed} adım başarısız (ekran görüntüleri: e2e-hata/)`);
  process.exit(1);
}
console.log('Bütün tarayıcı testleri geçti.');
