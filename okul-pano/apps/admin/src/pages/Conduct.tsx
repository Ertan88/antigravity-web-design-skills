import {
  CONDUCT_BANDS,
  CONDUCT_GROUPS,
  CONDUCT_HIGH_SHARE,
  CONDUCT_MIN_TEACHERS,
  CONDUCT_TEACHER_CAP,
  SCHOOL_LEVELS,
  conductCriterionSchema,
  type ConductBand,
  type ConductGroup,
  type ConductTerm,
  type SchoolLevel,
  type SchoolSettings,
} from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowUpRight, Check, ClipboardCheck, Download, FileSpreadsheet, Gauge, HeartHandshake, Pencil, Plus, Star, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, DeleteButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td, Textarea, Toggle } from '../components/ui.tsx';
import { api, downloadFile, excelFileName } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../lib/data.ts';
import { formatDateTime } from '../lib/format.ts';

/*
 * Gözlem: öğrencilerin okul ve ders içi davranışlarına göre artı / eksi kayıtları. Öğretmenler mobil uygulamadan
 * girer; panelde idare ve rehber öğretmen sınıfları ve öğrenci kartlarını görür, kriterleri ve ayın öğrencisini yönetir.
 */

interface Criterion {
  id: string;
  level: SchoolLevel;
  group: ConductGroup;
  label: string;
  points: number;
  noteRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}
interface ConductClass {
  id: string;
  name: string;
  level: SchoolLevel;
  levelSet: boolean;
  students: number;
}
interface ClassScreen {
  month: string;
  class: { id: string; name: string; level: SchoolLevel };
  criteria: Criterion[];
  students: { id: string; schoolNo: string; fullName: string; plus: number; minus: number; net: number }[];
}
interface StudentCardData {
  month: string;
  student: { id: string; schoolNo: string; fullName: string; className: string | null };
  totals: { net: number; plus: number; minus: number; plusPoints: number; minusPoints: number; teachers: number };
  byCriterion: { label: string; group: ConductGroup; points: number; count: number }[];
  entries: { id: string; group: ConductGroup; label: string; points: number; note: string | null; userName: string | null; createdAt: string; mine: boolean }[];
  canSeeAuthors: boolean;
}
interface Candidates {
  month: string;
  candidates: {
    studentId: string;
    plus: number;
    minus: number;
    teachers: number;
    balanced: number;
    topLabel: string | null;
    awardedIn: string[];
    student: { id: string; schoolNo: string; fullName: string; className: string | null };
  }[];
  awards: { id: string; month: string; studentId: string; fullName: string; className: string | null }[];
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 15));
};
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const LEVEL_OPTIONS = (Object.keys(SCHOOL_LEVELS) as SchoolLevel[]).map((l) => ({ value: l, label: SCHOOL_LEVELS[l] }));

function NetPill({ n }: { n: number }) {
  return (
    <span
      className={clsx(
        'inline-flex min-w-10 justify-center rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums',
        n > 0 ? 'bg-tile-mint text-tile-mint-ink' : n < 0 ? 'bg-tile-rose text-tile-rose-ink' : 'bg-slate-100 text-slate-500',
      )}
    >
      {signed(n)}
    </span>
  );
}

function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Input type="month" value={value} max={thisMonth()} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-44" aria-label="Ay" />;
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? (p[p.length - 1]?.[0] ?? '') : '')).toLocaleUpperCase('tr-TR');
}
const AVATAR = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e'];
function Avatar({ name, size = 'size-10' }: { name: string; size?: string }) {
  const n = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white', size)} style={{ background: AVATAR[n % AVATAR.length] }}>
      {initials(name)}
    </span>
  );
}

/* ---------- Öğrenci kartı (panel) ---------- */

function StudentCard({ studentId, month, criteria, onClose, readOnly }: { studentId: string | null; month: string; criteria: Criterion[]; onClose: () => void; readOnly?: boolean }) {
  const { schoolId, can } = useAuth();
  const path = useSchoolPath('conduct');
  const qc = useQueryClient();
  const toast = useToast();
  const card = useQuery({
    queryKey: [schoolId, 'conduct', 'student', studentId, month],
    queryFn: () => api<StudentCardData>(`${path}/students/${studentId}?month=${month}`),
    enabled: Boolean(studentId),
  });
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId, 'conduct'] });
  const give = useMutation({
    mutationFn: () => api<{ label: string; points: number }>(`${path}/entries`, { method: 'POST', body: { studentIds: [studentId], criterionId: pick, note: note || null } }),
    onSuccess: (r) => {
      toast.success(`${signed(r.points)} ${r.label}`);
      setPick(null);
      setNote('');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/entries/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const d = card.data;
  const picked = criteria.find((c) => c.id === pick);
  return (
    <Modal open={Boolean(studentId)} onClose={onClose} size="lg" title={d ? d.student.fullName : 'Öğrenci'} description={d ? `${d.student.className ?? 'Sınıfsız'} · No ${d.student.schoolNo} · ${monthLabel(month)}` : undefined}>
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-3xl bg-tile-dark p-4 text-white">
              <div className="text-xs font-bold opacity-70">Bu ay net</div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{signed(d.totals.net)}</div>
              <div className="mt-1 text-xs font-semibold opacity-70">{d.totals.teachers} öğretmenden</div>
            </div>
            <div className="rounded-3xl bg-tile-mint p-4 text-tile-mint-ink">
              <div className="text-xs font-bold opacity-75">Artı</div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{d.totals.plus}</div>
              <div className="mt-1 text-xs font-semibold">kayıt · +{d.totals.plusPoints} puan</div>
            </div>
            <div className="rounded-3xl bg-tile-rose p-4 text-tile-rose-ink">
              <div className="text-xs font-bold opacity-75">Eksi</div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{d.totals.minus}</div>
              <div className="mt-1 text-xs font-semibold">kayıt · −{d.totals.minusPoints} puan</div>
            </div>
          </div>

          {d.byCriterion.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-extrabold">Kriterlere göre</div>
              <div className="flex flex-wrap gap-1.5">
                {d.byCriterion.map((c) => (
                  <span key={`${c.label}${c.points}`} className={clsx('rounded-full px-3 py-1 text-xs font-bold', c.points > 0 ? 'bg-tile-mint text-tile-mint-ink' : 'bg-tile-rose text-tile-rose-ink')}>
                    {signed(c.points)} {c.label} · {c.count}×
                  </span>
                ))}
              </div>
            </div>
          )}

          {!readOnly && (
          <div className="rounded-3xl p-4 ring-1 ring-slate-200">
            <div className="mb-2 text-sm font-extrabold">Puan ver</div>
            <div className="flex flex-wrap gap-1.5">
              {criteria.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPick(pick === c.id ? null : c.id)}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-xs font-bold transition',
                    c.points > 0 ? 'bg-tile-mint text-tile-mint-ink' : 'bg-tile-rose text-tile-rose-ink',
                    pick === c.id && 'ring-2 ring-ink',
                  )}
                >
                  {signed(c.points)} {c.label}
                </button>
              ))}
              {!criteria.length && <span className="text-sm text-slate-500">Bu düzey için kriter yok (Gözlem Kriterleri).</span>}
            </div>
            {picked && (
              <div className="mt-3 flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={picked.noteRequired ? 'Not (zorunlu)' : 'Not (isteğe bağlı)'} maxLength={200} />
                <Button loading={give.isPending} disabled={picked.noteRequired && !note.trim()} onClick={() => give.mutate()}>
                  Kaydet
                </Button>
              </div>
            )}
            {picked?.noteRequired && !note.trim() && <div className="mt-2 text-xs font-semibold text-rose-600">"{picked.label}" için kısa bir not yazın.</div>}
          </div>
          )}

          <div>
            <div className="mb-2 text-sm font-extrabold">Kayıtlar</div>
            {d.entries.length ? (
              <ul className="divide-y divide-slate-100 rounded-3xl ring-1 ring-slate-200">
                {d.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <NetPill n={e.points} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{e.label}</div>
                      <div className="truncate text-xs text-slate-500">
                        {e.mine ? 'Siz' : (e.userName ?? 'Bir öğretmen')}
                        {e.note ? ` · “${e.note}”` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400" title={formatDateTime(e.createdAt)}>{formatDateTime(e.createdAt)}</span>
                    {(can('conduct.manage') || e.mine) && <DeleteButton what="Bu kayıt" onConfirm={() => remove.mutate(e.id)} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Bu ay kayıt yok.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Öğrenci Gözlemleri ---------- */

export function ConductStudents() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('conduct');
  const [month, setMonth] = useState(thisMonth());
  const [classId, setClassId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const classes = useQuery({ queryKey: [schoolId, 'conduct', 'classes'], queryFn: () => api<ConductClass[]>(`${path}/classes`) });
  const active = classId ?? classes.data?.find((c) => c.students > 0)?.id ?? null;
  const screen = useQuery({
    queryKey: [schoolId, 'conduct', 'class', active, month],
    queryFn: () => api<ClassScreen>(`${path}/classes/${active}/students?month=${month}`),
    enabled: Boolean(active),
  });
  const s = screen.data;
  return (
    <>
      <PageHeader
        title="Öğrenci Gözlemleri"
        description="Öğretmenlerin mobil uygulamadan verdiği artı ve eksiler. Bir öğrenciye tıklayınca kartı açılır. Bu sayfayı idare ve rehber öğretmenler görür; veliler ve pano görmez."
        actions={<MonthInput value={month} onChange={setMonth} />}
      />
      {classes.isLoading ? (
        <Spinner />
      ) : !classes.data?.length ? (
        <Card>
          <EmptyState icon={<ClipboardCheck className="size-6" />} title="Sınıf yok" description="Önce Öğrenciler sayfasından öğrencileri sınıflarıyla birlikte ekleyin." />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {classes.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClassId(c.id)}
                className={clsx(
                  'h-9 rounded-full px-4 text-sm font-bold transition',
                  c.id === active ? 'bg-brand-600 text-white' : 'bg-surface text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100',
                )}
              >
                {c.name}
                <span className="ml-1.5 text-xs opacity-60">{c.students}</span>
              </button>
            ))}
          </div>
          <Card>
            {!s ? (
              <Spinner />
            ) : !s.students.length ? (
              <EmptyState icon={<ClipboardCheck className="size-6" />} title="Bu sınıfta öğrenci yok" />
            ) : (
              <Table head={['Okul no', 'Ad soyad', 'Artı', 'Eksi', 'Net', '']}>
                {s.students.map((st) => (
                  <tr key={st.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(st.id)}>
                    <Td className="font-semibold text-slate-500 tabular-nums">{st.schoolNo}</Td>
                    <Td>
                      <span className="flex items-center gap-3 font-bold text-ink">
                        <Avatar name={st.fullName} size="size-8" />
                        {st.fullName}
                      </span>
                    </Td>
                    <Td className="font-semibold text-emerald-700 tabular-nums">{st.plus ? `+${st.plus}` : '—'}</Td>
                    <Td className="font-semibold text-rose-700 tabular-nums">{st.minus ? `−${st.minus}` : '—'}</Td>
                    <Td>
                      <NetPill n={st.net} />
                    </Td>
                    <Td className="text-right">
                      <ArrowUpRight className="ml-auto size-4 text-slate-400" />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
      <StudentCard studentId={open} month={month} criteria={s?.criteria ?? []} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------- Ayın Öğrencisi ---------- */

export function MonthStudent() {
  const { schoolId, can } = useAuth();
  const path = useSchoolPath('conduct');
  const qc = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [scope, setScope] = useState<'school' | 'level' | 'class'>('school');
  const [key, setKey] = useState('');
  const [choosing, setChoosing] = useState<Candidates['candidates'][number] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const classes = useQuery({ queryKey: [schoolId, 'conduct', 'classes'], queryFn: () => api<ConductClass[]>(`${path}/classes`) });
  const levels = [...new Set((classes.data ?? []).map((c) => c.level))];
  const effectiveKey = scope === 'school' ? '' : key || (scope === 'level' ? (levels[0] ?? '') : (classes.data?.[0]?.id ?? ''));
  const data = useQuery({
    queryKey: [schoolId, 'conduct', 'candidates', month, scope, effectiveKey],
    queryFn: () => api<Candidates>(`${path}/awards/candidates?month=${month}&scope=${scope}&key=${encodeURIComponent(effectiveKey)}`),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId] });
  const choose = useMutation({
    mutationFn: () => api(`${path}/awards`, { method: 'POST', body: { month, studentId: choosing!.studentId, title: title || null, description: description || null } }),
    onSuccess: () => {
      toast.success(`${choosing!.student.fullName} ayın öğrencisi seçildi; panoda Başarılar'da görünür`);
      setChoosing(null);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const undo = useMutation({
    mutationFn: (id: string) => api(`${path}/awards/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Seçim geri alındı; panodan da kaldırıldı');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const d = data.data;
  const manager = can('conduct.manage');

  return (
    <>
      <PageHeader
        title={`Ayın Öğrencisi · ${monthLabel(month)}`}
        description="Öğretmenlerin gözlem kayıtlarından ilk 5 öneri. Seçtiğiniz öğrenci panoya yalnızca adı ve sınıfıyla “Ayın öğrencisi” olarak çıkar; puanlar ve sıralama hiçbir zaman panoda görünmez."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={scope}
              onChange={(v) => {
                setScope(v);
                setKey('');
              }}
              options={[
                { value: 'school', label: 'Okul' },
                { value: 'level', label: 'Düzey' },
                { value: 'class', label: 'Sınıf' },
              ]}
            />
            {scope === 'level' && (
              <Select value={effectiveKey} onChange={(e) => setKey(e.target.value)} className="w-36" aria-label="Düzey">
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {SCHOOL_LEVELS[l]}
                  </option>
                ))}
              </Select>
            )}
            {scope === 'class' && (
              <Select value={effectiveKey} onChange={(e) => setKey(e.target.value)} className="w-32" aria-label="Sınıf">
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            <MonthInput value={month} onChange={setMonth} />
          </div>
        }
      />
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          {d.awards.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 text-lg font-extrabold tracking-tight">Bu ay seçilenler</div>
              <div className="flex flex-wrap gap-2">
                {d.awards.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-2 rounded-full bg-tile-sun py-1.5 pr-1.5 pl-3 text-sm font-bold text-tile-sun-ink">
                    <Star className="size-4" />
                    {a.fullName}
                    <span className="opacity-60">{a.className}</span>
                    {manager && (
                      <IconButton label="Seçimi geri al" className="size-7 hover:bg-white/50" onClick={() => undo.mutate(a.id)}>
                        <Undo2 className="size-3.5" />
                      </IconButton>
                    )}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {!d.candidates.length ? (
            <Card>
              <EmptyState
                icon={<Star className="size-6" />}
                title="Bu ay için öneri yok"
                description={`Öneriye girmek için öğrencinin bu ay en az ${CONDUCT_MIN_TEACHERS} farklı öğretmenden artı almış olması gerekir.`}
              />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {d.candidates.map((c, i) => {
                const first = i === 0;
                const chosen = d.awards.some((a) => a.studentId === c.studentId);
                const earlier = c.awardedIn.filter((m) => m !== d.month);
                return (
                  <div key={c.studentId} className={clsx('flex flex-col rounded-3xl p-4', first ? 'bg-tile-dark text-white' : 'bg-surface ring-1 ring-slate-200')}>
                    <div className="text-xs font-extrabold opacity-60">{i + 1}. ÖNERİ</div>
                    <button type="button" className="mt-3 flex items-center gap-3 text-left" onClick={() => setOpen(c.studentId)}>
                      <Avatar name={c.student.fullName} size="size-11" />
                      <span className="min-w-0">
                        <span className="block truncate font-extrabold">{c.student.fullName}</span>
                        <span className="text-xs font-semibold opacity-60">
                          {c.student.className ?? 'Sınıfsız'} · No {c.student.schoolNo}
                        </span>
                      </span>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-extrabold">
                      <span className={clsx('rounded-lg px-2 py-0.5', first ? 'bg-white/10 text-emerald-300' : 'bg-tile-mint text-tile-mint-ink')}>
                        +{c.plus} / −{c.minus}
                      </span>
                      <span className={clsx('rounded-lg px-2 py-0.5', first ? 'bg-white/10' : 'bg-slate-100 text-slate-600')}>dengeli puan {c.balanced}</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold opacity-70">
                      {c.teachers} öğretmen{c.topLabel ? ` · en çok: ${c.topLabel}` : ''}
                    </div>
                    {earlier.length > 0 && <div className="mt-1 text-xs font-semibold opacity-70">Daha önce seçildi: {earlier.map(monthLabel).join(', ')}</div>}
                    <div className="mt-auto pt-4">
                      {chosen ? (
                        <Badge tone="green">Seçildi</Badge>
                      ) : manager ? (
                        <button
                          type="button"
                          onClick={() => {
                            setChoosing(c);
                            setTitle('');
                            setDescription('');
                          }}
                          className={clsx('h-9 w-full rounded-full text-xs font-extrabold whitespace-nowrap', first ? 'bg-tile-sun text-tile-sun-ink' : 'bg-slate-100 hover:bg-slate-200')}
                        >
                          Seç · panoya gönder
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Alert tone="blue">
            Sıralama dengelidir: bir öğretmenin bir öğrenciye etkisi en fazla ±{CONDUCT_TEACHER_CAP} sayılır ve öneriye girmek için en az {CONDUCT_MIN_TEACHERS} farklı öğretmenden artı gerekir. Böylece tek bir
            öğretmenin puanları sıralamayı belirleyemez.
          </Alert>
        </div>
      )}
      <Modal
        open={Boolean(choosing)}
        onClose={() => setChoosing(null)}
        title="Ayın öğrencisi seçilsin mi?"
        description={choosing ? `${choosing.student.fullName} · ${choosing.student.className ?? ''}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setChoosing(null)}>
              Vazgeç
            </Button>
            <Button loading={choose.isPending} icon={<Star className="size-4" />} onClick={() => choose.mutate()}>
              Seç ve panoya gönder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Başlık" help={`Boş bırakılırsa “${monthLabel(month)} ayının öğrencisi” yazılır.`}>
            {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={`${monthLabel(month)} ayının öğrencisi`} />}
          </Field>
          <Field label="Açıklama (isteğe bağlı)">
            {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Ör. Derslere katılımı ve arkadaşlarına yardımseverliği için" />}
          </Field>
          <p className="text-xs text-slate-500">Panoda bir ay boyunca Başarılar kartında ve duyuru alanında görünür. Fotoğraf eklemek ya da süresini değiştirmek için Başarılar sayfasını kullanın.</p>
        </div>
      </Modal>
      <StudentCard studentId={open} month={month} criteria={[]} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------- Gözlem Kriterleri ---------- */

type CriterionForm = { group: ConductGroup; label: string; points: number; noteRequired: boolean };

export function ConductCriteria() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('conduct');
  const qc = useQueryClient();
  const toast = useToast();
  const school = useSchool();
  const [level, setLevel] = useState<SchoolLevel | null>(null);
  const classes = useQuery({ queryKey: [schoolId, 'conduct', 'classes'], queryFn: () => api<ConductClass[]>(`${path}/classes`) });
  const lv = level ?? classes.data?.[0]?.level ?? 'high';
  const list = useQuery({ queryKey: [schoolId, 'conduct', 'criteria', lv], queryFn: () => api<Criterion[]>(`${path}/criteria?level=${lv}`) });
  const [editing, setEditing] = useState<Criterion | 'new' | null>(null);
  const [form, setForm] = useState<CriterionForm>({ group: 'academic', label: '', points: 1, noteRequired: false });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId, 'conduct'] });

  const template = useMutation({
    mutationFn: () => api<{ added: number }>(`${path}/criteria/template`, { method: 'POST', body: { level: lv } }),
    onSuccess: (r) => {
      toast.success(r.added ? `${r.added} kriter eklendi` : 'Hazır şablondaki kriterlerin hepsi zaten var');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Criterion> }) => api(`${path}/criteria/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/criteria/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Kriter silindi; geçmiş kayıtlar korunur');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: (body: unknown) => (editing && editing !== 'new' ? api(`${path}/criteria/${editing.id}`, { method: 'PATCH', body }) : api(`${path}/criteria`, { method: 'POST', body })),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) => setError(e.message),
  });
  const setClassLevel = useMutation({
    mutationFn: ({ id, level }: { id: string; level: SchoolLevel | null }) => api(`${path}/classes/${id}`, { method: 'PATCH', body: { level } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const saveSettings = useMutation({
    mutationFn: (settings: Partial<SchoolSettings>) => api<School>(schoolRoot(schoolId), { method: 'PATCH', body: { settings } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      toast.success('Kaydedildi');
    },
    onError: (e) => toast.error(e.message),
  });

  const openForm = (c: Criterion | 'new') => {
    setError(null);
    setForm(c === 'new' ? { group: 'academic', label: '', points: 1, noteRequired: false } : { group: c.group, label: c.label, points: c.points, noteRequired: c.noteRequired });
    setEditing(c);
  };
  const submit = () => {
    const parsed = conductCriterionSchema.safeParse({ ...form, level: lv, isActive: editing && editing !== 'new' ? editing.isActive : true });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Geçersiz');
    save.mutate(parsed.data);
  };
  const retention = school.data?.settings.conductRetention ?? 'year';

  return (
    <>
      <PageHeader
        title="Gözlem Kriterleri"
        description="Öğretmenlerin artı ve eksi verirken seçtiği davranışlar. Her okul düzeyinin (ilkokul, ortaokul, lise) kendi listesi vardır; bir sınıf, düzeyindeki kriterleri görür."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} loading={template.isPending} onClick={() => template.mutate()}>
              Hazır şablonu yükle
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => openForm('new')}>
              Kriter ekle
            </Button>
          </>
        }
      />
      <div className="space-y-5">
        <Segmented value={lv} onChange={setLevel} options={LEVEL_OPTIONS} />
        <Card>
          {list.isLoading ? (
            <Spinner />
          ) : !list.data?.length ? (
            <EmptyState
              icon={<ClipboardCheck className="size-6" />}
              title={`${SCHOOL_LEVELS[lv]} için kriter yok`}
              description="Hazır şablonu yükleyip okulunuza göre düzenleyebilir ya da kendi kriterlerinizi ekleyebilirsiniz."
              action={
                <Button loading={template.isPending} onClick={() => template.mutate()}>
                  Hazır şablonu yükle
                </Button>
              }
            />
          ) : (
            <Table head={['Grup', 'Kriter', 'Puan', 'Not', 'Açık', '']}>
              {list.data.map((c) => (
                <tr key={c.id} className={clsx(!c.isActive && 'opacity-50')}>
                  <Td className="text-slate-500">{CONDUCT_GROUPS[c.group]}</Td>
                  <Td className="font-bold text-ink">{c.label}</Td>
                  <Td>
                    <NetPill n={c.points} />
                  </Td>
                  <Td className="text-slate-500">{c.noteRequired ? 'Zorunlu' : 'İsteğe bağlı'}</Td>
                  <Td>
                    <Toggle checked={c.isActive} onChange={(v) => patch.mutate({ id: c.id, body: { isActive: v } })} />
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <IconButton label="Düzenle" onClick={() => openForm(c)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <DeleteButton what="Bu kriter" onConfirm={() => remove.mutate(c.id)} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <div className="text-lg font-extrabold tracking-tight">Sınıf düzeyleri</div>
            <p className="mt-1 mb-3 text-sm text-slate-500">Düzey sınıf adından anlaşılır (9-A → Lise). Anlaşılamayan ya da farklı olan sınıflar için elle seçin.</p>
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {(classes.data ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2">
                  <span className="w-24 font-bold">{c.name}</span>
                  <Select
                    value={c.levelSet ? c.level : ''}
                    onChange={(e) => setClassLevel.mutate({ id: c.id, level: (e.target.value || null) as SchoolLevel | null })}
                    className="w-56"
                    aria-label={`${c.name} düzeyi`}
                  >
                    <option value="">Otomatik ({SCHOOL_LEVELS[c.level]})</option>
                    {LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-lg font-extrabold tracking-tight">Saklama süresi (KVKK)</div>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Gözlem kayıtları yalnızca öğretmenler, rehber öğretmenler ve idare tarafından görülür; veliler ve pano görmez. Kayıtların gereğinden uzun saklanmaması önerilir.
            </p>
            <Toggle
              checked={retention === 'year'}
              onChange={(v) => saveSettings.mutate({ conductRetention: v ? 'year' : 'keep' })}
              label="Öğretim yılı sonunda kayıtları sil"
              description="Yeni öğretim yılı başlayınca (1 Eylül) önceki yılın gözlem kayıtları ve rehberlik uyarıları kendiliğinden silinir. Ayın öğrencisi seçimleri kalır."
            />
          </Card>
          {school.data && <ConductSettingsCards settings={school.data.settings} onSave={(s) => saveSettings.mutate(s)} />}
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `${SCHOOL_LEVELS[lv]} · yeni kriter` : 'Kriteri düzenle'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Vazgeç
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="Kriter adı">{(id) => <Input id={id} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} placeholder="Ör. Derse katılım" />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grup">
              {(id) => (
                <Select id={id} value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as ConductGroup })}>
                  {(Object.keys(CONDUCT_GROUPS) as ConductGroup[]).map((g) => (
                    <option key={g} value={g}>
                      {CONDUCT_GROUPS[g]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Puan" help="−5 ile +5 arası; eksi puanlar olumsuz davranış içindir.">
              {(id) => (
                <Select id={id} value={form.points} onChange={(e) => {
                  const points = Number(e.target.value);
                  setForm({ ...form, points, noteRequired: points < 0 ? true : form.noteRequired });
                }}>
                  {[5, 4, 3, 2, 1, -1, -2, -3, -4, -5].map((n) => (
                    <option key={n} value={n}>
                      {signed(n)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Toggle checked={form.noteRequired} onChange={(v) => setForm({ ...form, noteRequired: v })} label="Not zorunlu" description="Öğretmen kaydederken kısa bir açıklama yazar (eksi puanlarda önerilir)." />
        </div>
      </Modal>
    </>
  );
}

/** Okul ayarlarının adresi (useSchoolPath hook olduğu için mutasyon içinde kullanılamaz) */
const schoolRoot = (schoolId: string | null) => `/api/schools/${schoolId}`;

/* ---------- Dönem Göstergesi ---------- */

interface TermReport {
  startYear: number;
  term: ConductTerm;
  term2Start: string;
  range: { from: string; to: string };
  mine: boolean;
  class: {
    id: string;
    name: string;
    counts: Record<ConductBand, number>;
    entries: number;
    students: {
      id: string;
      schoolNo: string;
      fullName: string;
      plus: number;
      minus: number;
      teachers: number;
      topPlus: string | null;
      topMinus: string | null;
      band: ConductBand;
    }[];
  };
}

const BAND_STYLE: Record<ConductBand, string> = {
  high: 'bg-tile-mint text-tile-mint-ink',
  mid: 'bg-slate-100 text-slate-600',
  low: 'bg-tile-peach text-tile-peach-ink',
  none: 'bg-transparent text-slate-400 ring-1 ring-slate-200',
};

function BandPill({ band }: { band: ConductBand }) {
  return <span className={clsx('inline-flex rounded-full px-3 py-1 text-xs font-extrabold whitespace-nowrap', BAND_STYLE[band])}>{CONDUCT_BANDS[band]}</span>;
}

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);

export function ConductReport() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('conduct');
  const school = useSchool();
  const toast = useToast();
  const [term, setTerm] = useState<ConductTerm | null>(null);
  const [mine, setMine] = useState(false);
  const [classId, setClassId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'class' | 'all' | null>(null);
  const classes = useQuery({
    queryKey: [schoolId, 'conduct', 'classes'],
    queryFn: () => api<ConductClass[]>(`${path}/classes`),
  });
  const active = classId ?? classes.data?.find((c) => c.students > 0)?.id ?? null;
  const query = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      ...(term ? { term: String(term) } : {}),
      ...(mine ? { mine: '1' } : {}),
      ...extra,
    }).toString();
  const report = useQuery({
    queryKey: [schoolId, 'conduct', 'report', active, term, mine],
    queryFn: () => api<TermReport>(`${path}/report?${query({ classId: active! })}`),
    enabled: Boolean(active),
  });
  const r = report.data;
  const shownTerm = term ?? r?.term ?? 1;
  const download = async (all: boolean) => {
    setDownloading(all ? 'all' : 'class');
    try {
      const name = all ? 'Dönem Göstergesi' : `Dönem Göstergesi ${r?.class.name ?? ''}`;
      await downloadFile(`${path}/report.xlsx?${query(all || !active ? {} : { classId: active })}`, excelFileName(school.data?.name, `${name} ${shownTerm}. Dönem`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader
        title={`Dönem Göstergesi${r ? ` · ${r.class.name}` : ''}`}
        description="Dönem sonu performans notunu verirken yardımcı gösterge. Not önermez; öğrencinin dönem boyunca aldığı gözlemleri üç banda ayırır. Veliler ve pano görmez."
      />
      {classes.isLoading ? (
        <Spinner />
      ) : !classes.data?.length ? (
        <Card>
          <EmptyState icon={<Gauge className="size-6" />} title="Sınıf yok" description="Önce Öğrenciler sayfasından öğrencileri sınıflarıyla birlikte ekleyin." />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={shownTerm}
              onChange={(v) => setTerm(v)}
              options={[
                { value: 1 as ConductTerm, label: '1. Dönem' },
                { value: 2 as ConductTerm, label: '2. Dönem' },
              ]}
            />
            <Segmented
              value={mine ? 'mine' : 'all'}
              onChange={(v) => setMine(v === 'mine')}
              options={[
                { value: 'all', label: 'Tüm öğretmenler' },
                { value: 'mine', label: 'Yalnızca benim' },
              ]}
            />
            {r && (
              <span className="text-sm font-semibold text-slate-500">
                {dayLabel(r.range.from)} – {dayLabel(dayBefore(r.range.to))}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} loading={downloading === 'all'} onClick={() => void download(true)}>
                Tüm sınıflar
              </Button>
              <Button icon={<FileSpreadsheet className="size-4" />} loading={downloading === 'class'} disabled={!active} onClick={() => void download(false)}>
                Excel
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {classes.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClassId(c.id)}
                className={clsx(
                  'h-9 rounded-full px-4 text-sm font-bold transition',
                  c.id === active ? 'bg-brand-600 text-white' : 'bg-surface text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          {!r ? (
            <Spinner />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {(
                  [
                    ['Yüksek', `${r.class.counts.high} öğrenci`, 'bg-tile-mint text-tile-mint-ink'],
                    ['Orta', `${r.class.counts.mid} öğrenci`, 'bg-slate-100 text-ink'],
                    ['Gelişime açık', `${r.class.counts.low} öğrenci`, 'bg-tile-peach text-tile-peach-ink'],
                    [mine ? 'Kayıtlarım' : 'Gözlem kaydı', String(r.class.entries), 'bg-tile-sun text-tile-sun-ink'],
                  ] as const
                ).map(([label, value, cls]) => (
                  <div key={label} className={clsx('rounded-3xl p-5', cls)}>
                    <div className="text-sm font-bold opacity-80">{label}</div>
                    <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
              <Card>
                {!r.class.students.length ? (
                  <EmptyState icon={<Gauge className="size-6" />} title="Bu sınıfta öğrenci yok" />
                ) : (
                  <Table head={['No', 'Ad soyad', 'Artı', 'Eksi', 'Öğretmen', 'Öne çıkan', 'Gelişim alanı', 'Gösterge']}>
                    {r.class.students.map((s) => (
                      <tr key={s.id}>
                        <Td className="font-semibold text-slate-500 tabular-nums">{s.schoolNo}</Td>
                        <Td>
                          <span className="flex items-center gap-3 font-bold text-ink">
                            <Avatar name={s.fullName} size="size-8" />
                            {s.fullName}
                          </span>
                        </Td>
                        <Td className="font-semibold text-emerald-700 tabular-nums">{s.plus ? `+${s.plus}` : '—'}</Td>
                        <Td className="font-semibold text-rose-700 tabular-nums">{s.minus ? `−${s.minus}` : '—'}</Td>
                        <Td className="text-slate-500 tabular-nums">{s.teachers || '—'}</Td>
                        <Td className="text-slate-600">{s.topPlus ?? '—'}</Td>
                        <Td className="text-slate-600">{s.topMinus ?? '—'}</Td>
                        <Td>
                          <BandPill band={s.band} />
                        </Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
              <Alert tone="blue">
                <b>Bant kuralı:</b> eksisi artısından fazla olan <b>gelişime açık</b>; artıları en az {CONDUCT_MIN_TEACHERS} öğretmenden gelen ve sınıfın üst %{Math.round(CONDUCT_HIGH_SHARE * 100)}
                'unda olan <b>yüksek</b>; diğerleri <b>orta</b>. Bir öğretmenin bir öğrenciye bir aydaki etkisi en fazla ±{CONDUCT_TEACHER_CAP} sayılır. “Yalnızca benim” seçilince sadece sizin
                kayıtlarınıza bakılır ve öğretmen sayısı şartı aranmaz.
              </Alert>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- Rehberlik Uyarıları ---------- */

interface ConductAlert {
  id: string;
  minusCount: number;
  windowDays: number;
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  note: string | null;
  student: {
    id: string;
    schoolNo: string;
    fullName: string;
    className: string | null;
  };
}

export function ConductAlerts() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('conduct');
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [resolving, setResolving] = useState<ConductAlert | null>(null);
  const [note, setNote] = useState('');
  const [card, setCard] = useState<{ id: string; month: string } | null>(null);
  const list = useQuery({
    queryKey: [schoolId, 'conduct', 'alerts', status],
    queryFn: () => api<{ open: number; alerts: ConductAlert[] }>(`${path}/alerts?status=${status}`),
  });
  const resolve = useMutation({
    mutationFn: () =>
      api(`${path}/alerts/${resolving!.id}/resolve`, {
        method: 'POST',
        body: { note: note.trim() || null },
      }),
    onSuccess: () => {
      setResolving(null);
      toast.success('Görüşüldü olarak işaretlendi');
      void qc.invalidateQueries({ queryKey: [schoolId, 'conduct', 'alerts'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const open = list.data?.open ?? 0;

  return (
    <>
      <PageHeader
        title="Rehberlik Uyarıları"
        description="Kısa sürede okulun belirlediği sayıda eksi alan öğrenciler. Uyarılar sessizdir: öğrenci, veli ve öğretmenler görmez; yalnızca rehber öğretmen ve idare görür."
      />
      <div className="mb-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: `Bekleyen${open ? ` · ${open}` : ''}` },
            { value: 'resolved', label: 'Görüşüldü' },
          ]}
        />
      </div>
      <Card className="p-2 sm:p-3">
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.alerts.length ? (
          <EmptyState
            icon={<HeartHandshake className="size-6" />}
            title={status === 'open' ? 'Bekleyen uyarı yok' : 'Henüz görüşülen uyarı yok'}
            description={status === 'open' ? 'Eşiği aşan öğrenci olunca burada görünür ve rehber öğretmene bildirim gider.' : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 px-3 py-4">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() =>
                    setCard({
                      id: a.student.id,
                      month: a.createdAt.slice(0, 7),
                    })
                  }
                >
                  <Avatar name={a.student.fullName} />
                  <span className="min-w-0">
                    <span className="block font-extrabold text-ink">
                      {a.student.fullName}
                      <span className="font-semibold text-slate-500">
                        {a.student.className ? ` · ${a.student.className}` : ''} · No {a.student.schoolNo}
                      </span>
                    </span>
                    <span className="block text-sm text-slate-500">
                      Son {a.windowDays} günde {a.minusCount} eksi · {a.summary}
                    </span>
                    {a.resolvedAt && (
                      <span className="mt-1 block text-sm text-slate-600">
                        <Check className="mr-1 inline size-3.5 text-emerald-600" />
                        {a.resolvedByName ?? 'Kullanıcı'} · {formatDateTime(a.resolvedAt)}
                        {a.note ? ` · “${a.note}”` : ''}
                      </span>
                    )}
                  </span>
                </button>
                <span className="text-xs whitespace-nowrap text-slate-400">{formatDateTime(a.createdAt)}</span>
                {!a.resolvedAt && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNote('');
                      setResolving(a);
                    }}
                  >
                    Görüşüldü
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title={resolving ? `${resolving.student.fullName} · görüşüldü` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)}>
              Vazgeç
            </Button>
            <Button loading={resolve.isPending} onClick={() => resolve.mutate()}>
              Kaydet
            </Button>
          </>
        }
      >
        <Field label="Görüşme notu (isteğe bağlı)" help="Yalnızca rehber öğretmen ve idare görür.">
          {(id) => <Textarea id={id} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. Öğrenciyle görüşüldü, veli bilgilendirildi." />}
        </Field>
      </Modal>
      <StudentCard studentId={card?.id ?? null} month={card?.month ?? thisMonth()} criteria={[]} onClose={() => setCard(null)} readOnly />
    </>
  );
}

/* ---------- Gözlem ayarları: rehberlik uyarısı ve dönemler ---------- */

function ConductSettingsCards({ settings, onSave }: { settings: SchoolSettings | undefined; onSave: (s: Partial<SchoolSettings>) => void }) {
  const rule = settings?.conductAlert ?? { enabled: true, days: 7, minus: 3 };
  const [days, setDays] = useState(String(rule.days));
  const [minus, setMinus] = useState(String(rule.minus));
  const [term2, setTerm2] = useState(settings?.conductTerm2Start ?? '');
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const saveRule = () => {
    const next = {
      ...rule,
      days: num(days, 1, 60, rule.days),
      minus: num(minus, 1, 20, rule.minus),
    };
    setDays(String(next.days));
    setMinus(String(next.minus));
    if (next.days !== rule.days || next.minus !== rule.minus) onSave({ conductAlert: next });
  };
  return (
    <>
      <Card className="p-5">
        <div className="text-lg font-extrabold tracking-tight">Rehberlik uyarısı</div>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          Rehber öğretmene sessizce haber verilir; okulda rehber öğretmen yoksa idareye gider. Aynı öğrenci için uyarı, görüşüldü işaretlenene kadar tekrar açılmaz.
        </p>
        <Toggle checked={rule.enabled} onChange={(v) => onSave({ conductAlert: { ...rule, enabled: v } })} label="Uyarı açık" />
        <div className={clsx('mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold', !rule.enabled && 'opacity-50')}>
          Bir öğrenci
          <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} onBlur={saveRule} className="w-16! text-center" aria-label="Gün" disabled={!rule.enabled} />
          gün içinde
          <Input
            type="number"
            min={1}
            max={20}
            value={minus}
            onChange={(e) => setMinus(e.target.value)}
            onBlur={saveRule}
            className="w-16! text-center"
            aria-label="Eksi sayısı"
            disabled={!rule.enabled}
          />
          eksi alırsa haber ver.
        </div>
      </Card>
      <Card className="p-5">
        <div className="text-lg font-extrabold tracking-tight">Dönemler</div>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          Dönem göstergesi için. Birinci dönem 1 Eylül'de başlar. İkinci dönemin başlangıcı boş bırakılırsa MEB çalışma takviminden, o da yoksa 1 Şubat'tan alınır.
        </p>
        <Field label="İkinci dönemin ilk günü (AA-GG)">
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={term2} onChange={(e) => setTerm2(e.target.value)} placeholder="Ör. 02-09 · boş: otomatik" className="w-48" maxLength={5} />
              <Button variant="secondary" onClick={() => onSave({ conductTerm2Start: term2.trim() || null })}>
                Kaydet
              </Button>
            </div>
          )}
        </Field>
      </Card>
    </>
  );
}
