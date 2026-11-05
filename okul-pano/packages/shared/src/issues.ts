import { z } from 'zod';

/*
 * İki ayrı yazışma kanalı:
 * 1. Okul sorunları: okul içindeki her üye (öğretmen) idareye (müdür ve yöneticiler) sorun bildirir.
 *    Yeni → İşlemde → Çözüldü; her adımda bildirimi gönderen haberdar olur. Kategori sorumlusu okul
 *    ayarlarından seçilir (issueOwners); seçilmediyse bildirim bütün idarecilere gider.
 * 2. Destek talepleri: yalnızca okul müdürü ve yöneticiler platform yöneticisine sorun / öneri / soru yazar.
 */

export const ISSUE_CATEGORIES = {
  repair: 'Arıza / tamir',
  cleaning: 'Temizlik',
  heating: 'Isınma',
  electric: 'Elektrik',
  it: 'İnternet / akıllı tahta',
  security: 'Güvenlik',
  water: 'Su / tuvalet',
  furniture: 'Sıra / eşya',
  other: 'Diğer',
} as const;
export type IssueCategory = keyof typeof ISSUE_CATEGORIES;
export const ISSUE_CATEGORY_KEYS = Object.keys(ISSUE_CATEGORIES) as IssueCategory[];

export const ISSUE_STATUSES = { new: 'Yeni', in_progress: 'İşlemde', resolved: 'Çözüldü' } as const;
export type IssueStatus = keyof typeof ISSUE_STATUSES;
export const ISSUE_STATUS_KEYS = Object.keys(ISSUE_STATUSES) as IssueStatus[];

/** Çözülen sorunların fotoğrafları bu kadar gün sonra silinir (KVKK) */
export const ISSUE_PHOTO_RETENTION_DAYS = 90;

export const issueCreateSchema = z.object({
  category: z.enum(ISSUE_CATEGORY_KEYS as [IssueCategory, ...IssueCategory[]], { error: 'Kategori seçin' }),
  location: z.string().trim().min(1, 'Sorunun yerini yazın').max(80, 'Yer en fazla 80 karakter'),
  description: z.string().trim().min(3, 'Kısa bir açıklama yazın').max(1000, 'Açıklama en fazla 1000 karakter'),
  urgent: z.boolean().default(false),
  photoUrl: z.string().max(500).nullable().optional(),
});

export const issueUpdateSchema = z.object({
  status: z.enum(ISSUE_STATUS_KEYS as [IssueStatus, ...IssueStatus[]]).optional(),
  assigneeUserId: z.uuid().nullable().optional(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'Mesaj boş').max(2000, 'Mesaj en fazla 2000 karakter'),
});

export const SUPPORT_KINDS = { problem: 'Sorun', suggestion: 'Öneri', question: 'Soru' } as const;
export type SupportKind = keyof typeof SUPPORT_KINDS;
export const SUPPORT_KIND_KEYS = Object.keys(SUPPORT_KINDS) as SupportKind[];

export const SUPPORT_AREAS = { board: 'Pano', panel: 'Web paneli', mobile: 'Mobil uygulama', data: 'Veri / içe aktarma', billing: 'Abonelik', other: 'Diğer' } as const;
export type SupportArea = keyof typeof SUPPORT_AREAS;

export const SUPPORT_STATUSES = { new: 'Yeni', answered: 'Yanıtlandı', resolved: 'Çözüldü' } as const;
export type SupportStatus = keyof typeof SUPPORT_STATUSES;

export const supportCreateSchema = z.object({
  kind: z.enum(SUPPORT_KIND_KEYS as [SupportKind, ...SupportKind[]]).default('problem'),
  area: z.enum(Object.keys(SUPPORT_AREAS) as [SupportArea, ...SupportArea[]]).default('other'),
  subject: z.string().trim().min(3, 'Konu en az 3 karakter').max(120, 'Konu en fazla 120 karakter'),
  body: z.string().trim().min(5, 'Açıklama yazın').max(4000, 'Açıklama en fazla 4000 karakter'),
  attachmentUrl: z.string().max(500).nullable().optional(),
});

export const supportStatusSchema = z.object({ status: z.enum(['new', 'answered', 'resolved']) });

export interface IssueMessage {
  id: string;
  userName: string;
  mine: boolean;
  /** Durum değişikliği gibi sistem satırı */
  system: boolean;
  body: string;
  at: string;
}

export interface SchoolIssue {
  id: string;
  category: IssueCategory;
  location: string;
  description: string;
  urgent: boolean;
  photoUrl: string | null;
  status: IssueStatus;
  reporterName: string;
  mine: boolean;
  assigneeUserId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  lastMessage: string | null;
  messages?: IssueMessage[];
}

export interface SupportTicket {
  id: string;
  kind: SupportKind;
  area: SupportArea;
  subject: string;
  status: SupportStatus;
  schoolId: string;
  schoolName: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  messages?: (IssueMessage & { fromPlatform: boolean; attachmentUrl: string | null })[];
}
