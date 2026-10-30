import { BOARD_MODULES, layoutModules, MODULE_LABELS, type BoardLayout, type BoardModule, type LayoutItem } from '@okulpano/shared';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BellRing,
  BookOpen,
  Cake,
  CalendarDays,
  EyeOff,
  GraduationCap,
  GripVertical,
  Layers,
  Link2,
  Unlink2,
  Library,
  Megaphone,
  Plus,
  ShieldCheck,
  Trophy,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

const ICONS: Record<BoardModule, LucideIcon> = {
  exams: GraduationCap,
  duties: ShieldCheck,
  leaves: UserMinus,
  birthdays: Cake,
  bell: BellRing,
  lessons: BookOpen,
  achievements: Trophy,
  events: CalendarDays,
  book: Library,
};

const HINTS: Partial<Record<BoardModule, string>> = {
  leaves: 'İzinli yoksa görünmez',
  birthdays: 'Doğum günü yoksa görünmez',
  exams: 'Sınav yoksa görünmez',
  lessons: 'Ders yoksa görünmez',
  achievements: 'Panelde Başarılar sayfasından',
  events: 'Önümüzdeki 30 gün',
  book: 'Panelde Haftanın Kitabı sayfasından',
};

type Column = 'left' | 'right';

/* Düzen üzerinde saf işlemler: kartı çıkar, yerleştir, alttakiyle birleştir, gruptan ayır */
const without = (items: LayoutItem[], m: BoardModule): LayoutItem[] =>
  items.flatMap((it): LayoutItem[] => {
    if (!Array.isArray(it)) return it === m ? [] : [it];
    const rest = it.filter((x) => x !== m);
    return rest.length > 1 ? [rest] : rest;
  });
const removeEverywhere = (l: BoardLayout, m: BoardModule): BoardLayout => ({ left: without(l.left, m), right: without(l.right, m) });

/**
 * Pano düzeni düzenleyicisi: kartlar sürüklenerek sütunlar arasında taşınır ve sıralanır
 * (dokunmatik ekranda oklar kullanılır). İlgili kartlar "Alttakiyle birleştir" ile tek kartta
 * toplanır ve panoda aynı yerde sırayla döner. Orta alan duyurulara ayrılmıştır.
 */
export function LayoutEditor({ value, onChange, disabled }: { value: BoardLayout; onChange: (l: BoardLayout) => void; disabled?: boolean }) {
  const [dragging, setDragging] = useState<BoardModule | null>(null);
  const [over, setOver] = useState<{ col: Column; index: number } | null>(null);
  const used = layoutModules(value);
  const hidden = BOARD_MODULES.filter((m) => !used.includes(m));

  /** Kartı sütunda verilen öğenin önüne (index) tek kart olarak yerleştirir */
  const place = (m: BoardModule, col: Column, index: number) => {
    // Hedefteki öğe, kart çıkarıldıktan sonra yeri kayabilir: o öğenin ilk kartına göre yeniden bulunur
    const anchor = [value[col][index] ?? []].flat().find((x) => x !== m) ?? null;
    const next = removeEverywhere(value, m);
    const list = [...next[col]];
    const at = anchor ? list.findIndex((it) => [it].flat().includes(anchor)) : list.length;
    list.splice(at < 0 ? list.length : at, 0, m);
    onChange({ ...next, [col]: list });
  };
  const hide = (m: BoardModule) => onChange(removeEverywhere(value, m));
  const moveItem = (col: Column, i: number, delta: number) => {
    const list = [...value[col]];
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    onChange({ ...value, [col]: list });
  };
  const moveToOther = (col: Column, i: number) => {
    const other: Column = col === 'left' ? 'right' : 'left';
    const item = value[col][i]!;
    onChange({ ...value, [col]: value[col].filter((_, j) => j !== i), [other]: [...value[other], item] } as BoardLayout);
  };
  const merge = (col: Column, i: number) => {
    const list = [...value[col]];
    const a = list[i]!;
    const b = list[i + 1]!;
    const group = [...[a].flat(), ...[b].flat()].slice(0, 4) as BoardModule[];
    list.splice(i, 2, group);
    onChange({ ...value, [col]: list });
  };
  const split = (col: Column, i: number, m: BoardModule) => {
    const list = [...value[col]];
    const g = list[i] as BoardModule[];
    const rest = g.filter((x) => x !== m);
    list.splice(i, 1, ...(rest.length > 1 ? [rest] : rest), m);
    onChange({ ...value, [col]: list });
  };

  const drop = (col: Column, index: number) => {
    if (dragging) place(dragging, col, index);
    setDragging(null);
    setOver(null);
  };

  const cardRow = (m: BoardModule, controls: ReactNode) => {
    const Icon = ICONS[m];
    return (
      <div
        draggable={!disabled}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.stopPropagation();
          setDragging(m);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        className={clsx(
          'group flex items-center gap-2 rounded-xl bg-surface p-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-200 transition',
          !disabled && 'cursor-grab active:cursor-grabbing',
          dragging === m && 'opacity-40',
        )}
      >
        <GripVertical className="size-4 shrink-0 text-slate-300" />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{MODULE_LABELS[m]}</span>
          {HINTS[m] && <span className="block truncate text-[11px] text-slate-400">{HINTS[m]}</span>}
        </span>
        {!disabled && <span className="flex shrink-0 items-center pointer-fine:hidden pointer-fine:group-hover:flex">{controls}</span>}
      </div>
    );
  };

  const columnView = (col: Column) => {
    const items = value[col];
    return (
      <div
        className={clsx(
          'flex min-h-48 flex-col gap-2 rounded-2xl p-2.5 ring-1 transition',
          over?.col === col ? 'bg-brand-50 ring-2 ring-brand-400' : 'bg-slate-50 ring-slate-200',
        )}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          if (over?.col !== col) setOver({ col, index: items.length });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(col, over?.col === col ? over.index : items.length);
        }}
      >
        <div className="px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{col === 'left' ? 'Sol sütun' : 'Sağ sütun'}</div>
        {items.map((item, i) => {
          const common = (
            <>
              <EditorButton label="Yukarı" disabled={i === 0} onClick={() => moveItem(col, i, -1)} icon={ArrowUp} />
              <EditorButton label="Aşağı" disabled={i === items.length - 1} onClick={() => moveItem(col, i, 1)} icon={ArrowDown} />
              <EditorButton label={col === 'left' ? 'Sağ sütuna taşı' : 'Sol sütuna taşı'} onClick={() => moveToOther(col, i)} icon={col === 'left' ? ArrowRight : ArrowLeft} />
            </>
          );
          const canMerge = i < items.length - 1 && [item, items[i + 1]!].flat().length <= 4;
          return (
            <div
              key={[item].flat().join('+')}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                if (over?.col !== col || over.index !== index) setOver({ col, index });
              }}
            >
              {over?.col === col && over.index === i && <div className="mb-2 h-1 rounded-full bg-brand-500" />}
              {Array.isArray(item) ? (
                // Birleşik kart: içindekiler panoda aynı yerde sırayla döner
                <div className="rounded-2xl bg-brand-50/60 p-1.5 ring-1 ring-brand-200">
                  <div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-1.5 text-[11px] font-semibold text-brand-700">
                    <Layers className="size-3.5" /> <span title="İçeriği olan kartlar panoda aynı yerde sırayla döner">Birleşik kart</span>
                    {!disabled && <span className="ml-auto flex">{common}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {item.map((m) => (
                      <div key={m}>{cardRow(m, <EditorButton label="Birleşik karttan ayır" onClick={() => split(col, i, m)} icon={Unlink2} />)}</div>
                    ))}
                  </div>
                </div>
              ) : (
                cardRow(
                  item,
                  <>
                    {common}
                    <EditorButton label="Panodan kaldır" onClick={() => hide(item)} icon={EyeOff} />
                  </>,
                )
              )}
              {!disabled && canMerge && (
                <div className="flex justify-center py-0.5">
                  <button
                    type="button"
                    onClick={() => merge(col, i)}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-brand-50 hover:text-brand-700"
                    title="İki kart tek yerde sırayla dönsün"
                  >
                    <Link2 className="size-3" /> Alttakiyle birleştir
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {over?.col === col && over.index === items.length && <div className="h-1 rounded-full bg-brand-500" />}
        {!items.length && <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-slate-400">Kart yok · buraya sürükleyin</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(13rem,1fr)_minmax(0,2fr)_minmax(13rem,1fr)]">
        {columnView('left')}
        <div className="hidden flex-col items-center justify-center gap-2 rounded-2xl bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(100,116,139,0.06)_10px_20px)] p-4 text-center ring-1 ring-slate-200 ring-dashed md:flex">
          <Megaphone className="size-6 text-slate-400" />
          <div className="text-sm font-semibold text-slate-600">Duyurular</div>
          <div className="text-xs text-slate-400">Görsel, video ve metin slaytları · orta alan sabit</div>
        </div>
        {columnView('right')}
      </div>
      <p className="text-xs text-slate-500">
        İpucu: çok kart açınca alan daralır. İlgili kartları (ör. izinli öğretmenler + doğum günleri, başarılar + haftanın kitabı) aradaki “Alttakiyle birleştir” ile tek kartta toplayın; panoda aynı yerde 12 saniyede bir sırayla döner, içeriği olmayan atlanır.
      </p>
      <div className="rounded-2xl p-3 ring-1 ring-slate-200 ring-dashed">
        <div className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Panoda gösterilmeyen kartlar</div>
        {hidden.length ? (
          <div className="flex flex-wrap gap-2">
            {hidden.map((m) => {
              const Icon = ICONS[m];
              return (
                <span key={m} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 py-1 pr-1 pl-2.5 text-sm text-slate-600 ring-1 ring-slate-200">
                  <Icon className="size-4 text-slate-400" />
                  {MODULE_LABELS[m]}
                  {!disabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => onChange({ ...value, left: [...value.left, m] })}
                        className="ml-1 inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        <Plus className="size-3" /> Sol
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange({ ...value, right: [...value.right, m] })}
                        className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        <Plus className="size-3" /> Sağ
                      </button>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Tüm kartlar panoda.</p>
        )}
      </div>
    </div>
  );
}

function EditorButton({ label, onClick, icon: Icon, disabled }: { label: string; onClick: () => void; icon: LucideIcon; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:opacity-30"
    >
      <Icon className="size-3.5" />
    </button>
  );
}
