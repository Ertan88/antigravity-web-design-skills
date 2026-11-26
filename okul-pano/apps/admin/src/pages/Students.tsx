import { compareClassNames, layoutModules, normalizeClassName, resolveLayout, studentSchema, errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Cake, FileUp, Search, Trash2 } from '../components/icons.tsx';
import { useRef, useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ExcelButtons } from '../components/ExcelButtons.tsx';
import { ExcelImportDialog, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Button, Field, Input, Select, Toggle } from '../components/ui.tsx';
import { confirm } from '../components/confirm.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchool, useSchoolPath, type ClassGroup, type Student } from '../lib/data.ts';
import { formatDate } from '../lib/format.ts';

type Form = { listNo: string; schoolNo: string; fullName: string; classGroupId: string; birthDate: string };

function studentImportMessage(res: { created: number; updated: number; classesCreated: number }): string {
  const parts = [`${res.created} öğrenci eklendi`];
  if (res.updated) parts.push(`${res.updated} öğrencinin bilgileri güncellendi`);
  if (res.classesCreated) parts.push(`${res.classesCreated} yeni sınıf oluşturuldu`);
  return parts.join(', ');
}

type Advisor = { className: string; teacherName: string; match: { id: string; fullName: string } | null; current: string | null };
const advisorChanges = (list: Advisor[] | undefined) => (list ?? []).filter((a) => a.match && a.current !== a.match.fullName).length;

/** e-Okul listesindeki sınıf öğretmenleri: sınıfların rehber öğretmeni olarak yazılır */
function AdvisorOption({ advisors, checked, onChange }: { advisors: Advisor[]; checked: boolean; onChange: (v: boolean) => void }) {
  const unmatched = advisors.filter((a) => !a.match);
  const changes = advisorChanges(advisors);
  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <Toggle
        checked={checked}
        onChange={onChange}
        label={`Sınıf rehber öğretmenlerini yaz (${advisors.length - unmatched.length} sınıf${changes ? `, ${changes} değişiklik` : ', değişiklik yok'})`}
        description="e-Okul'daki sınıf öğretmeni, sınıfın rehber öğretmeni olur; öğretmeni boş rehberlik dersleri bu öğretmene yazılır."
      />
      <div className="flex flex-wrap gap-1.5 pl-1 text-xs">
        {advisors.map((a) => (
          <span
            key={a.className}
            title={a.current && a.match && a.current !== a.match.fullName ? `Şu an: ${a.current}` : undefined}
            className={a.match ? 'rounded-full bg-surface px-2.5 py-0.5 ring-1 ring-slate-200' : 'rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800 ring-1 ring-amber-200'}
          >
            <b>{a.className}</b> · {a.match?.fullName ?? `${a.teacherName} (kadroda yok)`}
          </span>
        ))}
      </div>
    </div>
  );
}

type ExcelRow = { schoolNo: string; fullName: string; className: string | null; birthDate: string; listNo?: number | null };

function ExcelImport({ file, onClose }: { file: File | null; onClose: () => void }) {
  const basePath = useSchoolPath('students');
  return (
    <ExcelImportDialog<ExcelRow, ImportPreview<ExcelRow> & { additions: { label: string; values: string[] }[]; advisors?: Advisor[] }, { updateExisting: boolean; advisors: boolean }>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['students', 'classes']}
      initialOptions={{ updateExisting: true, advisors: true }}
      columns={[
        { header: 'Okul no', cell: (r) => <span className="font-semibold tabular-nums">{r.schoolNo}</span> },
        { header: 'Ad soyad', cell: (r) => <span className="font-medium whitespace-nowrap text-ink">{r.fullName}</span> },
        { header: 'Sınıf', cell: (r) => r.className ?? '—' },
        { header: 'Doğum tarihi', cell: (r) => <span className="whitespace-nowrap">{formatDate(r.birthDate)}</span> },
      ]}
      stats={(p) => [
        { label: 'Yeni öğrenci', value: p.totals.new, tone: 'green' },
        { label: 'Güncellenecek', value: p.totals.update, tone: 'blue' },
        { label: 'Değişiklik yok', value: p.totals.unchanged, tone: 'slate' },
        { label: 'Atlanacak satır', value: p.totals.skipped, tone: p.totals.skipped ? 'amber' : 'slate' },
      ]}
      additions={(p) => p.additions}
      renderOptions={(p, o, set) => (
        <>
          {p.totals.update > 0 && (
            <Toggle
              checked={o.updateExisting}
              onChange={(v) => set({ ...o, updateExisting: v })}
              label="Kayıtlı öğrencilerin bilgilerini güncelle"
              description="Yeni dönemde sınıf atlayan öğrenciler için açık bırakın. Öğrenci okul numarasıyla tanınır; adı, sınıfı, sıra numarası ve doğum tarihi dosyadakiyle güncellenir."
            />
          )}
          {(p.advisors?.length ?? 0) > 0 && <AdvisorOption advisors={p.advisors!} checked={o.advisors} onChange={(v) => set({ ...o, advisors: v })} />}
        </>
      )}
      rowStatus={(r, o) => (r.status === 'update' && !o.updateExisting ? 'unchanged' : r.status)}
      commitCount={(p, o) => p.totals.new + (o.updateExisting ? p.totals.update : 0) + (o.advisors ? advisorChanges(p.advisors) : 0)}
      commitLabel={(n) => `${n} değişikliği kaydet`}
      commitBody={(p, o) => ({
        updateExisting: o.updateExisting,
        advisors: o.advisors ? (p.advisors ?? []).filter((a) => a.match).map(({ className, teacherName }) => ({ className, teacherName })) : undefined,
        rows: p.rows.map(({ schoolNo, fullName, className, birthDate, listNo }) => ({ schoolNo, fullName, className, birthDate, listNo: listNo ?? null })),
      })}
      successMessage={studentImportMessage}
    />
  );
}

/** Öğrenci listesini tamamen siler: yanlış ya da eski yıla ait liste yüklendiğinde baştan başlamak için */
function ClearStudents({ count }: { count: number }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('students');
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const clear = async () => {
    setBusy(true);
    try {
      const res = await api<{ deleted: number }>(`${path}/delete-all`, { method: 'POST', body: { confirm: 'delete-all' } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'students'] });
      toast.success(`Öğrenci listesi temizlendi (${res.deleted} öğrenci)`);
    } catch (err) {
      toast.error(errorText(err, 'Silinemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="delete"
        size="sm"
        className="ml-auto"
        icon={<Trash2 className="size-3.5" />}
        loading={busy}
        onClick={async () => {
          const ok = await confirm({
            title: 'Öğrenci listesi temizlensin mi?',
            message: `${count} öğrenci ve doğum tarihleri silinir; panoda doğum günü kutlaması görünmez. Sınıflar kalır. Bu işlem geri alınamaz; gerekiyorsa önce "Excel'e aktar" ile listeyi indirin.`,
            tone: 'danger',
            hold: true,
            holdLabel: 'Silmek için basılı tutun',
          });
          if (ok) void clear();
        }}
      >
        Listeyi temizle
      </Button>
    </>
  );
}

export function Students() {
  const [q, setQ] = useState('');
  const [onlyToday, setOnlyToday] = useState(false);
  const [classFilter, setClassFilter] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const { can, schoolId } = useAuth();
  const studentsPath = useSchoolPath('students');
  const qcStatus = useQueryClient();
  const toastStatus = useToast();
  const changeStatus = async (r: Student, status: 'active' | 'absent' | 'left') => {
    try {
      await api(`${studentsPath}/${r.id}/status`, { method: 'PUT', body: { status } });
      await qcStatus.invalidateQueries({ queryKey: [schoolId] });
      toastStatus.success(status === 'left' ? `${r.fullName}: okuldan ayrıldı (listelerden çıkarıldı)` : status === 'absent' ? `${r.fullName}: sürekli devamsız` : `${r.fullName}: yeniden etkin`);
    } catch (err) {
      toastStatus.error(errorText(err, 'Durum değiştirilemedi'));
    }
  };
  const classes = useList<ClassGroup>('classes');
  const studentCount = useList<Student>('students').data?.length ?? 0;
  const school = useSchool();
  const classNames = nameMap(classes.data, (c) => c.name);
  // Sınıf sırası (9-A, 9-B, 10-A…), sınıf içinde e-Okul sıra numarası
  const byClass = (a: Student, b: Student) =>
    compareClassNames(classNames.get(a.classGroupId ?? '') ?? '~', classNames.get(b.classGroupId ?? '') ?? '~') ||
    (a.listNo ?? 9999) - (b.listNo ?? 9999) ||
    a.fullName.localeCompare(b.fullName, 'tr');
  const now = new Date();
  const todayMd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const layout = school.data ? resolveLayout(school.data.settings) : null;
  const hidden = layout && !layoutModules(layout).includes('birthdays');

  return (
    <>
      <CrudPage<Student, Form>
        resource="students"
        label="Öğrenci"
        title="Öğrenciler"
        description={
          <>
            Okul numarası her öğrenci için zorunludur ve okul içinde benzersizdir; gözlem kayıtları ve Excel aktarımı bu numarayla eşleşir. Doğum günü olan öğrenciler o gün panoda kutlanır. Gizlilik için varsayılan olarak soyadın yalnızca baş harfi gösterilir (Ayşe Y.); bunu Okul Ayarları'ndan değiştirebilirsiniz.
            {hidden && <span className="mt-1 block font-medium text-amber-700">Doğum günü alanı şu an pano düzeninde yok (Panolar › Pano düzeni).</span>}
          </>
        }
        permission="students.manage"
        icon={<Cake className="size-6" />}
        filteredEmpty={
          onlyToday
            ? { title: 'Bugün doğum günü olan öğrenci yok', text: classFilter || needle ? 'Seçili sınıfta ya da aramada bugün doğan öğrenci bulunamadı.' : undefined }
            : { title: 'Aramaya uyan öğrenci yok', text: 'Sınıf seçimini ya da arama metnini değiştirin.' }
        }
        emptyTitle="Öğrenci eklenmemiş"
        emptyText="e-Okul'dan indirdiğiniz sınıf listesi PDF'ini yükleyin; sınıflar, sıra numaraları, okul numaraları ve doğum tarihleri birlikte gelir. Excel'den ya da tek tek de ekleyebilirsiniz."
        addLabel="Öğrenci ekle"
        actionsInToolbar
        headerActions={
          <>
            {can('students.manage') && (
              <>
                <input
                  ref={pdfInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    setExcelFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                <Button size="sm" icon={<FileUp className="size-4" />} onClick={() => pdfInput.current?.click()}>
                  e-Okul listesi (PDF)
                </Button>
              </>
            )}
            <ExcelButtons
              basePath={studentsPath}
              module="Öğrenci Listesi"
              canImport={can('students.manage')}
              onFile={setExcelFile}
              size="sm"
            />
            {can('students.manage') && studentCount > 0 && <ClearStudents count={studentCount} />}
          </>
        }
        schema={studentSchema}
        toolbar={
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, okul no ya da sınıf ara" className="pl-9" aria-label="Öğrenci ara" />
            </div>
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="w-full sm:w-52" aria-label="Sınıf">
              <option value="">Bütün sınıflar</option>
              {[...(classes.data ?? [])]
                .sort((a, b) => compareClassNames(a.name, b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              <option value="none">Sınıfsız</option>
            </Select>
            <Toggle checked={onlyToday} onChange={setOnlyToday} label="Yalnızca bugün doğanlar" />
          </div>
        }
        select={(rows) =>
          [...rows].sort(byClass).filter(
            (r) =>
              (!onlyToday || r.birthDate.slice(5) === todayMd) &&
              (!classFilter || (classFilter === 'none' ? !r.classGroupId : r.classGroupId === classFilter)) &&
              (!needle || `${r.schoolNo} ${r.fullName} ${classNames.get(r.classGroupId ?? '') ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)),
          )
        }
        columns={[
          // Görünen listedeki sıra: bütün sınıflarda kesintisiz, sınıf seçilince o sınıfta 1'den
          { header: 'S.No', cell: (_r, i) => <span className="text-slate-500 tabular-nums">{i + 1}</span> },
          { header: 'Okul no', cell: (r) => <span className="font-semibold text-slate-600 tabular-nums">{r.schoolNo}</span> },
          {
            header: 'Ad soyad',
            cell: (r) => (
              <span className="flex items-center gap-2 font-semibold text-ink">
                {r.fullName}
                {r.birthDate.slice(5) === todayMd && (
                  <Badge tone="amber" dot>
                    Bugün
                  </Badge>
                )}
              </span>
            ),
          },
          { header: 'Sınıf', cell: (r) => <span className="text-slate-600">{classNames.get(r.classGroupId ?? '') ?? '—'}</span> },
          { header: 'Doğum tarihi', cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.birthDate)}</span> },
          // Sürekli devamsız / okuldan ayrıldı: bütün kullanıcılarda geçerli; ayrılan öğrenci silinmez, buradan geri alınır
          {
            header: 'Durum',
            cell: (r) =>
              can('students.manage') ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={r.status ?? 'active'}
                    onChange={(e) => void changeStatus(r, e.target.value as 'active' | 'absent' | 'left')}
                    className="h-9 w-44"
                    aria-label={`${r.fullName} durumu`}
                  >
                    <option value="active">Etkin</option>
                    <option value="absent">Sürekli devamsız</option>
                    <option value="left">Okuldan ayrıldı</option>
                  </Select>
                </span>
              ) : r.status === 'absent' ? (
                <Badge tone="amber">Sürekli devamsız</Badge>
              ) : r.status === 'left' ? (
                <Badge tone="slate">Okuldan ayrıldı</Badge>
              ) : (
                <span className="text-slate-400">Etkin</span>
              ),
          },
        ]}
        emptyForm={() => ({ listNo: '', schoolNo: '', fullName: '', classGroupId: '', birthDate: '' })}
        toForm={(r) => ({ listNo: r.listNo ? String(r.listNo) : '', schoolNo: r.schoolNo, fullName: r.fullName, classGroupId: r.classGroupId ?? '', birthDate: r.birthDate })}
        toPayload={(f) => ({ schoolNo: f.schoolNo, fullName: f.fullName, classGroupId: f.classGroupId || null, birthDate: f.birthDate, listNo: f.listNo ? Number(f.listNo) : null })}
        renderForm={({ values: v, set, errors }) => (
          <>
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="Okul no" error={errors.schoolNo}>
                {(id) => <Input id={id} value={v.schoolNo} inputMode="numeric" onChange={(e) => set('schoolNo', e.target.value)} invalid={Boolean(errors.schoolNo)} />}
              </Field>
              <Field label="Ad soyad" error={errors.fullName}>
                {(id) => <Input id={id} value={v.fullName} onChange={(e) => set('fullName', e.target.value)} invalid={Boolean(errors.fullName)} />}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sınıf" error={errors.classGroupId}>
                {(id) => (
                  <Select id={id} value={v.classGroupId} onChange={(e) => set('classGroupId', e.target.value)}>
                    <option value="">Sınıfsız</option>
                    {(classes.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Doğum tarihi" error={errors.birthDate}>
                {(id) => <Input id={id} type="date" value={v.birthDate} onChange={(e) => set('birthDate', e.target.value)} invalid={Boolean(errors.birthDate)} />}
              </Field>
            </div>
          </>
        )}
      />
      <ExcelImport file={excelFile} onClose={() => setExcelFile(null)} />
    </>
  );
}
