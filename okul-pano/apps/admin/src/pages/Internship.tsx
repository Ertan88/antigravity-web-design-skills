import {
  INTERN_HALF_LABELS,
  INTERN_LEGEND,
  businessSchema,
  formatDays,
  internEditable,
  internLetter,
  trCompare,
  type InternCell,
  type InternDay,
  type InternHalf,
  type InternTotals,
} from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Building2, ChevronLeft, ChevronRight, Pencil, Plus, Printer, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, DeleteButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchoolPath, type Teacher } from '../lib/data.ts';

/*
 * İşletmelerde mesleki eğitim: işletmeler (idare) ve aylık işletmede devam çizelgesi. Okul günleri ders programından,
 * tatiller okulun takviminden kendiliğinden dolar; koordinatör öğretmen yalnızca D, R, T ve K işaretler.
 */

interface Business {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  coordinatorTeacherId: string | null;
  coordinatorName: string | null;
  isActive: boolean;
  students: number;
}

interface SheetStudent {
  id: string;
  fullName: string;
  schoolNo: string;
  listNo: number | null;
  classId: string | null;
  className: string | null;
  businessId: string;
  businessName: string;
  editable: boolean;
  cells: [InternCell, InternCell][];
  totals: InternTotals;
}

interface Sheet {
  month: string;
  today: string;
  days: InternDay[];
  classes: { id: string; name: string }[];
  businesses: { id: string; name: string }[];
  managerAssigned: boolean;
  students: SheetStudent[];
}

const WD_SHORT = ['', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthTitle = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const CELL_CLASS: Record<InternCell, string> = {
  O: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
  X: 'bg-white text-slate-400 border-slate-200 dark:bg-transparent dark:border-slate-700',
  D: 'bg-red-500 text-white border-red-500',
  R: 'bg-violet-200 text-violet-900 border-violet-300 dark:bg-violet-900/60 dark:text-violet-100 dark:border-violet-700',
  TA: 'bg-sky-200 text-sky-900 border-sky-200 dark:bg-sky-900/60 dark:text-sky-100 dark:border-sky-800',
  T: 'bg-sky-200 text-sky-900 border-sky-700 border-2 dark:bg-sky-900/60 dark:text-sky-100 dark:border-sky-400',
  K: 'bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-900/60 dark:text-amber-100 dark:border-amber-700',
  W: 'border-transparent bg-[repeating-linear-gradient(135deg,var(--color-slate-100)_0_4px,var(--color-slate-200)_4px_8px)]',
  '': 'bg-white border-slate-200 dark:bg-transparent dark:border-slate-700',
};

/** Kodların açıklaması (çizelgenin altında) */
export function InternLegend() {
  return (
    <div className="space-y-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-600">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {INTERN_LEGEND.map((l) => (
          <span key={l.code} className="flex items-center gap-1.5">
            <b className={clsx('inline-flex h-5 w-6 items-center justify-center rounded border text-[11px] font-extrabold', CELL_CLASS[l.code])}>{l.letter}</b>
            {l.text}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <b className={clsx('inline-flex h-5 w-6 rounded border', CELL_CLASS.W)} />
          Hafta sonu
        </span>
      </div>
      <p className="text-slate-500">
        Her gün iki bölümdür: üstte öğleden önce (ÖÖ), altta öğleden sonra (ÖS); her bölüm yarım gün sayılır. Raporlu (R) özürlü, devamsız (D) özürsüz
        devamsızlığa eklenir. Arifede öğleden sonra kendiliğinden tatildir.
      </p>
    </div>
  );
}

/* ---------- İşletmede devam çizelgesi ---------- */

interface Picked {
  student: SheetStudent;
  day: InternDay;
  half: InternHalf;
  cell: InternCell;
  rect: DOMRect;
}

export function InternshipSheet() {
  const { schoolId } = useAuth();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('ay') ?? '') ? params.get('ay')! : thisMonth();
  const [classId, setClassId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const path = useSchoolPath('internship');
  const sheet = useQuery({
    queryKey: [schoolId, 'internship', 'sheet', month],
    queryFn: () => api<Sheet>(`${path}/sheet?month=${month}`),
  });
  const setMonth = (m: string) => setParams((p) => (p.set('ay', m), p), { replace: true });

  const data = sheet.data;
  const rows = useMemo(
    () => (data?.students ?? []).filter((s) => (!classId || s.classId === classId) && (!businessId || s.businessId === businessId)),
    [data, classId, businessId],
  );
  const className = data?.classes.find((c) => c.id === classId)?.name;

  return (
    <div>
      <style>{`@media print {
        @page { size: A4 landscape; margin: 8mm; }
        body * { visibility: hidden; }
        #intern-print, #intern-print * { visibility: visible; }
        #intern-print { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none; }
        #intern-print .no-print { display: none; }
      }`}</style>
      <PageHeader
        title="İşletmede Devam"
        description="İşletmelerde mesleki eğitim gören öğrencilerin aylık devam çizelgesi. Okul günleri ve tatiller kendiliğinden dolar; hücreye tıklayıp devamsızlık, rapor, tatil ya da işletme kapalı işaretleyin."
        actions={
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!rows.length}>
            Yazdır / PDF
          </Button>
        }
      />
      {data && !data.managerAssigned && (
        <div className="mb-4">
          <Alert>Koordinatör müdür yardımcısı seçilmemiş: devamsızlık ve rapor bildirimleri kimseye gitmiyor. Genel Ayarlar › Modüller bölümünden seçin.</Alert>
        </div>
      )}
      <Card className="overflow-hidden" >
        <div id="intern-print">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="mr-auto">
              <div className="text-lg font-extrabold tracking-tight">
                {monthTitle(month)}
                {className ? ` · ${className}` : ''}
              </div>
              <div className="text-xs font-semibold text-slate-500">İşletmelerde Mesleki Eğitim Devam Çizelgesi</div>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-slate-200 p-0.5">
                <IconButton label="Önceki ay" onClick={() => setMonth(shiftMonth(month, -1))}>
                  <ChevronLeft className="size-4" />
                </IconButton>
                <span className="w-28 text-center text-sm font-bold">{monthTitle(month)}</span>
                <IconButton label="Sonraki ay" onClick={() => setMonth(shiftMonth(month, 1))}>
                  <ChevronRight className="size-4" />
                </IconButton>
              </div>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Sınıf" className="w-44!">
                <option value="">Bütün sınıflar</option>
                {data?.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)} aria-label="İşletme" className="w-52!">
                <option value="">Bütün işletmeler</option>
                {data?.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {sheet.isLoading ? (
            <Spinner />
          ) : sheet.error ? (
            <div className="p-5">
              <Alert tone="red">{sheet.error.message}</Alert>
            </div>
          ) : !rows.length ? (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title={data?.students.length ? 'Bu süzgeçte öğrenci yok' : 'İşletmeye bağlı öğrenci yok'}
              description={data?.students.length ? undefined : 'İşletmeler sayfasından işletmeleri ekleyip öğrencilerini seçin.'}
            />
          ) : (
            <SheetTable days={data!.days} rows={rows} onPick={setPicked} />
          )}
          <InternLegend />
        </div>
      </Card>
      {picked && <CellMenu picked={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function SheetTable({ days, rows, onPick }: { days: InternDay[]; rows: SheetStudent[]; onPick: (p: Picked) => void }) {
  return (
    <div className="overflow-x-auto px-3 py-3">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="text-slate-500">
            <th rowSpan={2} className="px-1.5 text-center font-bold">
              S.No
            </th>
            <th rowSpan={2} className="px-2 text-left font-bold">
              Öğrenci
            </th>
            <th rowSpan={2} />
            {days.map((d) => (
              <th key={d.date} rowSpan={2} className={clsx('w-[27px] px-px pb-1 text-center font-semibold', d.weekday >= 6 && 'text-slate-300')} title={d.holiday ?? d.halfDay ?? undefined}>
                <span className={clsx('block text-[13px] font-extrabold', d.weekday >= 6 ? 'text-slate-300' : 'text-ink')}>{Number(d.date.slice(8))}</span>
                {WD_SHORT[d.weekday]}
              </th>
            ))}
            <th colSpan={2} className="border-b border-slate-200 px-1 pb-1 text-center text-[10px] leading-tight font-extrabold tracking-wide text-slate-600">
              TOPLAM
              <br />
              DEVAMSIZLIK
            </th>
          </tr>
          <tr className="text-[10px] font-extrabold tracking-wide text-slate-500">
            <th className="px-1 pt-1">ÖZÜRLÜ</th>
            <th className="px-1 pt-1">ÖZÜRSÜZ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id}>
              <td className="border-b border-slate-100 px-1.5 text-center font-bold text-slate-400">{i + 1}</td>
              <td className="border-b border-slate-100 px-2 py-1">
                <div className="text-[13px] font-bold whitespace-nowrap">{s.fullName}</div>
                <div className="text-[11px] font-semibold whitespace-nowrap text-slate-500">
                  {s.schoolNo}
                  {s.className ? ` · ${s.className}` : ''} · {s.businessName}
                </div>
              </td>
              <td className="border-b border-slate-100 pr-1 text-right text-[9px] leading-[21px] font-bold text-slate-400">
                ÖÖ
                <br />
                ÖS
              </td>
              {days.map((d, di) => (
                <td key={d.date} className="border-b border-slate-100 px-px py-1">
                  {s.cells[di]!.map((c, hi) => {
                    const half: InternHalf = hi ? 'pm' : 'am';
                    const can = s.editable && internEditable(c);
                    return (
                      <button
                        key={half}
                        type="button"
                        disabled={!can}
                        title={`${s.fullName} · ${Number(d.date.slice(8))} ${MONTHS[Number(d.date.slice(5, 7)) - 1]} ${INTERN_HALF_LABELS[half].toLocaleLowerCase('tr-TR')}${d.holiday ? ` · ${d.holiday}` : d.halfDay && hi ? ` · ${d.halfDay}` : ''}`}
                        onClick={(e) => onPick({ student: s, day: d, half, cell: c, rect: e.currentTarget.getBoundingClientRect() })}
                        className={clsx(
                          'my-px flex h-[19px] w-[25px] items-center justify-center rounded border text-[11px] font-extrabold',
                          CELL_CLASS[c],
                          can ? 'cursor-pointer hover:ring-2 hover:ring-ink/60' : 'cursor-default',
                        )}
                      >
                        {internLetter(c)}
                      </button>
                    );
                  })}
                </td>
              ))}
              <td className="border-b border-slate-100 px-2 text-center text-[13px] font-extrabold text-violet-700 dark:text-violet-300">{s.totals.excused ? formatDays(s.totals.excused) : '–'}</td>
              <td className="border-b border-slate-100 px-2 text-center text-[13px] font-extrabold text-red-600">{s.totals.unexcused ? formatDays(s.totals.unexcused) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHOICES: { code: 'X' | 'D' | 'R' | 'T' | 'K'; label: string; cell: InternCell }[] = [
  { code: 'X', label: 'X', cell: 'X' },
  { code: 'D', label: 'D', cell: 'D' },
  { code: 'R', label: 'R', cell: 'R' },
  { code: 'T', label: 'T', cell: 'T' },
  { code: 'K', label: 'K', cell: 'K' },
];

/** Hücreye tıklayınca: kod seçimi; diğer bölüme de uygulanabilir */
function CellMenu({ picked, onClose }: { picked: Picked; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship/marks');
  const qc = useQueryClient();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const other: InternHalf = picked.half === 'am' ? 'pm' : 'am';
  const otherCell = picked.student.cells[Number(picked.day.date.slice(8)) - 1]![other === 'am' ? 0 : 1];
  const [both, setBoth] = useState(false);
  const [code, setCode] = useState<(typeof CHOICES)[number]['code'] | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', close));
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const save = useMutation({
    mutationFn: (c: string) => {
      const halves = both && internEditable(otherCell) ? [picked.half, other] : [picked.half];
      return api<{ changed: number; notified?: number }>(path, {
        method: 'POST',
        body: { date: picked.day.date, items: halves.map((half) => ({ studentId: picked.student.id, half, code: c })) },
      });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'internship'] });
      if (r.notified) toast.success('Kaydedildi; koordinatör müdür yardımcısına bildirim gönderildi');
      else if (r.changed) toast.success('Kaydedildi');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const left = Math.min(Math.max(8, picked.rect.left - 120), window.innerWidth - 300);
  const below = picked.rect.bottom + 300 < window.innerHeight;
  const top = below ? picked.rect.bottom + 8 : picked.rect.top - 8;
  const d = picked.day.date;
  const note =
    code === 'T'
      ? 'Tatil (T) işletmeye giden bütün öğrencilere işaretlenir.'
      : code === 'K'
        ? `İşletme kapalı (K) ${picked.student.businessName} işletmesindeki bütün öğrencilere işaretlenir.`
        : code === 'D' || code === 'R'
          ? 'Kaydedince koordinatör müdür yardımcısına bildirim gider.'
          : code === 'X' && (picked.cell === 'T' || picked.cell === 'K')
            ? `${picked.cell === 'T' ? 'Tatil' : 'İşletme kapalı'} işareti aynı kapsamdaki bütün öğrencilerden kalkar.`
            : null;

  return (
    <div
      ref={ref}
      role="dialog"
      className="fixed z-50 w-[290px] rounded-2xl border border-slate-200 bg-surface p-4 text-sm shadow-2xl"
      style={{ left, top, transform: below ? undefined : 'translateY(-100%)' }}
    >
      <div className="font-extrabold">
        {picked.student.fullName} · {Number(d.slice(8))} {MONTHS[Number(d.slice(5, 7)) - 1]}
      </div>
      <div className="mb-3 text-xs font-semibold text-slate-500">{INTERN_HALF_LABELS[picked.half]}</div>
      <div className="grid grid-cols-5 gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setCode(c.code)}
            className={clsx(
              'h-10 rounded-lg border text-sm font-extrabold',
              CELL_CLASS[c.cell],
              (code ?? (picked.cell === 'TA' ? null : picked.cell)) === c.code && 'outline-3 outline-offset-1 outline-ink',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {internEditable(otherCell) && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="size-4 accent-ink" />
          {other === 'pm' ? 'Öğleden sonraya' : 'Öğleden önceye'} de uygula (tam gün)
        </label>
      )}
      {note && <div className={clsx('mt-3 rounded-lg px-2.5 py-2 text-xs font-semibold', code === 'D' || code === 'R' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700')}>{note}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Vazgeç
        </Button>
        <Button size="sm" disabled={!code} loading={save.isPending} onClick={() => code && save.mutate(code)}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}

/* ---------- İşletmeler ---------- */

interface StudentOption {
  id: string;
  fullName: string;
  schoolNo: string;
  listNo: number | null;
  classId: string | null;
  className: string | null;
  businessId: string | null;
}

export function Businesses() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship/businesses');
  const list = useQuery({ queryKey: [schoolId, 'internship', 'businesses'], queryFn: () => api<Business[]>(path) });
  const [editing, setEditing] = useState<Business | 'new' | null>(null);
  const [assigning, setAssigning] = useState<Business | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'internship'] });
      toast.success('İşletme silindi');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="İşletmeler"
        description="Öğrencilerin mesleki eğitim gördüğü işletmeler, koordinatör öğretmenleri ve öğrencileri. Koordinatör öğretmen kendi işletmelerindeki öğrencilerin devamını işaretler."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            İşletme ekle
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <EmptyState icon={<Building2 className="size-6" />} title="Henüz işletme yok" description="İşletme ekleyip koordinatör öğretmenini ve öğrencilerini seçin." />
        ) : (
          <Table head={['İşletme', 'Koordinatör öğretmen', 'Öğrenci', 'Telefon', '']}>
            {list.data.map((b) => (
              <tr key={b.id}>
                <Td>
                  <div className="font-bold">{b.name}</div>
                  {b.address && <div className="max-w-xs truncate text-xs text-slate-500">{b.address}</div>}
                </Td>
                <Td>{b.coordinatorName ?? <Badge tone="amber">Seçilmedi</Badge>}</Td>
                <Td>
                  <Button variant="secondary" size="sm" icon={<Users className="size-3.5" />} onClick={() => setAssigning(b)}>
                    {b.students} öğrenci
                  </Button>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">{b.phone ?? '–'}</Td>
                <Td className="text-right whitespace-nowrap">
                  <IconButton label="Düzenle" onClick={() => setEditing(b)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <DeleteButton onConfirm={() => remove.mutate(b.id)} what={`${b.name} işletmesi`} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <BusinessForm editing={editing} onClose={() => setEditing(null)} />
      <AssignStudents business={assigning} businesses={list.data ?? []} onClose={() => setAssigning(null)} />
    </div>
  );
}

function BusinessForm({ editing, onClose }: { editing: Business | 'new' | null; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship/businesses');
  const teachers = useList<Teacher>('teachers');
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', address: '', coordinatorTeacherId: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) return;
    const b = editing === 'new' ? null : editing;
    setForm({ name: b?.name ?? '', phone: b?.phone ?? '', address: b?.address ?? '', coordinatorTeacherId: b?.coordinatorTeacherId ?? '' });
    setError(null);
  }, [editing]);
  const save = useMutation({
    mutationFn: () => {
      const body = businessSchema.parse({ ...form, coordinatorTeacherId: form.coordinatorTeacherId || null });
      return editing === 'new' ? api(path, { method: 'POST', body }) : api(`${path}/${(editing as Business).id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'internship'] });
      toast.success(editing === 'new' ? 'İşletme eklendi' : 'İşletme güncellendi');
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? (e.message.startsWith('[') ? 'İşletme adı gerekli.' : e.message) : 'Kaydedilemedi.'),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal
      open={Boolean(editing)}
      onClose={onClose}
      title={editing === 'new' ? 'İşletme ekle' : 'İşletmeyi düzenle'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="İşletme adı">{(id) => <Input id={id} value={form.name} onChange={set('name')} autoFocus />}</Field>
        <Field label="Koordinatör öğretmen" help="Bu işletmedeki öğrencilerin devamını işaretler (mobil uygulamada ziyaret kaydı).">
          {(id) => (
            <Select id={id} value={form.coordinatorTeacherId} onChange={set('coordinatorTeacherId')}>
              <option value="">Seçilmedi</option>
              {[...(teachers.data ?? [])]
                .filter((t) => t.isActive)
                .sort((a, b) => trCompare(a.fullName, b.fullName))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                    {t.branch ? ` · ${t.branch}` : ''}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Telefon">{(id) => <Input id={id} value={form.phone} onChange={set('phone')} inputMode="tel" />}</Field>
        <Field label="Adres">{(id) => <Input id={id} value={form.address} onChange={set('address')} />}</Field>
      </div>
    </Modal>
  );
}

function AssignStudents({ business, businesses, onClose }: { business: Business | null; businesses: Business[]; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  const qc = useQueryClient();
  const toast = useToast();
  const students = useQuery({
    queryKey: [schoolId, 'internship', 'students'],
    queryFn: () => api<StudentOption[]>(`${path}/students`),
    enabled: Boolean(business),
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    if (business && students.data) {
      setPicked(new Set(students.data.filter((s) => s.businessId === business.id).map((s) => s.id)));
      const first = students.data.find((s) => s.businessId === business.id);
      setClassId(first?.classId ?? '');
      setQ('');
    }
  }, [business, students.data]);
  const names = new Map(businesses.map((b) => [b.id, b.name]));
  const classes = [...new Map((students.data ?? []).filter((s) => s.classId).map((s) => [s.classId!, s.className ?? ''])).entries()];
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const shown = (students.data ?? []).filter(
    (s) => (!classId || s.classId === classId) && (!needle || s.fullName.toLocaleLowerCase('tr-TR').includes(needle) || s.schoolNo.includes(needle)),
  );
  const save = useMutation({
    mutationFn: () => api(`${path}/businesses/${business!.id}/students`, { method: 'PUT', body: { studentIds: [...picked] } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'internship'] });
      toast.success(`${business!.name}: ${picked.size} öğrenci`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Modal
      open={Boolean(business)}
      onClose={onClose}
      size="lg"
      title={business ? `${business.name} · öğrenciler` : ''}
      description="Seçilen öğrenciler bu işletmeye bağlanır. Başka işletmedeki bir öğrenci seçilirse o işletmeden çıkar."
      footer={
        <>
          <span className="mr-auto text-sm font-semibold text-slate-500">{picked.size} öğrenci seçili</span>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-44" aria-label="Sınıf">
          <option value="">Bütün sınıflar</option>
          {classes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad ya da okul no" className="pl-9" />
        </div>
        <Button variant="secondary" size="sm" className="h-10" onClick={() => setPicked((p) => new Set([...p, ...shown.map((s) => s.id)]))} disabled={!shown.length}>
          Listedekilerin hepsi
        </Button>
      </div>
      {students.isLoading ? (
        <Spinner />
      ) : (
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {shown.map((s) => {
            const elsewhere = s.businessId && s.businessId !== business?.id ? names.get(s.businessId) : null;
            return (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-ink" />
                <span className="w-10 text-xs font-bold text-slate-400">{s.schoolNo}</span>
                <span className="flex-1 font-semibold">{s.fullName}</span>
                <span className="text-xs text-slate-500">{s.className}</span>
                {elsewhere && <Badge tone={picked.has(s.id) ? 'amber' : 'slate'}>{elsewhere}</Badge>}
              </label>
            );
          })}
          {!shown.length && <div className="p-4 text-center text-sm text-slate-500">Öğrenci bulunamadı.</div>}
        </div>
      )}
    </Modal>
  );
}
