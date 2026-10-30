import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, FileSpreadsheet, Loader2, UserPlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useToast } from './Toast.tsx';
import { Alert, Badge, Button, Modal } from './ui.tsx';

export type RowStatus = 'new' | 'update' | 'unchanged' | 'skip';

export interface ImportPreview<R> {
  sheetName: string;
  rows: (R & { row: number; status: RowStatus })[];
  issues: { row: number; message: string }[];
  totals: { new: number; update: number; unchanged: number; skipped: number; removed?: number };
}

type Tone = 'green' | 'blue' | 'slate' | 'amber' | 'red';

const TILE: Record<Tone, string> = {
  green: 'text-emerald-700 bg-emerald-50',
  blue: 'text-brand-700 bg-brand-50',
  slate: 'text-slate-600 bg-slate-100',
  amber: 'text-amber-800 bg-amber-50',
  red: 'text-red-700 bg-red-50',
};

export const STATUS_BADGE: Record<RowStatus, { label: string; tone: Tone }> = {
  new: { label: 'Yeni', tone: 'green' },
  update: { label: 'Güncellenecek', tone: 'blue' },
  unchanged: { label: 'Değişiklik yok', tone: 'slate' },
  skip: { label: 'Atlanacak', tone: 'amber' },
};

/**
 * Çizelgede kadroda olmayan öğretmenler (ör. kadrosu henüz girilmemiş okul): kaydederken Öğretmen Kadrosu'na
 * eklenip eklenmeyeceği sorulur. Kadrodaki bir isme benzeyenler yazım hatası sayılır ve burada çıkmaz.
 */
export function NewTeachersOption({ names, checked, onChange }: { names: string[]; checked: boolean; onChange: (v: boolean) => void }) {
  if (!names.length) return null;
  return (
    <div className="rounded-xl bg-brand-50/60 p-4 text-sm ring-1 ring-brand-200">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <span className="flex items-center gap-1.5 font-semibold text-ink">
            <UserPlus className="size-4" /> Kadroda olmayan {names.length} öğretmeni Öğretmen Kadrosu'na ekle
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {checked
              ? 'Kaydederken kadroya eklenir; branş ve unvanı sonra Öğretmen Kadrosu sayfasından düzenleyebilirsiniz.'
              : 'İşaretlemezseniz bu öğretmenlerin satırları atlanır.'}
          </span>
        </span>
      </label>
      <div className="mt-3 flex max-h-32 flex-wrap gap-1.5 overflow-auto">
        {names.map((n) => (
          <Badge key={n} tone={checked ? 'blue' : 'slate'}>
            {n}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export interface ExcelImportDialogProps<R, P extends ImportPreview<R>, O> {
  file: File | null;
  onClose: () => void;
  /** ör. /api/schools/:id/students */
  basePath: string;
  columns: { header: string; cell: (row: P['rows'][number]) => ReactNode }[];
  initialOptions: O;
  stats: (p: P, o: O) => { label: string; value: number; tone: Tone }[];
  /** Listeye eklenecek yeni değerler (branş, sınıf, nöbet yeri…) */
  additions?: (p: P) => { label: string; values: string[] }[];
  /** Kaydetme seçenekleri (güncelleme anahtarı, değiştir/ekle…) */
  renderOptions?: (p: P, o: O, set: (o: O) => void) => ReactNode;
  /** Önizleme tablosunun altına ek bilgi (ör. kaldırılacak nöbetler) */
  renderExtra?: (p: P, o: O) => ReactNode;
  rowStatus?: (row: P['rows'][number], o: O) => RowStatus;
  commitCount: (p: P, o: O) => number;
  commitLabel: (n: number, o: O) => string;
  commitBody: (p: P, o: O) => unknown;
  successMessage: (result: never, p: P, o: O) => string;
  /** Başarıdan sonra tazelenecek listeler (sorgu anahtarları) */
  invalidate: string[];
  /** Önizleme isteğine eklenecek sorgu (ör. "?month=2026-10"); değişince önizleme yeniden alınır */
  previewQuery?: (o: O) => string;
}

/**
 * Excel içe aktarma iki adımlıdır: önce dosya okunup ne olacağı gösterilir, onaylanınca kaydedilir.
 * Yanlış dosya yüklemek hiçbir veriyi değiştirmez. Öğretmen, öğrenci ve nöbet sayfaları ortak kullanır.
 */
export function ExcelImportDialog<R, P extends ImportPreview<R>, O>(props: ExcelImportDialogProps<R, P, O>) {
  const { file, onClose, basePath } = props;
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [preview, setPreview] = useState<P | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<O>(props.initialOptions);

  // Yeni dosyada seçenekler sıfırlanır
  useEffect(() => {
    if (file) setOptions(props.initialOptions);
    // initialOptions bilinçli olarak bağımlılık değil: yalnızca yeni dosyada sıfırlanır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const query = props.previewQuery?.(options) ?? '';
  useEffect(() => {
    if (!file) return;
    let alive = true;
    setError(null);
    setLoading(true);
    const form = new FormData();
    form.append('file', file);
    api<P>(`${basePath}/import/preview${query}`, { method: 'POST', form })
      .then((p) => alive && setPreview(p))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [file, basePath, query]);

  // Dosya kapanınca önizleme temizlenir
  useEffect(() => {
    if (!file) setPreview(null);
  }, [file]);

  const count = preview ? props.commitCount(preview, options) : 0;

  const commit = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const result = await api<never>(`${basePath}/import`, { method: 'POST', body: props.commitBody(preview, options) });
      await Promise.all(props.invalidate.map((key) => qc.invalidateQueries({ queryKey: [schoolId, key] })));
      toast.success(props.successMessage(result, preview, options));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İçe aktarma başarısız.');
    } finally {
      setSaving(false);
    }
  };

  const additions = preview && props.additions ? props.additions(preview).filter((a) => a.values.length) : [];

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size="xl"
      title="Excel'den içe aktar"
      description={file ? `${file.name}${preview ? ` · "${preview.sheetName}" sayfası` : ''}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={saving} disabled={!preview || !count} onClick={() => void commit()}>
            {preview && count ? props.commitLabel(count, options) : 'Kaydedilecek değişiklik yok'}
          </Button>
        </>
      }
    >
      {loading && !preview && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="size-5 animate-spin" /> Dosya okunuyor…
        </div>
      )}
      {error && <Alert tone="red">{error}</Alert>}
      {preview && (
        <div className={clsx('space-y-5 transition-opacity', loading && 'pointer-events-none opacity-50')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
            {props.stats(preview, options).map((s) => (
              <div key={s.label} className={clsx('rounded-xl px-4 py-3', TILE[s.tone])}>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs font-medium">{s.label}</div>
              </div>
            ))}
          </div>

          {additions.length > 0 && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200/70">
              {additions.map((a) => (
                <div key={a.label} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-700">{a.label}:</span>
                  {a.values.map((v) => (
                    <Badge key={v} tone="blue">
                      {v}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          )}

          {props.renderOptions?.(preview, options, setOptions)}

          {preview.issues.length > 0 && (
            <details className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200" open>
              <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" /> {preview.issues.length} satır atlanacak · nedenleri
              </summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                {preview.issues.map((i, n) => (
                  <li key={n}>
                    <span className="font-mono text-xs">{i.row}. satır:</span> {i.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.rows.length > 0 ? (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">Satır</th>
                      {props.columns.map((c) => (
                        <th key={c.header} className="px-3 py-2">
                          {c.header}
                        </th>
                      ))}
                      <th className="px-3 py-2">Sonuç</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((r, i) => {
                      const s = STATUS_BADGE[props.rowStatus ? props.rowStatus(r, options) : r.status];
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.row}</td>
                          {props.columns.map((c) => (
                            <td key={c.header} className="px-3 py-2 text-slate-700">
                              {c.cell(r)}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <Badge tone={s.tone}>{s.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500">
              <FileSpreadsheet className="size-8 text-slate-300" />
              Dosyada içe aktarılabilecek kayıt bulunamadı.
            </div>
          )}

          {props.renderExtra?.(preview, options)}
        </div>
      )}
    </Modal>
  );
}
