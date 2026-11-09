import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Şifreler scrypt ile tuzlanarak saklanır: "scrypt$N$r$p$tuz$özet" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, , , , saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Zamanlama saldırılarına karşı: kullanıcı yoksa da aynı süre harcanır. */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
}

export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString('base64url')}`;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Karışabilecek karakterler (0/O, 1/I/L) çıkarılmış eşleştirme kodu alfabesi */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function pairingCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Okunaklı geçici şifre: karışan karakterler (0/O, 1/l/I) yok, en az bir rakam */
export function readablePassword(length = 10): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const out = Array.from({ length: length - 1 }, () => all[randomInt(all.length)]!);
  out.splice(randomInt(length), 0, digits[randomInt(digits.length)]!);
  return out.join('');
}

/**
 * Sunucuda saklanan gizli ayarlar (ör. e-posta API anahtarı) için AES-256-GCM. Anahtar JWT_SECRET'tan türetilir;
 * veritabanı yedeği tek başına ele geçse de değer okunamaz. Biçim: "gcm$iv$etiket$şifreli" (base64url).
 */
const secretKey = (secret: string) => createHash('sha256').update(`okulpano:ayar:${secret}`).digest();

export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(secret), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['gcm', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('$');
}

/** Çözülemezse (ör. JWT_SECRET değişti) null döner */
export function decryptSecret(stored: string, secret: string): string | null {
  const [tag, iv, auth, data] = stored.split('$');
  if (tag !== 'gcm' || !iv || !auth || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(auth, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
