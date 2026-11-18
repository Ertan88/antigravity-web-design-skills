import { calendarLeaves, semesterBreak, type AcademicCalendarData, type LeafKind } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from '../../components/icons.tsx';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Card, Field, IconButton, Input, Modal } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { formatDateLong, formatDateTime } from '../../lib/format.ts';

interface CalendarRow {
  startYear: number;
  label: string;
  data: AcademicCalendarData;
  source: 'meb' | 'manual' | 'builtin';
  sourceUrl: string | null;
  status: 'confirmed' | 'review';
  pending: { data: AcademicCalendarData; sourceUrl: string; foundAt: string } | null;
  checkedAt: string | null;
}

interface ScanResult {
  outcome: 'saved' | 'confirmed' | 'review' | 'unchanged' | 'not-found';
  message: string;
}

/** Tarihler kısaltmasız ve gün adıyla: "16 Kasım 2026 Pazartesi" */
const d = formatDateLong;
const span = (a: string, b: string) => `${d(a)} – ${d(b)}`;

const SOURCE: Record<CalendarRow['source'], { label: string; tone: 'green' | 'blue' | 'slate' }> = {
  meb: { label: 'MEB duyurusundan', tone: 'green' },
  manual: { label: 'Elle girildi', tone: 'blue' },
  builtin: { label: 'Kurulum verisi', tone: 'slate' },
};

/** Takvimin satır satır özeti (karşılaştırmada da kullanılır) */
function Summary({ data, startYear }: { data: AcademicCalendarData; startYear: number }) {
  void startYear;
  const rows: [string, string][] = [
    ['Dersler başlar', d(data.lessonsStart)],
    ...data.breaks.filter((b) => b.start < data.term1End).map((b): [string, string] => [b.name, span(b.start, b.end)]),
    ['Birinci dönem biter', d(data.term1End)],
    ['Yarıyıl tatili', span(semesterBreak(data).start, semesterBreak(data).end)],
    ['İkinci dönem başlar', d(data.term2Start)],
    ...data.breaks.filter((b) => b.start > data.term1End).map((b): [string, string] => [b.name, span(b.start, b.end)]),
    ['Ders yılı biter', d(data.lessonsEnd)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium text-ink tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const MONTHS_SHORT = ['', 'OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
const MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dmText = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7))]}`;
const rangeText = (a: string, b: string) => (a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8))}–${dmText(b)}` : `${dmText(a)} – ${dmText(b)}`);
const LEAF_TONE: Record<LeafKind, string> = {
  term: 'bg-tile-sky text-tile-sky-ink',
  break: 'bg-tile-mint text-tile-mint-ink',
  summer: 'bg-tile-sun text-tile-sun-ink',
  official: 'bg-tile-rose text-tile-rose-ink',
  religious: 'bg-tile-lilac text-tile-lilac-ink',
};
const LEGEND: [LeafKind, string][] = [
  ['term', 'Ders'],
  ['break', 'Okul tatili'],
  ['official', 'Resmî tatil'],
  ['religious', 'Dini bayram'],
];
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Takvim yaprakları (mobil ile aynı, C): 1. ve 2. dönem yan yana; her olayın solunda gün-ay yaprağı. MEB tarihlerine
 * resmî ve dini tatiller eklenir. Geçenler listede kalır, soluk görünür; süren olay "Şu an", yalnızca sıradaki tatilde
 * kaç gün kaldığı rozetle yazar. Liste "Ders yılı biter" ile biter (yaz tatili gösterilmez).
 */
function Leaves({ data, startYear }: { data: AcademicCalendarData; startYear: number }) {
  const t = todayIso();
  const leaves = calendarLeaves(data, startYear);
  const next = leaves.find((l) => l.kind !== 'term' && l.start > t);
  const nextIn = next ? Math.round((Date.parse(next.start) - Date.parse(t)) / 86400_000) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LEGEND.map(([k, label]) => (
          <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${LEAF_TONE[k]}`}>
            {label}
          </span>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {([1, 2] as const).map((g) => (
          <div key={g} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
            <div className="mb-1 text-xs font-extrabold tracking-wide text-slate-500">{g === 1 ? '1. DÖNEM' : '2. DÖNEM'}</div>
            <ul className="divide-y divide-slate-200/70 dark:divide-white/10">
              {leaves
                .filter((l) => l.group === g)
                .map((l) => {
                  const end = l.end ?? l.start;
                  const past = end < t;
                  const now = l.start <= t && t <= end;
                  const sub = l.end ? [rangeText(l.start, l.end), l.note].filter(Boolean).join(' · ') : [WEEKDAYS[new Date(`${l.start}T12:00:00Z`).getUTCDay()], l.note].filter(Boolean).join(' · ');
                  return (
                    <li key={l.key} className={`flex items-center gap-3 py-2 ${past ? 'opacity-60' : ''}`}>
                      <div className={`flex w-12 shrink-0 flex-col items-center rounded-xl py-1 ${LEAF_TONE[l.kind]}`}>
                        <span className="text-lg leading-tight font-extrabold">{Number(l.start.slice(8))}</span>
                        <span className="text-[10px] font-extrabold">{MONTHS_SHORT[Number(l.start.slice(5, 7))]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                          {l.name}
                          {now && <Badge tone="green">Şu an</Badge>}
                          {l === next && <Badge tone="blue">{nextIn === 1 ? 'Yarın' : `${nextIn} gün sonra`}</Badge>}
                        </div>
                        <div className="text-xs text-slate-500">{sub}</div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY_BREAK = { name: 'Birinci Dönem Ara Tatili', start: '', end: '' };

/**
 * Platform › MEB çalışma takvimi: eğitim yıllarının takvimi (bütün okullar için ortak). Sunucu haziran ortasından
 * itibaren MEB'in sitesini her gün tarar; burada sonuç görülür, tarama elle başlatılır, farklar onaylanır ya da
 * tarihler elle düzeltilir.
 */
export function AcademicCalendarCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['platform', 'academic-calendars'], queryFn: () => api<CalendarRow[]>('/api/platform/academic-calendars') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform', 'academic-calendars'] });
  const [scanUrl, setScanUrl] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<{ year: number; data: AcademicCalendarData } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: ({ year, url }: { year: number; url?: string }) => api<ScanResult>(`/api/platform/academic-calendars/${year}/scan`, { method: 'POST', body: url ? { url } : {} }),
    onSuccess: (r) => {
      void refresh();
      if (r.outcome === 'not-found') toast.error(r.message);
      else toast.success(r.message);
    },
    onError: (e) => toast.error(e.message),
  });
  const accept = useMutation({
    mutationFn: (year: number) => api(`/api/platform/academic-calendars/${year}/accept`, { method: 'POST' }),
    onSuccess: () => {
      void refresh();
      toast.success('Takvim onaylandı; okulların tatilleri buna göre');
    },
  });
  const reject = useMutation({
    mutationFn: (year: number) => api(`/api/platform/academic-calendars/${year}/reject`, { method: 'POST' }),
    onSuccess: () => void refresh(),
  });
  const save = useMutation({
    mutationFn: ({ year, data }: { year: number; data: AcademicCalendarData }) => api(`/api/platform/academic-calendars/${year}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      void refresh();
      setEditing(null);
      toast.success('Takvim kaydedildi; okulların tatilleri güncellendi');
    },
    onError: (e) => setError(e.message),
  });

  const rows = list.data ?? [];
  const lastYear = rows.at(-1)?.startYear ?? new Date().getFullYear() - 1;
  const newYear = lastYear + 1;
  const openEditor = (year: number, data?: AcademicCalendarData) => {
    setError(null);
    setEditing({
      year,
      data: data ?? { lessonsStart: '', term1End: '', term2Start: '', lessonsEnd: '', breaks: [] },
    });
  };
  const setField = (k: keyof Omit<AcademicCalendarData, 'breaks'>, v: string) => editing && setEditing({ ...editing, data: { ...editing.data, [k]: v } });
  const setBreak = (i: number, patch: Partial<AcademicCalendarData['breaks'][number]>) =>
    editing && setEditing({ ...editing, data: { ...editing.data, breaks: editing.data.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) } });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <CalendarRange className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">MEB çalışma takvimi</h2>
          <p className="text-sm text-slate-500">
            Eğitim yılı 1 Eylül'de başlar. MEB takvimi haziran ortasından itibaren yayımlar; sunucu her gün tarar, bulunca ara tatil, yarıyıl ve yaz
            tatilini bütün okullara işler.
          </p>
        </div>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => openEditor(newYear)}>
          {newYear}-{newYear + 1} elle gir
        </Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.startYear} className="grid gap-4 px-5 py-4 lg:grid-cols-[12rem_1fr_auto]">
            <div className="space-y-1.5">
              <div className="text-lg font-bold text-ink">{r.label}</div>
              <Badge tone={SOURCE[r.source].tone}>{SOURCE[r.source].label}</Badge>
              {r.status === 'review' && (
                <div>
                  <Badge tone="amber">Kontrol bekliyor</Badge>
                </div>
              )}
              {r.sourceUrl && (
                <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  Duyuru <ExternalLink className="size-3" />
                </a>
              )}
              {r.checkedAt && <div className="text-xs text-slate-400">Son tarama: {formatDateTime(r.checkedAt)}</div>}
            </div>
            <div className="min-w-0 space-y-3">
              <Leaves data={r.data} startYear={r.startYear} />
              {r.pending && (
                <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                  <div className="mb-2 text-sm font-semibold text-amber-900">MEB duyurusunda farklı tarihler bulundu — onaylarsanız bunlar uygulanır:</div>
                  <Summary data={r.pending.data} startYear={r.startYear} />
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" icon={<Check className="size-4" />} loading={accept.isPending} onClick={() => accept.mutate(r.startYear)}>
                      Yeni tarihleri uygula
                    </Button>
                    <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => reject.mutate(r.startYear)}>
                      Mevcut kalsın
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 lg:w-64">
              {r.status === 'review' && !r.pending && (
                <Button size="sm" icon={<Check className="size-4" />} onClick={() => accept.mutate(r.startYear)}>
                  Doğru, onayla
                </Button>
              )}
              <div className="flex gap-2">
                <Input
                  aria-label={`${r.label} duyuru adresi`}
                  placeholder="Duyuru adresi (isteğe bağlı)"
                  value={scanUrl[r.startYear] ?? ''}
                  onChange={(e) => setScanUrl({ ...scanUrl, [r.startYear]: e.target.value })}
                  className="h-9 min-w-0 flex-1 text-xs"
                />
                <IconButton label="MEB'de şimdi tara" onClick={() => scan.mutate({ year: r.startYear, url: scanUrl[r.startYear] || undefined })}>
                  <RefreshCw className={scan.isPending && scan.variables?.year === r.startYear ? 'size-4 animate-spin' : 'size-4'} />
                </IconButton>
              </div>
              <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => openEditor(r.startYear, r.data)}>
                Tarihleri düzelt
              </Button>
            </div>
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm text-slate-500">
          <span>
            {newYear}-{newYear + 1} takvimi henüz yok. MEB yayımlayınca kendiliğinden eklenir.
          </span>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} loading={scan.isPending && scan.variables?.year === newYear} onClick={() => scan.mutate({ year: newYear })}>
            Şimdi tara
          </Button>
        </li>
      </ul>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.year}-${editing.year + 1} çalışma takvimi` : ''}
        description="Elle girilen takvim taramayla değişmez. Yarıyıl tatili birinci dönemin bitişi ile ikinci dönemin başlangıcı arasından hesaplanır."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Vazgeç
            </Button>
            <Button loading={save.isPending} onClick={() => editing && save.mutate({ year: editing.year, data: editing.data })}>
              Kaydet
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['lessonsStart', 'Dersler başlar'],
                  ['term1End', 'Birinci dönem biter'],
                  ['term2Start', 'İkinci dönem başlar'],
                  ['lessonsEnd', 'Ders yılı biter'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  {(id) => <Input id={id} type="date" value={editing.data[k]} onChange={(e) => setField(k, e.target.value)} />}
                </Field>
              ))}
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Ara tatiller</div>
              <div className="space-y-2">
                {editing.data.breaks.map((b, i) => (
                  <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
                    <Input aria-label="Tatil adı" value={b.name} onChange={(e) => setBreak(i, { name: e.target.value })} />
                    <Input aria-label="Başlangıç" type="date" value={b.start} onChange={(e) => setBreak(i, { start: e.target.value })} />
                    <Input aria-label="Bitiş" type="date" value={b.end} onChange={(e) => setBreak(i, { end: e.target.value })} />
                    <IconButton
                      label="Ara tatili kaldır"
                      tone="delete"
                      onClick={() => setEditing({ ...editing, data: { ...editing.data, breaks: editing.data.breaks.filter((_, j) => j !== i) } })}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="size-4" />}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      data: { ...editing.data, breaks: [...editing.data.breaks, editing.data.breaks.length ? { ...EMPTY_BREAK, name: 'İkinci Dönem Ara Tatili' } : EMPTY_BREAK] },
                    })
                  }
                >
                  Ara tatil ekle
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
