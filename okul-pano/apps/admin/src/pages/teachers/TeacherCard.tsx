import clsx from 'clsx';
import { Pencil, Trash2 } from 'lucide-react';
import type { Teacher } from '../../lib/data.ts';

/** Branşa göre sabit avatar rengi: aynı branştaki öğretmenler listede görsel olarak gruplanır. */
const PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-800',
  'bg-lime-100 text-lime-800',
  'bg-orange-100 text-orange-800',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-teal-100 text-teal-800',
];

function colorFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/**
 * Öğretmen kartı. Fareyle kullanılan ekranlarda düzenle/sil düğmeleri kartın üzerine gelince
 * (ya da klavyeyle odaklanınca) görünür; dokunmatik ekranlarda her zaman görünür.
 */
export function TeacherCard({
  teacher,
  editable,
  onEdit,
  onDelete,
}: {
  teacher: Teacher;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={clsx(
        'group relative flex min-w-0 gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 transition-shadow hover:shadow-md',
        !teacher.isActive && 'bg-slate-50',
      )}
    >
      <div
        className={clsx(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          teacher.isActive ? colorFor(teacher.branch ?? teacher.fullName) : 'bg-slate-200 text-slate-500',
        )}
        aria-hidden="true"
      >
        {initials(teacher.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className={clsx(
            // Dokunmatikte düğmeler hep görünür: isim onların altına girmesin. Faredeyse düğmeler yalnızca üzerine gelince çıkar.
            'line-clamp-2 pr-[5.25rem] text-[15px] leading-snug font-semibold break-words pointer-fine:pr-0',
            teacher.isActive ? 'text-slate-900' : 'text-slate-500',
          )}
          title={teacher.fullName}
        >
          {teacher.fullName}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-500">{teacher.title ?? 'Ünvan girilmemiş'}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {teacher.branch ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs leading-snug font-semibold break-words text-slate-700">{teacher.branch}</span>
          ) : (
            <span className="rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400">Branş yok</span>
          )}
          {!teacher.isActive && <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Pasif</span>}
        </div>
      </div>
      {editable && (
        <div
          className={clsx(
            'absolute top-3 right-3 flex gap-1 transition-opacity',
            'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100',
          )}
        >
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${teacher.fullName} düzenle`}
            title="Düzenle"
            className="inline-flex size-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`${teacher.fullName} sil`}
            title="Sil"
            className="inline-flex size-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </article>
  );
}
