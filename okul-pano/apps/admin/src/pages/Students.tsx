import { layoutModules, normalizeClassName, resolveLayout, studentSchema } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Cake, ClipboardPaste, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ExcelButtons } from '../components/ExcelButtons.tsx';
import { ExcelImportDialog, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea, Toggle } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchool, useSchoolPath, type ClassGroup, type Student } from '../lib/data.ts';
import { formatDate } from '../lib/format.ts';

type Form = { schoolNo: string; fullName: string; classGroupId: string; birthDate: string };

interface ParsedRow {
  schoolNo: string;
  fullName: string;
  className: string | null;
  birthDate: string;
}

const DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/;
const CLASS = /^(\d{1,2}\s*[-/]?\s*[A-ZÇĞİÖŞÜa-zçğıöşü]{1,2}|anasınıfı.*|ana sınıfı.*)$/i;

/**
 * Excel'den, Google E-Tablolar'dan ya da e-Okul listesinden kopyalanan satırları çözer.
 * Sütun sırası serbesttir: tarih ve sınıf biçimlerinden, okul numarası satırdaki ilk sayıdan tanınır,
 * kalan metin ad soyad kabul edilir.
 */
function parseRows(text: string): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',')).map((c) => c.trim());
    let birthDate: string | null = null;
    let className: string | null = null;
    let schoolNo: string | null = null;
    const nameParts: string[] = [];
    for (const cell of cells) {
      const d = DATE.exec(cell);
      if (d && !birthDate) {
        birthDate = d[4] ? `${d[4]}-${d[5]}-${d[6]}` : `${d[3]}-${d[2]!.padStart(2, '0')}-${d[1]!.padStart(2, '0')}`;
      } else if (CLASS.test(cell) && !className) {
        className = normalizeClassName(cell);
      } else if (/^\d+$/.test(cell)) {
        schoolNo ??= cell;
      } else if (cell) {
        nameParts.push(cell);
      }
    }
    const fullName = nameParts.join(' ').replace(/\s+/g, ' ').trim();
    if (birthDate && schoolNo && fullName.length >= 2) rows.push({ schoolNo, fullName, className, birthDate });
    else skipped++;
  }
  return { rows, skipped };
}

function studentImportMessage(res: { created: number; updated: number; classesCreated: number }): string {
  const parts = [`${res.created} öğrenci eklendi`];
  if (res.updated) parts.push(`${res.updated} öğrencinin bilgileri güncellendi`);
  if (res.classesCreated) parts.push(`${res.classesCreated} yeni sınıf oluşturuldu`);
  return parts.join(', ');
}

type ExcelRow = { schoolNo: string; fullName: string; className: string | null; birthDate: string };

function ExcelImport({ file, onClose }: { file: File | null; onClose: () => void }) {
  const basePath = useSchoolPath('students');
  return (
    <ExcelImportDialog<ExcelRow, ImportPreview<ExcelRow> & { additions: { label: string; values: string[] }[] }, { updateExisting: boolean }>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['students', 'classes']}
      initialOptions={{ updateExisting: true }}
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
      renderOptions={(p, o, set) =>
        p.totals.update > 0 && (
          <Toggle
            checked={o.updateExisting}
            onChange={(v) => set({ updateExisting: v })}
            label="Kayıtlı öğrencilerin bilgilerini güncelle"
            description="Yeni dönemde sınıf atlayan öğrenciler için açık bırakın. Öğrenci okul numarasıyla tanınır; adı, sınıfı ve doğum tarihi dosyadakiyle güncellenir."
          />
        )
      }
      rowStatus={(r, o) => (r.status === 'update' && !o.updateExisting ? 'unchanged' : r.status)}
      commitCount={(p, o) => p.totals.new + (o.updateExisting ? p.totals.update : 0)}
      commitLabel={(n) => `${n} öğrenciyi kaydet`}
      commitBody={(p, o) => ({
        updateExisting: o.updateExisting,
        rows: p.rows.map(({ schoolNo, fullName, className, birthDate }) => ({ schoolNo, fullName, className, birthDate })),
      })}
      successMessage={studentImportMessage}
    />
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => parseRows(text), [text]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ created: number; updated: number; classesCreated: number }>(`/api/schools/${schoolId}/students/import`, {
        method: 'POST',
        body: { rows: parsed.rows },
      });
      await qc.invalidateQueries({ queryKey: [schoolId] });
      toast.success(studentImportMessage(res));
      setText('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İçe aktarma başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Listeden yapıştır"
      description="Excel ya da e-Okul listesindeki satırları kopyalayıp aşağıya yapıştırın."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!parsed.rows.length} onClick={() => void submit()}>
            {parsed.rows.length ? `${parsed.rows.length} öğrenciyi aktar` : 'Aktar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={'1203\tAyşe Yılmaz\t9-A\t14.03.2010\n1207\tMehmet Demir\t9-B\t02.11.2009'}
          aria-label="Öğrenci listesi"
        />
        <p className="text-xs text-slate-500">
          Her satırda okul numarası, ad soyad, sınıf (9-A) ve doğum tarihi (GG.AA.YYYY) bulunmalı; sütun sırası önemli değil. Satırdaki ilk sayı okul numarası kabul edilir.
        </p>
        {text && (
          <div className="rounded-xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-sm">
              <span className="font-semibold">{parsed.rows.length} satır tanındı</span>
              {parsed.skipped > 0 && <span className="text-amber-700">{parsed.skipped} satır atlandı (başlık ya da eksik bilgi)</span>}
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {parsed.rows.slice(0, 5).map((r, i) => (
                <li key={i} className="flex justify-between gap-3 px-4 py-2">
                  <span className="font-medium">
                    <span className="mr-2 text-slate-400 tabular-nums">{r.schoolNo}</span>
                    {r.fullName}
                  </span>
                  <span className="text-slate-500">
                    {r.className ?? 'sınıfsız'} · {formatDate(r.birthDate)}
                  </span>
                </li>
              ))}
              {parsed.rows.length > 5 && <li className="px-4 py-2 text-xs text-slate-500">… ve {parsed.rows.length - 5} öğrenci daha</li>}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Öğrenci listesini tamamen siler: yanlış ya da eski yıla ait liste yüklendiğinde baştan başlamak için */
function ClearStudents({ count }: { count: number }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('students');
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const clear = async () => {
    setBusy(true);
    try {
      const res = await api<{ deleted: number }>(`${path}/delete-all`, { method: 'POST', body: { confirm: 'delete-all' } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'students'] });
      toast.success(`Öğrenci listesi temizlendi (${res.deleted} öğrenci)`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto text-red-600! hover:bg-red-50 hover:text-red-700!"
        icon={<Trash2 className="size-3.5" />}
        onClick={() => setOpen(true)}
      >
        Listeyi temizle
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Öğrenci listesi temizlensin mi?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void clear()}>
              {count} öğrenciyi sil
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Bütün öğrenciler ve doğum tarihleri silinir; panoda doğum günü kutlaması görünmez. Sınıflar kalır. Bu işlem geri alınamaz; gerekiyorsa önce
          "Excel'e aktar" ile listeyi indirin.
        </p>
      </Modal>
    </>
  );
}

export function Students() {
  const [q, setQ] = useState('');
  const [onlyToday, setOnlyToday] = useState(false);
  const [importing, setImporting] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const { can } = useAuth();
  const studentsPath = useSchoolPath('students');
  const classes = useList<ClassGroup>('classes');
  const studentCount = useList<Student>('students').data?.length ?? 0;
  const school = useSchool();
  const classNames = nameMap(classes.data, (c) => c.name);
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
        emptyTitle="Öğrenci eklenmemiş"
        emptyText="Öğrencileri tek tek ekleyebilir ya da Excel / e-Okul listesinden toplu aktarabilirsiniz."
        addLabel="Öğrenci ekle"
        actionsInToolbar
        headerActions={
          <>
            <ExcelButtons
              basePath={studentsPath}
              module="Öğrenci Listesi"
              canImport={can('students.manage')}
              onFile={setExcelFile}
              size="sm"
              afterImport={
                can('students.manage') && (
                  <Button variant="secondary" size="sm" icon={<ClipboardPaste className="size-4" />} onClick={() => setImporting(true)}>
                    Yapıştırarak ekle
                  </Button>
                )
              }
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
            <Toggle checked={onlyToday} onChange={setOnlyToday} label="Yalnızca bugün doğanlar" />
          </div>
        }
        select={(rows) =>
          rows.filter(
            (r) =>
              (!onlyToday || r.birthDate.slice(5) === todayMd) &&
              (!needle || `${r.schoolNo} ${r.fullName} ${classNames.get(r.classGroupId ?? '') ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)),
          )
        }
        columns={[
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
        ]}
        emptyForm={() => ({ schoolNo: '', fullName: '', classGroupId: '', birthDate: '' })}
        toForm={(r) => ({ schoolNo: r.schoolNo, fullName: r.fullName, classGroupId: r.classGroupId ?? '', birthDate: r.birthDate })}
        toPayload={(f) => ({ schoolNo: f.schoolNo, fullName: f.fullName, classGroupId: f.classGroupId || null, birthDate: f.birthDate })}
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
      <ImportModal open={importing} onClose={() => setImporting(false)} />
      <ExcelImport file={excelFile} onClose={() => setExcelFile(null)} />
    </>
  );
}
