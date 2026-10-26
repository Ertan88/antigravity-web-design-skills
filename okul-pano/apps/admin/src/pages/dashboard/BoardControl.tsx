import { DAY_MODE_INFO, DAY_MODES, dayPlanLabel, FLASH_STYLE_LABEL, FLASH_STYLES, type DayMode, type DayPlan, type FlashStyle } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCog, Megaphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Button, Card, Field, Input, Segmented, Select, Textarea, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface Flash {
  id: string;
  text: string;
  style: FlashStyle;
  tone: 'info' | 'warning';
  endsAt: string;
  createdByName: string | null;
}

/** Mesaj süresi: dakika; 0 = gün sonuna kadar */
const DURATIONS = [
  { value: 10, label: '10 dakika' },
  { value: 40, label: '1 ders (40 dk)' },
  { value: 60, label: '1 saat' },
  { value: 0, label: 'Gün sonuna kadar' },
];

function endsAtFor(minutes: number): string {
  if (minutes > 0) return new Date(Date.now() + minutes * 60_000).toISOString();
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  return end.toISOString();
}

const timeOf = (iso: string) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Ana sayfadaki pano kontrolü (mobil uygulamadaki "Panoya hemen yaz" ve "Bugünün modu" ile aynı):
 * onaya takılmayan anlık mesaj, günün modu ve zil kaydırma.
 */
export function BoardControl() {
  const { schoolId, can } = useAuth();
  const flashPath = useSchoolPath('flash');
  const planPath = useSchoolPath('day-plan');
  const qc = useQueryClient();
  const toast = useToast();
  const canFlash = can('board.control');
  const canPlan = can('schedule.manage');

  const flash = useQuery({
    queryKey: [schoolId, 'flash'],
    queryFn: () => api<{ active: Flash[]; presets: string[] }>(flashPath),
    enabled: canFlash,
    refetchInterval: 30_000,
  });
  const plan = useQuery({ queryKey: [schoolId, 'day-plan'], queryFn: () => api<DayPlan>(planPath), enabled: canPlan });

  const [text, setText] = useState('');
  const [style, setStyle] = useState<FlashStyle>('banner');
  const [warning, setWarning] = useState(false);
  const [minutes, setMinutes] = useState(40);
  const [mode, setMode] = useState<DayMode>('normal');
  const [note, setNote] = useState('');
  const [lessonMin, setLessonMin] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan.data) return;
    setMode(plan.data.mode);
    setNote(plan.data.note ?? '');
    setLessonMin(plan.data.lessonMin ?? 30);
  }, [plan.data]);

  if (!canFlash && !canPlan) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: [schoolId, 'flash'] }),
        qc.invalidateQueries({ queryKey: [schoolId, 'day-plan'] }),
        qc.invalidateQueries({ queryKey: [schoolId, 'board-state'] }),
      ]);
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  const publish = () =>
    run(async () => {
      await api(flashPath, { method: 'POST', body: { text, style, tone: warning ? 'warning' : 'info', endsAt: endsAtFor(minutes) } });
      setText('');
    }, 'Mesaj bütün panolarda yayında');

  const label = dayPlanLabel(plan.data);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {canFlash && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Megaphone className="size-4" />
            </span>
            <h3 className="text-sm font-semibold text-ink">Panoya hemen yaz</h3>
            <span className="ml-auto text-xs text-slate-500">Onaya takılmaz, süresi bitince kalkar</span>
          </div>
          <div className="space-y-3">
            <Field label="Mesaj">
              {(id) => <Textarea id={id} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className="min-h-16" placeholder="Panolarda görünecek kısa mesaj" />}
            </Field>
            {(flash.data?.presets.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {flash.data!.presets.map((p) => (
                  <button key={p} type="button" onClick={() => setText(p)} className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <Segmented value={style} onChange={setStyle} options={FLASH_STYLES.map((s) => ({ value: s, label: FLASH_STYLE_LABEL[s] }))} />
              <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-44" aria-label="Süre">
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Toggle checked={warning} onChange={setWarning} label="Uyarı rengi" />
              <Button disabled={text.trim().length < 2} loading={busy} onClick={() => void publish()}>
                Şimdi yayınla
              </Button>
            </div>
            {(flash.data?.active.length ?? 0) > 0 && (
              <ul className="space-y-1.5 border-t border-slate-100 pt-3">
                {flash.data!.active.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{f.text}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {FLASH_STYLE_LABEL[f.style]} · {timeOf(f.endsAt)}'e kadar
                    </span>
                    <button
                      type="button"
                      aria-label="Mesajı kaldır"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => void run(() => api(`${flashPath}/${f.id}`, { method: 'DELETE' }), 'Mesaj panolardan kaldırıldı')}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {canPlan && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarCog className="size-4" />
            </span>
            <h3 className="text-sm font-semibold text-ink">Bugünün modu ve zil</h3>
            {label && <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{label}</span>}
          </div>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {DAY_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-xl p-2.5 text-left ring-1 transition ${mode === m ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50'}`}
                >
                  <div className="text-sm font-semibold">{DAY_MODE_INFO[m].label}</div>
                  <div className="text-xs text-slate-500">{DAY_MODE_INFO[m].description}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {mode === 'short' && (
                <Field label="Ders süresi (dk)">
                  {(id) => <Input id={id} type="number" min={10} max={60} value={lessonMin} onChange={(e) => setLessonMin(Number(e.target.value))} className="w-28" />}
                </Field>
              )}
              <div className="min-w-48 flex-1">
                <Field label="Panoda görünecek not (isteğe bağlı)">
                  {(id) => <Input id={id} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="ör. Tören 10.00'da bahçede" />}
                </Field>
              </div>
              <Button
                loading={busy}
                onClick={() =>
                  void run(
                    () => api(planPath, { method: 'PUT', body: { mode, note: note || null, lessonMin: mode === 'short' ? lessonMin : null } }),
                    `${DAY_MODE_INFO[mode].label} uygulandı; yarın kendiliğinden normale döner`,
                  )
                }
              >
                Uygula
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-slate-700">Zili kaydır</span>
              {[-5, 5, 10, 15].map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => api(`${planPath}/shift`, { method: 'POST', body: { minutes: m } }), `Şu andan sonraki zil saatleri ${m > 0 ? '+' : ''}${m} dk kaydırıldı`)}
                >
                  {m > 0 ? `+${m}` : `−${Math.abs(m)}`} dk
                </Button>
              ))}
              {(plan.data?.mode !== 'normal' || (plan.data?.shifts.length ?? 0) > 0) && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api(planPath, { method: 'DELETE' }), 'Gün normale döndü')}>
                  Normale döndür
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
