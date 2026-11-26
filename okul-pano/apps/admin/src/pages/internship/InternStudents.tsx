import { compareClassNames } from '@okulpano/shared';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Search, Users } from '../../components/icons.tsx';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, Segmented, Select, Spinner, Table, Td } from '../../components/ui.tsx';
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

export function InternStudentsPanel() {
  const q = useInterns();
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
      <InternRecordDialog student={record} onClose={() => setRecord(null)} />
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
  periods: { businessId: string; businessName: string; coordinatorName: string | null; startDate: string | null; endDate: string | null; current: boolean; totals: Totals }[];
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
function InternRecordDialog({ student, onClose }: { student: Intern | null; onClose: () => void }) {
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
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
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
            <p className="mt-2 text-xs text-slate-500">
              İşletme değiştirmek için yeni işletmenin satırındaki öğrenci düğmesinden bu öğrenciyi ekleyin; geçiş tarihi sorulur ve eski işletmenin çizelgesi bir gün öncesinde kapanır.
            </p>
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
