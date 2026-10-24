import { BOARD_MODULES, MODULE_LABELS, type BoardLayout, type BoardModule } from '@okulpano/shared';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BellRing,
  BookOpen,
  Cake,
  EyeOff,
  GraduationCap,
  GripVertical,
  Megaphone,
  Plus,
  ShieldCheck,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

const ICONS: Record<BoardModule, LucideIcon> = {
  exams: GraduationCap,
  duties: ShieldCheck,
  leaves: UserMinus,
  birthdays: Cake,
  bell: BellRing,
  lessons: BookOpen,
};

const HINTS: Partial<Record<BoardModule, string>> = {
  leaves: 'İzinli yoksa kısa not',
  birthdays: 'Doğum günü yoksa kısa not',
  exams: 'Sınav yoksa kısa not',
  lessons: 'Ders yoksa kısa not',
};

type Column = 'left' | 'right';

/**
 * Pano düzeni düzenleyicisi: kartlar sürüklenerek sütunlar arasında taşınır ve sıralanır
 * (dokunmatik ekranda oklar kullanılır). Orta alan duyurulara ayrılmıştır.
 */
export function LayoutEditor({ value, onChange, disabled }: { value: BoardLayout; onChange: (l: BoardLayout) => void; disabled?: boolean }) {
  const [dragging, setDragging] = useState<BoardModule | null>(null);
  const [over, setOver] = useState<{ col: Column; index: number } | null>(null);
  const hidden = BOARD_MODULES.filter((m) => !value.left.includes(m) && !value.right.includes(m));

  const place = (m: BoardModule, col: Column, index: number) => {
    const without = { left: value.left.filter((x) => x !== m), right: value.right.filter((x) => x !== m) };
    const list = [...without[col]];
    list.splice(Math.max(0, Math.min(index, list.length)), 0, m);
    onChange({ ...without, [col]: list });
  };
  const hide = (m: BoardModule) => onChange({ left: value.left.filter((x) => x !== m), right: value.right.filter((x) => x !== m) });
  const move = (m: BoardModule, col: Column, delta: number) => place(m, col, value[col].indexOf(m) + delta);

  const drop = (col: Column, index: number) => {
    if (dragging) place(dragging, col, index);
    setDragging(null);
    setOver(null);
  };

  const columnView = (col: Column) => (
    <div
      className={clsx(
        'flex min-h-48 flex-col gap-2 rounded-2xl p-2.5 ring-1 transition',
        over?.col === col ? 'bg-brand-50 ring-2 ring-brand-400' : 'bg-slate-50 ring-slate-200',
      )}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        if (over?.col !== col) setOver({ col, index: value[col].length });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        drop(col, over?.col === col ? over.index : value[col].length);
      }}
    >
      <div className="px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{col === 'left' ? 'Sol sütun' : 'Sağ sütun'}</div>
      {value[col].map((m, i) => {
        const Icon = ICONS[m];
        return (
          <div key={m}>
            {over?.col === col && over.index === i && dragging !== m && <div className="mb-2 h-1 rounded-full bg-brand-500" />}
            <div
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDragging(m);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                if (over?.col !== col || over.index !== index) setOver({ col, index });
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
              {!disabled && (
                <span className="flex shrink-0 items-center pointer-fine:hidden pointer-fine:group-hover:flex">
                  <EditorButton label="Yukarı" disabled={i === 0} onClick={() => move(m, col, -1)} icon={ArrowUp} />
                  <EditorButton label="Aşağı" disabled={i === value[col].length - 1} onClick={() => move(m, col, 1)} icon={ArrowDown} />
                  <EditorButton
                    label={col === 'left' ? 'Sağ sütuna taşı' : 'Sol sütuna taşı'}
                    onClick={() => place(m, col === 'left' ? 'right' : 'left', value[col === 'left' ? 'right' : 'left'].length)}
                    icon={col === 'left' ? ArrowRight : ArrowLeft}
                  />
                  <EditorButton label="Panodan kaldır" onClick={() => hide(m)} icon={EyeOff} />
                </span>
              )}
            </div>
          </div>
        );
      })}
      {over?.col === col && over.index === value[col].length && <div className="h-1 rounded-full bg-brand-500" />}
      {!value[col].length && <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-slate-400">Kart yok · buraya sürükleyin</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,1.25fr)]">
        {columnView('left')}
        <div className="hidden flex-col items-center justify-center gap-2 rounded-2xl bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(100,116,139,0.06)_10px_20px)] p-4 text-center ring-1 ring-slate-200 ring-dashed md:flex">
          <Megaphone className="size-6 text-slate-400" />
          <div className="text-sm font-semibold text-slate-600">Duyurular</div>
          <div className="text-xs text-slate-400">Görsel, video ve metin slaytları · orta alan sabit</div>
        </div>
        {columnView('right')}
      </div>
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
                        onClick={() => place(m, 'left', value.left.length)}
                        className="ml-1 inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        <Plus className="size-3" /> Sol
                      </button>
                      <button
                        type="button"
                        onClick={() => place(m, 'right', value.right.length)}
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
