import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Modal, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface PreviewRow {
  row: number;
  fullName: string;
  branch: string | null;
  title: string | null;
  isActive?: boolean;
  status: 'new' | 'update' | 'unchanged';
}

interface Preview {
  sheetName: string;
  rows: PreviewRow[];
  issues: { row: number; message: string }[];
  newBranches: string[];
  newTitles: string[];
  totals: { new: number; update: number; unchanged: number; skipped: number };
}

const STATUS = {
  new: { label: 'Yeni', tone: 'green' as const },
  update: { label: 'Güncellenecek', tone: 'blue' as const },
  unchanged: { label: 'Değişiklik yok', tone: 'slate' as const },
};

/**
 * Excel içe aktarma iki adımlıdır: önce dosya okunup ne olacağı gösterilir, onaylanınca kaydedilir.
 * Yanlış dosya yüklemek hiçbir veriyi değiştirmez.
 */
export function ImportDialog({ file, onClose }: { file: File | null; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('teachers');
  const qc = useQueryClient();
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);

  useEffect(() => {
    if (!file) return;
    setPreview(null);
    setError(null);
    setLoading(true);
    const form = new FormData();
    form.append('file', file);
    api<Preview>(`${path}/import/preview`, { method: 'POST', form })
      .then(setPreview)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [file, path]);

  const toImport = preview?.rows.filter((r) => r.status === 'new' || (updateExisting && r.status === 'update')) ?? [];

  const commit = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await api<{ created: number; updated: number; branchesCreated: number; titlesCreated: number }>(`${path}/import`, {
        method: 'POST',
        body: {
          updateExisting,
          rows: preview.rows.map(({ fullName, branch, title, isActive }) => ({ fullName, branch, title, isActive })),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: [schoolId, 'teachers'] }),
        qc.invalidateQueries({ queryKey: [schoolId, 'teacher-branches'] }),
        qc.invalidateQueries({ queryKey: [schoolId, 'teacher-titles'] }),
      ]);
      const parts = [`${res.created} öğretmen eklendi`];
      if (res.updated) parts.push(`${res.updated} güncellendi`);
      if (res.branchesCreated) parts.push(`${res.branchesCreated} yeni branş`);
      if (res.titlesCreated) parts.push(`${res.titlesCreated} yeni ünvan`);
      toast.success(parts.join(', '));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İçe aktarma başarısız.');
    } finally {
      setSaving(false);
    }
  };

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
          <Button loading={saving} disabled={!toImport.length} onClick={() => void commit()}>
            {toImport.length ? `${toImport.length} öğretmeni kaydet` : 'Kaydedilecek satır yok'}
          </Button>
        </>
      }
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="size-5 animate-spin" /> Dosya okunuyor…
        </div>
      )}
      {error && <Alert tone="red">{error}</Alert>}
      {preview && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Yeni öğretmen', value: preview.totals.new, tone: 'text-emerald-700 bg-emerald-50' },
              { label: 'Güncellenecek', value: preview.totals.update, tone: 'text-brand-700 bg-brand-50' },
              { label: 'Değişiklik yok', value: preview.totals.unchanged, tone: 'text-slate-600 bg-slate-100' },
              { label: 'Atlanacak satır', value: preview.totals.skipped, tone: preview.totals.skipped ? 'text-amber-800 bg-amber-50' : 'text-slate-600 bg-slate-100' },
            ].map((s) => (
              <div key={s.label} className={clsx('rounded-xl px-4 py-3', s.tone)}>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs font-medium">{s.label}</div>
              </div>
            ))}
          </div>

          {(preview.newBranches.length > 0 || preview.newTitles.length > 0) && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200/70">
              {preview.newBranches.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-700">Listeye eklenecek branşlar:</span>
                  {preview.newBranches.map((b) => (
                    <Badge key={b} tone="blue">
                      {b}
                    </Badge>
                  ))}
                </div>
              )}
              {preview.newTitles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-700">Listeye eklenecek ünvanlar:</span>
                  {preview.newTitles.map((t) => (
                    <Badge key={t} tone="blue">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {preview.totals.update > 0 && (
            <Toggle
              checked={updateExisting}
              onChange={setUpdateExisting}
              label="Sistemde kayıtlı öğretmenlerin branş ve ünvanını güncelle"
              description="Kapalıysa yalnızca yeni öğretmenler eklenir. Dosyadaki boş hücreler mevcut bilgiyi silmez."
            />
          )}

          {preview.issues.length > 0 && (
            <details className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200" open={preview.issues.length <= 5}>
              <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" /> {preview.issues.length} satır atlanacak
              </summary>
              <ul className="mt-2 space-y-1">
                {preview.issues.map((i) => (
                  <li key={`${i.row}-${i.message}`}>
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
                      <th className="px-3 py-2">Ad soyad</th>
                      <th className="px-3 py-2">Branş</th>
                      <th className="px-3 py-2">Ünvan</th>
                      <th className="px-3 py-2">Sonuç</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((r) => {
                      const s = r.status === 'update' && !updateExisting ? STATUS.unchanged : STATUS[r.status];
                      return (
                        <tr key={r.row}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.row}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{r.fullName}</td>
                          <td className="px-3 py-2 text-slate-600">{r.branch ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{r.title ?? '—'}</td>
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
              Dosyada içe aktarılabilecek öğretmen bulunamadı.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
