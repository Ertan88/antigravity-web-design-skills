import { semesterBreak, summerBreak, type AcademicCalendarData } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
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
  const summer = summerBreak(data, startYear);
  const rows: [string, string][] = [
    ['Dersler başlar', d(data.lessonsStart)],
    ...data.breaks.filter((b) => b.start < data.term1End).map((b): [string, string] => [b.name, span(b.start, b.end)]),
    ['Birinci dönem biter', d(data.term1End)],
    ['Yarıyıl tatili', span(semesterBreak(data).start, semesterBreak(data).end)],
    ['İkinci dönem başlar', d(data.term2Start)],
    ...data.breaks.filter((b) => b.start > data.term1End).map((b): [string, string] => [b.name, span(b.start, b.end)]),
    ['Ders yılı biter', d(data.lessonsEnd)],
    ['Yaz tatili', span(summer.start, summer.end)],
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
              <Summary data={r.data} startYear={r.startYear} />
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
                      onClick={() => setEditing({ ...editing, data: { ...editing.data, breaks: editing.data.breaks.filter((_, j) => j !== i) } })}
                    >
                      <Trash2 className="size-4 text-red-600" />
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
