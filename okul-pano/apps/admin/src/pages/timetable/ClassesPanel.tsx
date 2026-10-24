import { compareClassNames, gradeHue, gradeOf, normalizeClassName } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Card } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath, type ClassGroup } from '../../lib/data.ts';

/**
 * Sınıflar listesi ders programının yanında durur ve aynı zamanda sınıf seçicidir:
 * tıklanan sınıfın programı açılır. Ekle / yeniden adlandır / sil burada yapılır;
 * sıralama her zaman doğal sıradır (9-A, 9-B, 10-A…), pano da bu sırayı kullanır.
 */
export function ClassesPanel({
  classes,
  activeId,
  onSelect,
  editable,
  lessonCounts,
}: {
  classes: ClassGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  editable: boolean;
  /** Sınıf başına programdaki ders sayısı */
  lessonCounts: Map<string, number>;
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('classes');
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: [schoolId, 'classes'] });

  /** Sınıflar her değişiklikten sonra doğal sıraya dizilir */
  const resort = async (list: { id: string; name: string }[]) => {
    const sorted = [...list].sort((a, b) => compareClassNames(a.name, b.name));
    if (sorted.length) await api(`${path}/reorder`, { method: 'POST', body: { ids: sorted.map((c) => c.id) } });
  };

  const add = async () => {
    // "9-A, 9-B, 9-C" ya da "9-A 9-B" gibi birden fazla sınıf birlikte eklenebilir
    const names = [...new Set(draft.split(/[,;\n]+|\s{2,}|\s(?=\d)/).map((n) => normalizeClassName(n)).filter(Boolean))];
    const existing = new Set(classes.map((c) => c.name.toLocaleUpperCase('tr-TR')));
    const fresh = names.filter((n) => !existing.has(n.toLocaleUpperCase('tr-TR')));
    if (!fresh.length) {
      if (names.length) toast.error('Bu sınıf zaten listede');
      return;
    }
    setBusy(true);
    try {
      const created: ClassGroup[] = [];
      for (const name of fresh) created.push(await api<ClassGroup>(path, { method: 'POST', body: { name, sortOrder: 0 } }));
      await resort([...classes, ...created]);
      await refresh();
      setDraft('');
      toast.success(fresh.length > 1 ? `${fresh.length} sınıf eklendi` : `${fresh[0]} eklendi`);
      if (!activeId && created[0]) onSelect(created[0].id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!editing) return;
    const name = normalizeClassName(editing.name);
    const current = classes.find((c) => c.id === editing.id);
    if (!name || !current || name === current.name) return setEditing(null);
    try {
      await api(`${path}/${editing.id}`, { method: 'PUT', body: { name, sortOrder: current.sortOrder } });
      await resort(classes.map((c) => (c.id === editing.id ? { ...c, name } : c)));
      await refresh();
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`${path}/${id}`, { method: 'DELETE' });
      await refresh();
      await qc.invalidateQueries({ queryKey: [schoolId, 'timetable'] });
      setConfirmDelete(null);
      if (id === activeId) onSelect('');
      toast.success('Sınıf silindi');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Silinemedi');
    }
  };

  // Kademelere göre grupla
  const groups = new Map<string, ClassGroup[]>();
  for (const c of [...classes].sort((a, b) => compareClassNames(a.name, b.name))) {
    const g = gradeOf(c.name);
    const key = g === null ? 'Diğer' : `${g}. sınıflar`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Sınıflar</h2>
          <p className="text-xs text-slate-500">{classes.length} şube · programını görmek için seçin</p>
        </div>
      </div>

      {editable && (
        <form
          className="flex gap-2 border-b border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Sınıf ekle: 9-A, 9-B…"
            aria-label="Yeni sınıf"
            className="h-9 min-w-0 flex-1 rounded-xl border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:bg-surface focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Ekle"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </form>
      )}

      <div className="max-h-[32rem] space-y-3 overflow-y-auto p-3">
        {classes.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-500">Henüz sınıf yok. Yukarıdan ekleyin; virgülle birden fazla yazabilirsiniz.</p>}
        {[...groups].map(([label, list]) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              <span className="size-2 rounded-full" style={{ background: gradeHue(list[0]!.name) }} />
              {label}
            </div>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-2">
              {list.map((c) => {
                const active = c.id === activeId;
                const count = lessonCounts.get(c.id) ?? 0;
                if (editing?.id === c.id) {
                  return (
                    <li key={c.id} className="col-span-2 flex items-center gap-1 sm:col-span-3 xl:col-span-2">
                      <input
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        aria-label="Sınıf adı"
                        className="h-9 min-w-0 flex-1 rounded-xl border-0 px-3 text-sm font-semibold ring-2 ring-brand-500 focus:outline-none"
                      />
                      <button type="button" aria-label="Kaydet" onClick={() => void rename()} className="flex size-9 items-center justify-center rounded-xl text-emerald-600 hover:bg-emerald-50">
                        <Check className="size-4" />
                      </button>
                      <button type="button" aria-label="Vazgeç" onClick={() => setEditing(null)} className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100">
                        <X className="size-4" />
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      title={count ? `${c.name} · programda ${count} ders` : `${c.name} · program boş`}
                      style={{ '--hue': gradeHue(c.name) } as CSSProperties}
                      className={clsx(
                        'flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-left text-sm font-bold transition',
                        active
                          ? 'bg-[var(--hue)] text-white shadow-[0_6px_16px_-8px_var(--hue)]'
                          : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200/80 hover:bg-surface hover:ring-[var(--hue)]',
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      {!count && <span className={clsx('size-1.5 shrink-0 rounded-full', active ? 'bg-surface/70' : 'bg-amber-400')} title="Program boş" />}

                    </button>
                    {editable &&
                      (confirmDelete === c.id ? (
                        <button
                          type="button"
                          onClick={() => void remove(c.id)}
                          onBlur={() => setConfirmDelete(null)}
                          autoFocus
                          className="absolute inset-0 rounded-xl bg-red-600 text-xs font-semibold text-white"
                        >
                          Silinsin mi?
                        </button>
                      ) : (
                        <span className={clsx('absolute top-1/2 right-1 hidden -translate-y-1/2 gap-0.5 pointer-fine:group-hover:flex', active && 'pointer-coarse:flex')}>
                          <button
                            type="button"
                            aria-label={`${c.name} adını değiştir`}
                            onClick={() => setEditing({ id: c.id, name: c.name })}
                            className={clsx('flex size-6 items-center justify-center rounded-lg', active ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700')}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${c.name} sil`}
                            onClick={() => setConfirmDelete(c.id)}
                            className={clsx('flex size-6 items-center justify-center rounded-lg', active ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-red-50 hover:text-red-600')}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </span>
                      ))}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
