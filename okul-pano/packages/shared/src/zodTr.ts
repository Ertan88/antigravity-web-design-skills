import { z } from 'zod';

/**
 * Doğrulama mesajları Türkçe ve teknik terimsiz: şemada özel mesaj yazılmamış kurallar için kullanılır
 * (özel mesajlar her zaman önceliklidir). Panel, mobil ve sunucu aynı mesajları gösterir.
 */
interface Issue {
  code?: string;
  input?: unknown;
  expected?: string;
  origin?: string;
  minimum?: unknown;
  maximum?: unknown;
  inclusive?: boolean;
  format?: string;
  divisor?: unknown;
}

const FORMATS: Record<string, string> = {
  email: 'Geçerli bir e-posta adresi yazın.',
  uuid: 'Geçerli bir kayıt seçin.',
  guid: 'Geçerli bir kayıt seçin.',
  url: 'Geçerli bir bağlantı adresi yazın.',
  date: 'Geçerli bir tarih girin.',
  datetime: 'Geçerli bir tarih ve saat girin.',
  time: 'Geçerli bir saat girin (ör. 08:30).',
  regex: 'Yazım biçimi uygun değil.',
  starts_with: 'Yazım biçimi uygun değil.',
  ends_with: 'Yazım biçimi uygun değil.',
  includes: 'Yazım biçimi uygun değil.',
};

const n = (v: unknown) => (typeof v === 'bigint' ? Number(v) : (v as number));
const dateText = (v: unknown) => (v instanceof Date ? v.toLocaleDateString('tr-TR') : String(v));

export function turkishIssue(issue: Issue): string {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.input === undefined || issue.input === null) return 'Bu alan zorunlu.';
      if (issue.expected === 'number' || issue.expected === 'int') return 'Bir sayı girin.';
      if (issue.expected === 'date') return 'Geçerli bir tarih girin.';
      return 'Girilen değer geçersiz.';
    case 'too_small': {
      const min = n(issue.minimum);
      if (issue.origin === 'string') return min <= 1 ? 'Bu alan boş bırakılamaz.' : `En az ${min} karakter olmalı.`;
      if (issue.origin === 'array' || issue.origin === 'set') return min <= 1 ? 'En az bir seçim yapın.' : `En az ${min} seçim yapın.`;
      if (issue.origin === 'date') return `${dateText(issue.minimum)} tarihinden önce olamaz.`;
      return issue.inclusive === false ? `${min} değerinden büyük olmalı.` : `En az ${min} olmalı.`;
    }
    case 'too_big': {
      const max = n(issue.maximum);
      if (issue.origin === 'string') return `En fazla ${max} karakter olabilir.`;
      if (issue.origin === 'array' || issue.origin === 'set') return `En fazla ${max} seçim yapılabilir.`;
      if (issue.origin === 'date') return `${dateText(issue.maximum)} tarihinden sonra olamaz.`;
      if (issue.origin === 'file') return 'Dosya çok büyük.';
      return issue.inclusive === false ? `${max} değerinden küçük olmalı.` : `En fazla ${max} olabilir.`;
    }
    case 'invalid_format':
      return FORMATS[issue.format ?? ''] ?? 'Yazım biçimi uygun değil.';
    case 'invalid_value':
      return 'Listedeki seçeneklerden birini seçin.';
    case 'not_multiple_of':
      return `${n(issue.divisor)} ve katları girilebilir.`;
    case 'unrecognized_keys':
      return 'Tanınmayan alan gönderildi; sayfayı yenileyip tekrar deneyin.';
    default:
      return 'Girilen değer geçersiz.';
  }
}

z.config({ customError: (issue) => turkishIssue(issue as Issue) });

/** İngilizce (kütüphane, tarayıcı, işletim sistemi) hata metni mi: kullanıcıya gösterilmez */
const ENGLISH = /\b(the|is|are|was|not|cannot|can't|could|failed|failure|error|invalid|unexpected|undefined|null|network|request|permission|denied|unable|of|to|and|with|from|timeout|timed out|abort(ed)?)\b/i;

export const looksEnglish = (text: string) => ENGLISH.test(text) && !/[çğıöşüÇĞİÖŞÜ]/.test(text);

/**
 * Ekranda gösterilecek hata metni: sunucunun Türkçe mesajı olduğu gibi kalır; kütüphane ya da tarayıcıdan gelen
 * İngilizce metinler (ör. "Network request failed", "undefined is not a function") yerine Türkçe açıklama gösterilir.
 */
export function errorText(err: unknown, fallback = 'İşlem yapılamadı. Lütfen tekrar deneyin.'): string {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!message.trim()) return fallback;
  if (/network request failed|failed to fetch|load failed|networkerror/i.test(message)) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  if (/timed? ?out|aborted|timeouterror/i.test(message)) return 'Sunucu zamanında yanıt vermedi. Lütfen tekrar deneyin.';
  if (/permission|denied|not allowed/i.test(message) && looksEnglish(message)) return 'Gerekli izin verilmedi. Telefon ya da tarayıcı ayarlarından izin verin.';
  return looksEnglish(message) ? fallback : message;
}
