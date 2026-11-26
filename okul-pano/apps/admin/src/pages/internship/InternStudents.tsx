import { compareClassNames, errorText, INTERN_END_REASONS, INTERN_END_REASON_KEYS, type InternEndReason } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Search, Users } from '../../components/icons.tsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Segmented, Select, Spinner, Table, Td } from '../../components/ui.tsx';
import { useToast } from '../../components/Toast.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useInternshipAccess, useSchoolPath } from '../../lib/data.ts';

/*
 * Stajdaki öğrenciler (web, A): mobildeki "Öğrenciler" ekranının karşılığı, İşletmeler sayfasının sekmesi. Liste:
 * No · sınıf, ad soyad, işletme, bu öğretim yılının devamsızlığı; arama, sınıf ve işletme süzgeci. Satıra basınca
 * öğrencinin penceresi açılır (işletmesi, dönemleri, ay ay devamsızlıkları). Görme kuralı sunucudadır: kişi yalnızca
 * görebildiği işletmelerin öğrencilerini görür. Alan şefi ve koordinatörlüğü olan yönetici önce kendi öğrencilerini görür.
 */

export interface Intern {
  id: string;
  fullName: string;
  schoolNo: string;
  classId: string | null;
  className: string | null;
  businessId: string;
  businessName: string;
  editable: boolean;
  mine?: boolean;
  unexcused: number;
  excused: number;
}

const days = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

export function useInterns() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  return useQuery({
    queryKey: [schoolId, 'internship', 'interns'],
    queryFn: () => api<{ canAdd: boolean; students: Intern[] }>(`${path}/interns`),
  });
}

export function InternStudentsPanel({ adding, onCloseAdding }: { adding: boolean; onCloseAdding: () => void }) {
  const q = useInterns();
  const unplaced = useUnplaced();
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const access = useInternshipAccess();
  const [text, setText] = useState('');
  const [classId, setClassId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [view, setView] = useState<'mine' | 'all' | null>(null);
  const [record, setRecord] = useState<Intern | null>(null);
  const list = useMemo(() => q.data?.students ?? [], [q.data]);
  const scoped = Boolean(access.data?.manage || access.data?.areaHead);
  const mineCount = list.filter((x) => x.mine).length;
  const scopeView = scoped && mineCount ? (view ?? 'mine') : 'all';
  const base = scopeView === 'mine' ? list.filter((x) => x.mine) : list;
  const classes = [...new Map(base.filter((x) => x.classId).map((x) => [x.classId!, x.className ?? ''])).entries()].sort((a, b) => compareClassNames(a[1], b[1]));
  const businesses = [...new Map(base.map((x) => [x.businessId, x.businessName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  const needle = text.trim().toLocaleLowerCase('tr-TR');
  const shown = base
    .filter(
      (x) =>
        (!classId || x.classId === classId) &&
        (!businessId || x.businessId === businessId) &&
        (!needle || [x.fullName, x.schoolNo, x.businessName].some((v) => v.toLocaleLowerCase('tr-TR').includes(needle))),
    )
    .sort((a, b) => compareClassNames(a.className ?? '', b.className ?? '') || Number(a.schoolNo) - Number(b.schoolNo) || a.fullName.localeCompare(b.fullName, 'tr'));

  return (
    <>
      {/* Yerleştirilmeyi bekleyenler: işletmeden çıkarılmış öğrenciler (idare hepsini; alan şefi ve koordinatör öğretmen kendi alanınınkileri) */}
      {Boolean(unplaced.data?.length) && (
        <Card className="mb-4 grid gap-2 p-5">
          <div className="font-extrabold text-ink">Yerleştirilmeyi bekleyenler · {unplaced.data!.length}</div>
          <ul className="grid gap-1.5">
            {unplaced.data!.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-slate-500 tabular-nums">
                  {u.schoolNo} · {u.className ?? '—'}
                </span>
                <span className="font-bold text-ink">{u.fullName}</span>
                <Badge tone="slate">
                  {u.endDate ? `${dm(u.endDate)}'e kadar ${u.lastBusinessName}` : u.lastBusinessName}
                  {u.endReason && INTERN_END_REASONS[u.endReason as InternEndReason] ? ` · ${INTERN_END_REASONS[u.endReason as InternEndReason]}` : ''}
                </Badge>
                <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setMoving({ id: u.id, fullName: u.fullName, businessId: null, businessName: null, place: true })}>
                  Yerleştir
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {scoped && mineCount > 0 && (
        <div className="mb-3">
          <Segmented<'mine' | 'all'>
            value={scopeView}
            onChange={(v) => {
              setView(v);
              setClassId('');
              setBusinessId('');
            }}
            options={[
              { value: 'mine', label: `Benim öğrencilerim · ${mineCount}` },
              { value: 'all', label: `${access.data?.manage ? 'Bütün öğrenciler' : 'Alanımın öğrencileri'} · ${list.length}` },
            ]}
          />
        </div>
      )}
      <Card className="overflow-hidden">
        {base.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 dark:border-white/10">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Öğrenci, numara ya da işletme ara" aria-label="Öğrenci ara" className="pl-9" />
            </div>
            {classes.length > 1 && (
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Sınıf" className="w-44!">
                <option value="">Bütün sınıflar</option>
                {classes.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
            {businesses.length > 1 && (
              <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)} aria-label="İşletme" className="w-60!">
                <option value="">Bütün işletmeler</option>
                {businesses.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <div className="p-5">
            <Alert tone="red">{q.error.message}</Alert>
          </div>
        ) : !shown.length ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title={base.length ? 'Bu süzgeçte öğrenci yok' : 'Stajda öğrenci yok'}
            description={base.length ? undefined : 'Öğrencileri "Öğrenci ekle" ile işletmelere ekleyin.'}
          />
        ) : (
          <Table head={['No · Sınıf', 'Ad Soyad', 'İşletme', 'Devamsızlık (bu yıl)']}>
            {shown.map((x) => (
              <tr key={x.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setRecord(x)}>
                <Td className="whitespace-nowrap text-slate-500 tabular-nums">
                  {x.schoolNo} · {x.className ?? '—'}
                </Td>
                <Td>
                  <button type="button" className="text-left font-bold text-ink hover:underline" onClick={() => setRecord(x)}>
                    {x.fullName}
                  </button>
                </Td>
                <Td className="text-slate-600 dark:text-slate-300">{x.businessName}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    {x.excused > 0 && <Badge tone="amber">{days(x.excused)} gün özürlü</Badge>}
                    {x.unexcused > 0 && <Badge tone="red">{days(x.unexcused)} gün özürsüz</Badge>}
                    {!x.excused && !x.unexcused && <span className="text-slate-400">—</span>}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <InternRecordDialog
        student={record}
        onClose={() => setRecord(null)}
        onMove={(x) => {
          setRecord(null);
          setMoving({ id: x.id, fullName: x.fullName, businessId: x.businessId, businessName: x.businessName, place: false });
        }}
      />
      <MoveDialog target={moving} onClose={() => setMoving(null)} />
      <AddStudentsDialog open={adding} onClose={onCloseAdding} />
    </>
  );
}

interface Totals {
  excused: number;
  unexcused: number;
  permitted: number;
  report: number;
  referred: number;
  business: number;
  closed: number;
  unchecked: number;
}
interface InternRecord {
  student: { id: string; fullName: string; schoolNo: string; className: string | null };
  business: { id: string; name: string; phone: string | null; contactName: string | null; coordinatorName: string | null; areaName: string | null } | null;
  totals: Totals;
  periods: { businessId: string; businessName: string; coordinatorName: string | null; startDate: string | null; endDate: string | null; endReason?: string | null; current: boolean; totals: Totals }[];
  events: { date: string; half: 'am' | 'pm'; code: string; userName: string; sent: boolean }[];
}

const CODE: Record<string, { text: string; tone: 'red' | 'blue' | 'amber' | 'slate' }> = {
  D: { text: 'Özürsüz devamsız', tone: 'red' },
  İ: { text: 'İzinli', tone: 'blue' },
  R: { text: 'Raporlu', tone: 'amber' },
  H: { text: 'Hasta sevkli', tone: 'amber' },
};
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Öğrencinin penceresi: işletmesi, bu yılın toplamları, işletme dönemleri ve ay ay devamsızlıklar */
function InternRecordDialog({ student, onClose, onMove }: { student: Intern | null; onClose: () => void; onMove: (s: Intern) => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  const rec = useQuery({
    queryKey: [schoolId, 'internship', 'record', student?.id],
    queryFn: () => api<InternRecord>(`${path}/students/${student!.id}/record`),
    enabled: Boolean(student),
  });
  const r = rec.data;
  const events = (r?.events ?? []).filter((e) => CODE[e.code]);
  const byMonth = [...events.reduce((m, e) => m.set(e.date.slice(0, 7), [...(m.get(e.date.slice(0, 7)) ?? []), e]), new Map<string, typeof events>())].sort((a, b) => b[0].localeCompare(a[0]));
  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      size="lg"
      title={student ? student.fullName : 'Öğrenci'}
      description={student ? `${student.className ?? ''} · No ${student.schoolNo}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {student?.editable && <Button onClick={() => student && onMove(student)}>İşletme değiştir</Button>}
        </>
      }
    >
      {!r ? (
        rec.error ? <Alert tone="red">{rec.error.message}</Alert> : <Spinner />
      ) : (
        <div className="grid gap-5">
          <div className="rounded-2xl p-4 ring-1 ring-slate-200 dark:ring-white/10">
            <div className="text-xs font-bold tracking-wide text-slate-500">İŞLETME</div>
            {r.business ? (
              <>
                <div className="mt-1 font-bold text-ink">{r.business.name}</div>
                <div className="text-sm text-slate-500">
                  {[r.business.areaName, r.business.coordinatorName ? `Koordinatör: ${r.business.coordinatorName}` : 'Koordinatör seçilmedi', r.business.contactName ? `Yetkili: ${r.business.contactName}` : null, r.business.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-slate-500">İşletmesi yok.</div>
            )}

          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="red">{days(r.totals.unexcused)} gün özürsüz</Badge>
            <Badge tone="amber">{days(r.totals.excused)} gün özürlü</Badge>
            {r.totals.unchecked > 0 && <Badge tone="slate">{days(r.totals.unchecked)} gün kontrol edilmedi</Badge>}
          </div>
          {r.periods.length > 1 && (
            <div className="grid gap-1.5">
              <div className="text-xs font-bold tracking-wide text-slate-500">İŞLETME DÖNEMLERİ</div>
              {r.periods.map((p) => (
                <div key={`${p.businessId}-${p.startDate}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={clsx('font-semibold', p.current ? 'text-ink' : 'text-slate-500')}>{p.businessName}</span>
                  <span className="text-slate-500">
                    {p.startDate ? dm(p.startDate) : 'Başından'} – {p.endDate ? dm(p.endDate) : 'bugün'}
                  </span>
                  {p.current && <Badge tone="blue">Şu an</Badge>}
                  {p.endReason && INTERN_END_REASONS[p.endReason as InternEndReason] && <Badge tone="slate">{INTERN_END_REASONS[p.endReason as InternEndReason]}</Badge>}
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3">
            <div className="text-xs font-bold tracking-wide text-slate-500">DEVAMSIZLIKLAR (BU ÖĞRETİM YILI)</div>
            {!byMonth.length ? (
              <p className="text-sm text-slate-500">Devamsızlık yok.</p>
            ) : (
              byMonth.map(([month, list]) => (
                <div key={month} className="grid gap-1">
                  <div className="text-sm font-bold text-ink">
                    {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
                  </div>
                  {list.map((e) => (
                    <div key={`${e.date}-${e.half}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 text-slate-500 tabular-nums">
                        {dm(e.date)} · {e.half === 'am' ? 'sabah' : 'öğleden sonra'}
                      </span>
                      <Badge tone={CODE[e.code]!.tone}>{CODE[e.code]!.text}</Badge>
                      {!e.sent && <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">gönderilmedi</span>}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- İşletme değiştir / çıkar / yerleştir ---------- */

type MoveTarget = { id: string; fullName: string; businessId: string | null; businessName: string | null; place: boolean };
type BusinessLite = { id: string; name: string; canEdit: boolean; coordinatorName: string | null };
type Unplaced = { id: string; fullName: string; schoolNo: string; className: string | null; lastBusinessName: string; endDate: string | null; endReason: string | null };

export function useUnplaced() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  return useQuery({ queryKey: [schoolId, 'internship', 'unplaced'], queryFn: () => api<Unplaced[]>(`${path}/unplaced`) });
}

function useBusinessesLite() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  return useQuery({ queryKey: [schoolId, 'internship', 'businesses'], queryFn: () => api<BusinessLite[]>(`${path}/businesses`) });
}

const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Neden seçimi (isteğe bağlı; KVKK: sabit seçenekler) */
function ReasonPicker({ value, onChange }: { value: InternEndReason | null; onChange: (v: InternEndReason | null) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium text-ink">Neden (isteğe bağlı)</span>
      <div className="flex flex-wrap gap-2">
        {INTERN_END_REASON_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => onChange(value === k ? null : k)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-colors',
              value === k ? 'bg-ink text-surface ring-ink' : 'text-slate-600 ring-slate-200 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10',
            )}
          >
            {INTERN_END_REASONS[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * İşletme değiştir (web ve mobil aynı): başka işletmeye taşı ya da işletmeden çıkar; tarih ve isteğe bağlı neden.
 * Yerleştirilmeyi bekleyen öğrencide yalnızca taşıma (yerleştirme) vardır. Eski ve yeni koordinatöre ve koordinatör
 * müdür yardımcısına bildirim gider (sunucu).
 */
function MoveDialog({ target, onClose }: { target: MoveTarget | null; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  const qc = useQueryClient();
  const toast = useToast();
  const access = useInternshipAccess();
  const biz = useBusinessesLite();
  const [mode, setMode] = useState<'move' | 'remove'>('move');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(localIso());
  const [reason, setReason] = useState<InternEndReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = target ? `${target.id}:${target.place}` : null;
  if (key !== lastKey) {
    setLastKey(key);
    setMode('move');
    setTo('');
    setDate(localIso());
    setReason(null);
    setError(null);
  }
  // Hedef işletmeler: düzenleyebildikleri; alan şefi bekleyen öğrenciyi alanındaki herhangi bir işletmeye yerleştirir
  const options = (biz.data ?? [])
    .filter((b) => b.id !== target?.businessId && (b.canEdit || (target?.place && access.data?.areaHead)))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const chosen = options.find((b) => b.id === to);
  const removing = mode === 'remove' && !target?.place;
  const ready = Boolean(date) && (removing || Boolean(chosen));
  const save = async () => {
    if (!target || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${path}/students/assign`, { method: 'POST', body: { studentIds: [target.id], businessId: removing ? null : to, from: date, reason: target.place ? null : reason } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'internship'] });
      toast.success(removing ? `${target.fullName} işletmeden çıkarıldı` : `${target.fullName} ${chosen?.name ?? ''} işletmesine ${target.place ? 'yerleştirildi' : 'taşındı'}`);
      onClose();
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target ? `${target.fullName} · ${target.place ? 'yerleştir' : 'işletme değiştir'}` : 'İşletme değiştir'}
      description={target?.businessName ? `Şu an: ${target.businessName}` : target?.place ? 'Öğrencinin şu an işletmesi yok.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          {removing ? (
            <Button variant="delete" loading={busy} disabled={!ready} onClick={() => void save()}>
              İşletmeden çıkar
            </Button>
          ) : (
            <Button loading={busy} disabled={!ready} onClick={() => void save()}>
              {target?.place ? 'Yerleştir' : 'Taşı'}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        {!target?.place && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['move', 'Başka işletmeye taşı', 'Yeni işletmede devam eder'],
                ['remove', 'İşletmeden çıkar', 'Yerleştirilmeyi bekleyenlere düşer'],
              ] as const
            ).map(([m, title, text]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={clsx('rounded-2xl px-4 py-3 text-left ring-1 transition-colors', mode === m ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15' : 'ring-slate-200 hover:bg-slate-50 dark:ring-white/15 dark:hover:bg-white/5')}
              >
                <span className="block text-sm font-bold text-ink">{title}</span>
                <span className="block text-xs text-slate-500">{text}</span>
              </button>
            ))}
          </div>
        )}
        {!removing && (
          <Field label="Yeni işletme">
            {(id) =>
              options.length ? (
                <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Seçin</option>
                  {options.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.coordinatorName ? ` · ${b.coordinatorName}` : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <Alert>Taşıyabileceğiniz başka işletme yok. Başka koordinatörün işletmesine taşımayı idare yapar.</Alert>
              )
            }
          </Field>
        )}
        <Field
          label={removing ? 'Ayrılış tarihi' : target?.place ? 'Başlangıç tarihi' : 'Geçiş tarihi'}
          help={removing ? 'Bu tarihten itibaren işletmede sayılmaz; çizelge bir gün önce kapanır.' : 'Bu tarihten itibaren yeni işletmede devam eder.'}
        >
          {(id) => <Input id={id} type="date" className="max-w-52" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        {!target?.place && <ReasonPicker value={reason} onChange={setReason} />}
        {date && !target?.place && (
          <Alert>
            {removing
              ? `${target?.businessName ?? 'Eski işletme'} çizelgesi ${dm(dayBefore(date))}'de kapanır; öğrenci yerleştirilmeyi bekleyenlere düşer. Geçmiş devam işaretleri silinmez.`
              : `${target?.businessName ?? 'Eski işletme'} çizelgesi ${dm(dayBefore(date))}'de kapanır; ${dm(date)}'den itibaren ${chosen?.name ?? 'yeni işletmede'} devam eder. Geçmiş devam işaretleri silinmez.`}
          </Alert>
        )}
        {error && <Alert tone="red">{error}</Alert>}
      </div>
    </Modal>
  );
}

type Candidate = { id: string; fullName: string; schoolNo: string; classId: string | null; className: string | null; businessId: string | null; businessName: string | null };

/**
 * Öğrenci ekle (Öğrenciler sekmesinden; mobille aynı sıra): 1. öğrenciler, 2. işletme ve başlangıç tarihi. Başka
 * işletmedeki öğrenci seçilirse o işletmeden bu tarihte ayrılır (eski çizelge bir gün önce kapanır).
 */
function AddStudentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  const qc = useQueryClient();
  const toast = useToast();
  const cand = useQuery({
    queryKey: [schoolId, 'internship', 'candidates'],
    queryFn: () => api<{ students: Candidate[]; classes: { id: string; name: string }[] }>(`${path}/students`),
    enabled: open,
  });
  const biz = useBusinessesLite();
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState('');
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [to, setTo] = useState('');
  const [date, setDate] = useState(localIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setText('');
      setClassId('');
      setPicked(new Set());
      setTo('');
      setDate(localIso());
      setError(null);
    }
  }
  const options = (biz.data ?? []).filter((b) => b.canEdit).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const needle = text.trim().toLocaleLowerCase('tr-TR');
  const list = (cand.data?.students ?? [])
    .filter((x) => x.businessId !== 'other' && (!classId || x.classId === classId) && (!needle || `${x.fullName} ${x.schoolNo}`.toLocaleLowerCase('tr-TR').includes(needle)))
    .sort((a, b) => compareClassNames(a.className ?? '', b.className ?? '') || Number(a.schoolNo) - Number(b.schoolNo));
  const chosen = options.find((b) => b.id === to);
  const save = async () => {
    if (!picked.size || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${path}/students/assign`, { method: 'POST', body: { studentIds: [...picked], businessId: to, from: date } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'internship'] });
      toast.success(`${picked.size} öğrenci ${chosen.name} işletmesine eklendi`);
      onClose();
    } catch (e) {
      setError(errorText(e, 'Eklenemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={step === 1 ? 'Öğrenci ekle · 1. öğrenciler' : 'Öğrenci ekle · 2. işletme'}
      description={step === 1 ? 'İşletmeye gidecek öğrencileri seçin.' : `${picked.size} öğrenci seçildi. İşletmeyi ve başlangıç tarihini seçin.`}
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Vazgeç
            </Button>
            <Button disabled={!picked.size} onClick={() => setStep(2)}>
              Devam · {picked.size}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(1)}>
              Geri
            </Button>
            <Button loading={busy} disabled={!chosen || !date} onClick={() => void save()}>
              Ekle
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ad ya da numara ara" aria-label="Öğrenci ara" className="pl-9" />
            </div>
            {(cand.data?.classes.length ?? 0) > 1 && (
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Sınıf" className="w-40!">
                <option value="">Bütün sınıflar</option>
                {cand.data!.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {!cand.data ? (
            <Spinner />
          ) : !list.length ? (
            <p className="text-sm text-slate-500">Seçilebilecek öğrenci yok.</p>
          ) : (
            <ul className="grid max-h-[50vh] gap-0.5 overflow-y-auto">
              {list.map((x) => {
                const on = picked.has(x.id);
                return (
                  <li key={x.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-600"
                        checked={on}
                        onChange={() =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (on) n.delete(x.id);
                            else n.add(x.id);
                            return n;
                          })
                        }
                      />
                      <span className="w-24 shrink-0 text-sm text-slate-500 tabular-nums">
                        {x.schoolNo} · {x.className ?? '—'}
                      </span>
                      <span className="text-sm font-semibold text-ink">{x.fullName}</span>
                      {x.businessName && <Badge tone="slate">{x.businessName}</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <Field label="İşletme">
            {(id) =>
              options.length ? (
                <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Seçin</option>
                  {options.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Alert>Öğrenci ekleyebileceğiniz işletme yok. Önce İşletmeler sekmesinden işletme ekleyin.</Alert>
              )
            }
          </Field>
          <Field label="Başlangıç tarihi" help="Başka işletmedeki öğrenci bu tarihten itibaren yeni işletmede sayılır; eski çizelge bir gün önce kapanır.">
            {(id) => <Input id={id} type="date" className="max-w-52" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          {error && <Alert tone="red">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
