import { z } from 'zod';
import { EXAM_KIND_KEYS, MAX_EXAM_PERIOD, type ExamKind } from './examCore.ts';

export * from './examCore.ts';

/* Sınav takvimi doğrulama şemaları (zod); şemasız parçalar examCore.ts'te (pano gibi hafif istemciler için) */

const isoDate = z.iso.date({ error: 'Tarih YYYY-AA-GG biçiminde olmalı' });

export const examScheduleSchema = z.object({
  date: isoDate,
  periodNo: z.coerce.number({ error: 'Ders saati sayı olmalı' }).int().min(1, 'Ders saati en az 1').max(MAX_EXAM_PERIOD, `Ders saati en fazla ${MAX_EXAM_PERIOD}`),
  classGroupId: z.uuid({ error: 'Sınıf seçin' }),
  subject: z.string().trim().min(1, 'Ders adı boş').max(80, 'Ders adı en fazla 80 karakter'),
  kind: z.enum(EXAM_KIND_KEYS as [ExamKind, ...ExamKind[]]).default('written'),
  /** Boşsa gözetmen ders programından bulunur (o saatte o sınıfta dersi olan) */
  proctorTeacherId: z.uuid().nullable().optional(),
  note: z.string().trim().max(120, 'Not en fazla 120 karakter').nullable().optional(),
});
export type ExamScheduleInput = z.infer<typeof examScheduleSchema>;

/**
 * Sınav ekleme: tek şube (classGroupId) ya da birden çok şube / bütün kademe (classGroupIds). Her şube için ayrı
 * kayıt açılır; gözetmen şubenin o saatteki dersinden bulunur (birden çok şubede elle gözetmen seçilmez).
 */
export const examScheduleCreateSchema = examScheduleSchema
  .extend({
    classGroupId: z.uuid({ error: 'Sınıf seçin' }).optional(),
    classGroupIds: z.array(z.uuid()).max(60, 'Tek seferde en fazla 60 şube').optional(),
  })
  .refine((v) => Boolean(v.classGroupId) || Boolean(v.classGroupIds?.length), { message: 'En az bir şube seçin', path: ['classGroupIds'] });
export type ExamScheduleCreateInput = z.infer<typeof examScheduleCreateSchema>;

export const examImportSchema = z.object({
  rows: z.array(examScheduleSchema).min(1, 'Kaydedilecek sınav yok').max(2000, 'Tek seferde en fazla 2000 sınav'),
});

