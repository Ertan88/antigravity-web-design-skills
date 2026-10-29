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

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: 'validation',
      message: err.issues[0]?.message ?? 'Geçersiz veri.',
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
  if (status && status < 500) {
    const message = status === 429 ? 'Çok fazla deneme yaptınız, lütfen biraz bekleyin.' : err.message;
    return reply.status(status).send({ error: (err as FastifyError).code ?? 'error', message });
  }
  req.log.error(err);
  return reply.status(500).send({ error: 'internal', message: 'Beklenmeyen bir hata oluştu.' });
}
