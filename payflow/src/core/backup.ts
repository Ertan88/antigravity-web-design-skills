import { migrate } from '../store/reducer';
import type { AppState } from './model';

/**
 * Elle yedek dosyası (JSON). Kullanıcı dosyayı dilediği yere kaydeder (Drive, iCloud, e-posta);
 * dosya geliştiriciye hiçbir zaman ulaşmaz.
 */
export interface BackupFile {
  app: 'payflow';
  format: 1;
  exportedAt: string;
  state: AppState;
}

export function makeBackup(state: AppState, now: Date): string {
  const file: BackupFile = { app: 'payflow', format: 1, exportedAt: now.toISOString(), state };
  return JSON.stringify(file, null, 1);
}

export const backupFileName = (now: Date) =>
  `PayFlow-yedek-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;

export class BackupError extends Error {}

/** Yedek dosyasını okur ve güncel şemaya taşır; geçersizse Türkçe hata fırlatır. */
export function parseBackup(text: string): { state: AppState; exportedAt: Date } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('Bu dosya okunamadı. PayFlow yedek dosyası (.json) seçtiğinden emin ol.');
  }
  const f = raw as Partial<BackupFile>;
  if (f?.app !== 'payflow' || typeof f.state !== 'object' || !f.state) {
    throw new BackupError('Bu bir PayFlow yedek dosyası değil.');
  }
  if (typeof f.format !== 'number' || f.format > 1) {
    throw new BackupError('Bu yedek uygulamanın daha yeni bir sürümüyle alınmış. Önce uygulamayı güncelle.');
  }
  const state = migrate(f.state);
  if (state === migrate(null)) throw new BackupError('Yedek dosyası bozuk görünüyor.');
  return { state, exportedAt: new Date(f.exportedAt ?? Date.now()) };
}

export const backupSummary = (s: AppState) =>
  `${s.cards.length} kart, ${s.bills.length} fatura, ${s.expenses.length} harcama`;
