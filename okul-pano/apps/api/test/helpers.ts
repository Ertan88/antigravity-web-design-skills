import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase, type Database } from '../src/db/client.ts';
import { users } from '../src/db/schema.ts';
import { hashPassword } from '../src/lib/crypto.ts';

export interface TestCtx {
  app: FastifyInstance;
  database: Database;
  uploadDir: string;
}

export const SUPER = { email: 'root@test.local', password: 'RootPass123!' };

export async function createTestApp(): Promise<TestCtx> {
  const database = await openDatabase({ inMemory: true });
  await database.db.insert(users).values({
    email: SUPER.email,
    fullName: 'Kök Yönetici',
    isSuperAdmin: true,
    passwordHash: await hashPassword(SUPER.password),
  });
  const uploadDir = mkdtempSync(join(tmpdir(), 'okulpano-test-'));
  const app = await buildApp({ database, env: { NODE_ENV: 'test', UPLOAD_DIR: uploadDir }, logger: false });
  await app.ready();
  return { app, database, uploadDir };
}

export async function login(app: FastifyInstance, email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`Giriş başarısız: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'op_refresh')!;
  return { token: res.json().accessToken as string, refreshCookie: cookie.value };
}

/** Kimlik doğrulamalı istek kısayolu */
export function client(app: FastifyInstance, token: string) {
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') => (url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  return { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), del: call('DELETE') };
}

export function multipartBody(field: string, filename: string, data: Buffer, contentType: string) {
  const boundary = `----okulpano${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export function expectStatus(res: LightMyRequestResponse, status: number) {
  if (res.statusCode !== status) {
    throw new Error(`Beklenen ${status}, gelen ${res.statusCode}: ${res.body}`);
  }
}

/** 1x1 şeffaf PNG */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
