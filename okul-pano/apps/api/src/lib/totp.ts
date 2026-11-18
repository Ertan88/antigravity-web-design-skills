import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/*
 * Doğrulayıcı uygulama kodu (TOTP, RFC 6238): 30 saniyelik adım, 6 hane, HMAC-SHA1. Google Authenticator,
 * Microsoft Authenticator ve benzerleriyle uyumludur. Saat kaymasına karşı bir önceki ve bir sonraki adım da kabul edilir.
 */
const STEP = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Yeni gizli anahtar (160 bit, base32) */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1]! & 15;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP);

/**
 * Kod doğruysa eşleşen adımı döndürür, değilse null. `afterStep` verilirse o adım ve öncesi kabul edilmez
 * (aynı kod iki kez kullanılamaz).
 */
export function verifyTotp(secret: string, code: string, opts: { now?: number; afterStep?: number | null } = {}): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const cur = currentStep(opts.now);
  for (const step of [cur - 1, cur, cur + 1]) {
    if (opts.afterStep != null && step <= opts.afterStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(digits))) return step;
  }
  return null;
}

/** Doğrulayıcı uygulamanın okuduğu adres (QR kodun içeriği) */
export function otpauthUrl(secret: string, account: string, issuer = 'Okul Yayın'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

/** Yedek kodlar: "7KQ2-M9XA" biçiminde, karışan karakterler (0/O, 1/I) yok */
const RC_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    let s = '';
    for (let i = 0; i < 8; i++) s += RC_ALPHABET[randomInt(RC_ALPHABET.length)];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

/** Kullanıcının yazdığı yedek kodu karşılaştırma biçimine getirir (boşluk, tire, küçük harf önemsiz) */
export const normalizeRecovery = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();
