import { BELL_OFF, bellGroups, compareClassNames, joinClassNames, WEEKDAY_NAMES, WEEKDAY_SHORT, type BellGroup, type BellGroupDay } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Plus, Settings2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Button, Card, Input, Modal } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type BellSchedule, type ClassGroup, type School, type TimetableEntry } from '../../lib/data.ts';

/** Çizelgelerin tablodaki renkleri (listedeki sırasına göre) */
const TONES = [
  'bg-sky-50 text-sky-900 ring-sky-200',
  'bg-violet-50 text-violet-900 ring-violet-200',
  'bg-pink-50 text-pink-900 ring-pink-200',
  'bg-orange-50 text-orange-900 ring-orange-200',
  'bg-teal-50 text-teal-900 ring-teal-200',
  'bg-lime-50 text-lime-900 ring-lime-200',
];

/**
 * Zil ataması tablosu: ders programından aynı düzendeki sınıflar gruplanır; her grup ve gün için hangi zilin çaldığı,
 * ilk–son ders ve bitiş saati görünür. Hücreye tıklayınca o grup için o günün zili değiştirilir.
 */
export function BellPlan({
  schedules,
  classes,
  timetable,
  editable,
}: {
  schedules: BellSchedule[];
  classes: ClassGroup[];
  timetable: TimetableEntry[];
  editable: boolean;
}) {
  const school = useSchool();
  const offsite = school.data?.settings.offsiteSubjects ?? [];
  const [cell, setCell] = useState<{ group: BellGroup; day: BellGroupDay } | null>(null);
  const [exemptOpen, setExemptOpen] = useState(false);
  const [offsiteOpen, setOffsiteOpen] = useState(false);
  const classNames = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  const weekdays = useMemo(() => {
    const days = new Set([1, 2, 3, 4, 5]);
    for (const s of schedules) for (const d of s.weekdays) days.add(d);
    for (const e of timetable) days.add(e.weekday);
    return [...days].sort();
  }, [schedules, timetable]);
  const groups = useMemo(() => bellGroups(classes, timetable, schedules, offsite, weekdays), [classes, timetable, schedules, offsite, weekdays]);
  const exempt = classes.filter((c) => c.bellExempt).sort((a, b) => compareClassNames(a.name, b.name));
  const tone = (id: string | undefined) => TONES[Math.max(0, schedules.findIndex((s) => s.id === id)) % TONES.length];
  const missing = groups.flatMap((g) => g.days.filter((d) => d.missing.length).map((d) => ({ g, d })));

  if (!timetable.length) return null;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">Zil ataması</h2>
          <p className="text-sm text-slate-500">
            Ders programındaki günlük düzene göre gruplandı. Her sınıf yalnızca kendi ilk–son dersi boyunca derstedir; farklı saat uygulanan bir gün için hücreye tıklayıp başka zil seçin.
          </p>
        </div>
        {editable && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Settings2 className="size-3.5" />} onClick={() => setOffsiteOpen(true)}>
              Okul dışı dersler
            </Button>
            <Button size="sm" variant="secondary" icon={<Settings2 className="size-3.5" />} onClick={() => setExemptOpen(true)}>
              Zil hesabına katılmayanlar
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto p-4 sm:p-5">
        <div className="grid min-w-[760px] gap-2" style={{ gridTemplateColumns: `15rem repeat(${weekdays.length}, minmax(0, 1fr))` }}>
          <div />
          {weekdays.map((d) => (
            <div key={d} className="px-1 text-xs font-bold tracking-wide text-slate-500 uppercase">
              {WEEKDAY_NAMES[d]}
            </div>
          ))}
          {groups.map((g, i) => {
            const names = g.classIds.map((id) => classNames.get(id) ?? '');
            return [
              <div key={`h${i}`} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
                <div className="text-sm font-bold text-ink">
                  Grup {i + 1} · {g.classIds.length} sınıf
                </div>
                <div className="line-clamp-2 text-xs text-slate-500" title={names.sort(compareClassNames).join(', ')}>
                  {joinClassNames(names)}
                </div>
              </div>,
              ...g.days.map((d) => (
                <button
                  key={`${i}-${d.weekday}`}
                  type="button"
                  disabled={!editable}
                  onClick={() => setCell({ group: g, day: d })}
                  className={clsx(
                    'min-w-0 rounded-xl px-3 py-2.5 text-left text-xs ring-1 transition',
                    editable && 'hover:ring-2 hover:ring-brand-400',
                    d.offsite || d.planned === BELL_OFF
                      ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
                      : d.first === null
                        ? 'bg-slate-50 text-slate-400 ring-slate-200'
                        : tone(d.schedule?.id),
                  )}
                >
                  {d.offsite || d.planned === BELL_OFF ? (
                    <>
                      <span className="block text-[13px] font-bold">Okul dışında</span>
                      {d.offsite ? 'Bütün dersleri okul dışında' : 'Bu gün okulda değil'}
                    </>
                  ) : d.first === null ? (
                    <span className="block py-1">Ders yok</span>
                  ) : (
                    <>
                      <span className="block truncate text-[13px] font-bold">{d.schedule?.name ?? 'Zil yok'}</span>
                      <span className="tabular-nums">
                        {d.first}–{d.last}. ders{d.start && d.end ? ` · ${d.start}–${d.end}` : ''}
                      </span>
                      {d.missing.length > 0 && (
                        <span className="mt-1 flex items-center gap-1 font-semibold text-amber-700">
                          <AlertTriangle className="size-3.5" /> {d.missing.join(', ')}. ders zilde yok
                        </span>
                      )}
                    </>
                  )}
                </button>
              )),
            ];
          })}
          {exempt.length > 0 && (
            <>
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5">
                <div className="text-sm font-bold text-slate-500">Zil hesabına katılmayan · {exempt.length}</div>
                <div className="line-clamp-2 text-xs text-slate-400">{exempt.map((c) => c.name).join(', ')}</div>
              </div>
              <div className="flex items-center rounded-xl border border-dashed border-slate-300 px-3 text-xs text-slate-400" style={{ gridColumn: `span ${weekdays.length}` }}>
                Bu sınıflar genel zili izler; panodaki zil seçimine, "Şu an derste" listesine ve öğretmen çakışma denetimine girmez.
              </div>
            </>
          )}
        </div>
        {missing.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Bazı derslerin ders saati zilde yok ({missing.map(({ d }) => `${WEEKDAY_SHORT[d.weekday]} ${d.missing.join(', ')}. ders`).join('; ')}). O güne daha çok ders saati olan bir zil seçin ya da zile ders saati ekleyin.
          </p>
        )}
      </div>

      <CellDialog cell={cell} schedules={schedules} classNames={classNames} onClose={() => setCell(null)} />
      <ExemptDialog open={exemptOpen} classes={classes} onClose={() => setExemptOpen(false)} />
      <OffsiteDialog open={offsiteOpen} subjects={offsite} timetable={timetable} onClose={() => setOffsiteOpen(false)} />
    </Card>
  );
}

function CellDialog({
  cell,
  schedules,
  classNames,
  onClose,
}: {
  cell: { group: BellGroup; day: BellGroupDay } | null;
  schedules: BellSchedule[];
  classNames: Map<string, string>;
  onClose: () => void;
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('classes');
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (value: string | null) =>
      api(`${path}/bell-plan`, { method: 'POST', body: { classIds: cell!.group.classIds, weekday: cell!.day.weekday, value } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'classes'] });
      toast.success('Zil ataması kaydedildi');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!cell) return null;
  const { group, day } = cell;
  const general = schedules
    .filter((s) => s.weekdays.includes(day.weekday) && s.periods.length)
    .sort((a, b) => a.weekdays.length - b.weekdays.length || a.sortOrder - b.sortOrder)[0];
  const current = day.planned ?? '';
  const options = [
    { value: '', label: `Okulun ${WEEKDAY_NAMES[day.weekday]} zili`, hint: general ? `${general.name} · ${range(general)}` : 'Bu gün için zil yok' },
    ...schedules.filter((s) => s.periods.length).map((s) => ({ value: s.id, label: s.name, hint: range(s) })),
    { value: BELL_OFF, label: 'Okulda değil', hint: 'O gün zil çalmaz, panoda görünmez' },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={`${WEEKDAY_NAMES[day.weekday]} · ${group.classIds.length} sınıf`}
      description={joinClassNames(group.classIds.map((id) => classNames.get(id) ?? ''))}
    >
      <div className="space-y-2">
        {day.first !== null && (
          <p className="mb-3 text-sm text-slate-500">
            Bu gün programda {day.first}–{day.last}. dersler var.
          </p>
        )}
        {options.map((o) => (
          <button
            key={o.value || 'default'}
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(o.value || null)}
            className={clsx(
              'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left ring-1 transition',
              current === o.value ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:ring-slate-300',
            )}
          >
            <span className="font-semibold text-ink">{o.label}</span>
            <span className="text-xs text-slate-500 tabular-nums">{o.hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const range = (s: BellSchedule) => {
  const sorted = [...s.periods].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.length ? `${sorted.length} ders · ${sorted[0]!.start}–${sorted[sorted.length - 1]!.end}` : 'ders saati yok';
};

function ExemptDialog({ open, classes, onClose }: { open: boolean; classes: ClassGroup[]; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('classes');
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = picked ?? new Set(classes.filter((c) => c.bellExempt).map((c) => c.id));
  const sorted = [...classes].sort((a, b) => compareClassNames(a.name, b.name));
  const save = useMutation({
    mutationFn: async () => {
      const on = classes.filter((c) => selected.has(c.id) && !c.bellExempt).map((c) => c.id);
      const off = classes.filter((c) => !selected.has(c.id) && c.bellExempt).map((c) => c.id);
      if (on.length) await api(`${path}/bell-exempt`, { method: 'POST', body: { classIds: on, exempt: true } });
      if (off.length) await api(`${path}/bell-exempt`, { method: 'POST', body: { classIds: off, exempt: false } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'classes'] });
      toast.success('Kaydedildi');
      close();
    },
    onError: (e) => toast.error(e.message),
  });
  const close = () => {
    setPicked(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Zil hesabına katılmayan sınıflar"
      description="Ör. özel eğitim sınıfları. Genel zili izlerler; panodaki zil seçimine, &quot;Şu an derste&quot; listesine ve öğretmen çakışma denetimine girmezler."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Vazgeç
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((c) => {
          const on = selected.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(c.id);
                else next.add(c.id);
                setPicked(next);
              }}
              className={clsx('rounded-full px-3 py-1 text-xs font-bold transition', on ? 'bg-ink text-white' : 'bg-surface text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300')}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function OffsiteDialog({ open, subjects, timetable, onClose }: { open: boolean; subjects: string[]; timetable: TimetableEntry[]; onClose: () => void }) {
  const { schoolId } = useAuth();
  const schoolPath = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const all = useMemo(() => [...new Set(timetable.map((e) => e.subject))].sort((a, b) => a.localeCompare(b, 'tr')), [timetable]);
  const save = useMutation({
    mutationFn: (offsiteSubjects: string[]) => api<School>(schoolPath, { method: 'PATCH', body: { settings: { offsiteSubjects } } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      setDraft('');
    },
    onError: (e) => toast.error(e.message),
  });
  const add = () => {
    const v = draft.trim();
    if (v && !subjects.some((s) => s.toLocaleLowerCase('tr-TR') === v.toLocaleLowerCase('tr-TR'))) save.mutate([...subjects, v]);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Okul dışı dersler"
      description="Bir sınıfın o günkü bütün dersleri bu listedeyse sınıf o gün okulda sayılmaz: zil çalmaz, panoda görünmez (ör. işletmede mesleki eğitim)."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {subjects.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-1 pr-1 pl-3 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200">
              {s}
              <button type="button" aria-label={`${s} kaldır`} onClick={() => save.mutate(subjects.filter((x) => x !== s))} className="rounded-full p-0.5 hover:bg-emerald-100">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {!subjects.length && <span className="text-sm text-slate-500">Liste boş.</span>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input list="offsite-subjects" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ders adı (programdaki gibi)" />
          <datalist id="offsite-subjects">
            {all.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} loading={save.isPending}>
            Ekle
          </Button>
        </form>
      </div>
    </Modal>
  );
}
