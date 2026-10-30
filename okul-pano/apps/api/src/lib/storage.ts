import { mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { storedFiles } from '../db/schema.ts';
import { badRequest } from './errors.ts';

/**
 * Dosya depolama soyutlaması: yerel disk (sunucu / VPS) ya da veritabanı (kalıcı diski olmayan ücretsiz
 * barındırmalar). Aynı arayüzle S3 uyumlu bir depoya (Cloudflare R2, AWS S3, MinIO) da geçilebilir.
 */
export interface FileStorage {
  saveImage(schoolId: string, data: Buffer): Promise<string>;
}

export const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const SIGNATURES: { ext: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** Uzantıya ya da istemcinin söylediği türe değil, dosyanın ilk baytlarına bakar (SVG/HTML kabul edilmez). */
export function detectImageType(data: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(data))?.ext ?? null;
}

export class LocalStorage implements FileStorage {
  readonly root: string;

  constructor(
    root: string,
    private readonly publicPrefix = '/uploads',
  ) {
    this.root = resolve(root);
    // Statik dosya sunucusu klasörün açılışta var olmasını bekler
    mkdirSync(this.root, { recursive: true });
  }

  async saveImage(schoolId: string, data: Buffer): Promise<string> {
    const ext = detectImageType(data);
    if (!ext) throw badRequest('Yalnızca PNG, JPEG, WEBP ya da GIF görseller yüklenebilir.');
    const dir = join(this.root, schoolId);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), data);
    return `${this.publicPrefix}/${schoolId}/${name}`;
  }
}

/** Görselleri veritabanında saklar; adresler yerel diskle aynıdır (/uploads/<okul>/<ad>) */
export class DbStorage implements FileStorage {
  constructor(private readonly db: DB) {}

  async saveImage(schoolId: string, data: Buffer): Promise<string> {
    const ext = detectImageType(data);
    if (!ext) throw badRequest('Yalnızca PNG, JPEG, WEBP ya da GIF görseller yüklenebilir.');
    const name = `${randomUUID()}.${ext}`;
    await this.db.insert(storedFiles).values({ schoolId, name, contentType: IMAGE_TYPES[ext]!, data });
    return `/uploads/${schoolId}/${name}`;
  }

  async read(schoolId: string, name: string): Promise<{ contentType: string; data: Buffer } | null> {
    const [row] = await this.db
      .select({ contentType: storedFiles.contentType, data: storedFiles.data })
      .from(storedFiles)
      .where(and(eq(storedFiles.schoolId, schoolId), eq(storedFiles.name, name)));
    return row ?? null;
  }
}
