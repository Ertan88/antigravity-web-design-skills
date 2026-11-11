import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'error',
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');
export const unauthorized = (msg = 'Oturum açmanız gerekiyor.') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Bu işlem için yetkiniz yok.') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Kayıt bulunamadı.') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');

export function parse<S extends ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data ?? {});
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e?.code === 'string' && /^\d{5}$/.test(e.code)) return e.code;
  if (typeof e?.cause?.code === 'string') return e.cause.code;
  return undefined;
}

/** Doğrulama hatasında alanın Türkçe adı (mesajın başına yazılır; bilinmeyen alanlarda yalnızca mesaj) */
const FIELD_LABELS: Record<string, string> = {
  email: 'E-posta',
  fullName: 'Ad soyad',
  name: 'Ad',
  password: 'Şifre',
  currentPassword: 'Mevcut şifre',
  phone: 'Telefon',
  title: 'Başlık',
  body: 'Metin',
  message: 'Mesaj',
  description: 'Açıklama',
  note: 'Not',
  date: 'Tarih',
  startDate: 'Başlangıç tarihi',
  endDate: 'Bitiş tarihi',
  startsAt: 'Başlangıç',
  endsAt: 'Bitiş',
  time: 'Saat',
  role: 'Rol',
  className: 'Sınıf',
  subject: 'Ders',
  schoolNo: 'Okul numarası',
  birthDate: 'Doğum tarihi',
  url: 'Bağlantı',
  website: 'Web sitesi',
  youtubeUrl: 'YouTube bağlantısı',
  location: 'Konum',
  label: 'Etiket',
  slug: 'Okul adresi',
  from: 'Gönderen',
  code: 'Kod',
  emailCode: 'Doğrulama kodu',
};

/** Fastify ve eklentilerinin İngilizce hata metinleri yerine durum koduna göre Türkçe açıklama */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'İstek okunamadı. Sayfayı yenileyip tekrar deneyin.',
  401: 'Oturum açmanız gerekiyor.',
  403: 'Bu işlem için yetkiniz yok.',
  404: 'Kayıt bulunamadı.',
  405: 'Bu işlem desteklenmiyor.',
  406: 'İstek biçimi desteklenmiyor.',
  408: 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.',
  409: 'Bu kayıt başka bir işlemle çakışıyor.',
  411: 'İstek okunamadı. Sayfayı yenileyip tekrar deneyin.',
  413: 'Gönderilen veri çok büyük.',
  414: 'Adres çok uzun.',
  415: 'Gönderilen içerik türü desteklenmiyor.',
  429: 'Çok fazla deneme yaptınız, lütfen biraz bekleyin.',
};

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: 'validation',
      message: validationMessage(err),
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  }
  const code = pgCode(err);
  if (code === '23505') {
    // Benzersizlik ihlali: bilinen kısıtlar için ne çakıştığı söylenir
    const constraint = (err as { constraint?: string; cause?: { constraint?: string } }).constraint ?? (err as { cause?: { constraint?: string } }).cause?.constraint;
    const message = constraint === 'students_school_no_uq' ? 'Bu okul numarası başka bir öğrencide kayıtlı.' : 'Bu kayıt zaten mevcut.';
    return reply.status(409).send({ error: 'conflict', message });
  }
  if (code === '23503') return reply.status(409).send({ error: 'conflict', message: 'İlişkili kayıt bulunamadı ya da kullanımda.' });

  const status = (err as FastifyError).statusCode;
  const fcode = (err as FastifyError).code;
  if (fcode === 'FST_REQ_FILE_TOO_LARGE' || status === 413) {
    return reply.status(413).send({ error: 'too_large', message: 'Dosya çok büyük (en fazla 10 MB). Daha küçük bir fotoğraf seçin.' });
  }
  if (fcode === 'FST_INVALID_MULTIPART_CONTENT_TYPE' || fcode === 'FST_NO_FORM_DATA' || fcode === 'FST_FILES_LIMIT') {
    return reply.status(400).send({ error: 'bad_upload', message: 'Dosya okunamadı. Lütfen tekrar seçip yükleyin.' });
  }
  if (status && status < 500) {
    // Buraya yalnızca Fastify ve eklentilerinin hataları düşer (kendi hatalarımız HttpError); mesajları İngilizcedir
    const message = STATUS_MESSAGES[status] ?? 'İstek işlenemedi. Lütfen tekrar deneyin.';
    return reply.status(status).send({ error: (err as FastifyError).code ?? 'error', message });
  }
  req.log.error(err);
  return reply.status(500).send({ error: 'internal', message: 'Beklenmeyen bir hata oluştu.' });
}

function validationMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Geçersiz veri.';
  const key = [...issue.path].reverse().find((p): p is string => typeof p === 'string');
  const label = key ? FIELD_LABELS[key] : undefined;
  return label && !issue.message.toLocaleLowerCase('tr-TR').includes(label.toLocaleLowerCase('tr-TR')) ? `${label}: ${issue.message}` : issue.message;
}
