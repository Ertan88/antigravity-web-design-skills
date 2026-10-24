import { normalizeName, surnameOf, teacherSchema, trCompare } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Download, FileDown, FileSpreadsheet, Search, Tags, Trash2, Upload, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Toggle } from '../components/ui.tsx';
import { api, downloadFile, excelFileName } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { type Teacher, type TeacherOption, useList, useResource, useSchool, useSchoolPath } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { DeleteAllDialog } from './teachers/DeleteAllDialog.tsx';
import { ImportDialog } from './teachers/ImportDialog.tsx';
import { OptionSelect } from './teachers/OptionSelect.tsx';
import { OptionsManager } from './teachers/OptionsManager.tsx';
import { TeacherCard } from './teachers/TeacherCard.tsx';

type Sort = 'name-asc' | 'name-desc' | 'surname-asc';
type Form = { fullName: string; branchId: string; titleId: string; isActive: boolean };
const NO_BRANCH = '__none__';
const emptyForm = (keep?: Partial<Form>): Form => ({ fullName: '', branchId: keep?.branchId ?? '', titleId: keep?.titleId ?? '', isActive: true });

/* ---------- Ekleme bloğu: elle ekle + Excel'den yükle ---------- */

function AddBlock({ onManual, onFile, onTemplate }: { onManual: () => void; onFile: (f: File) => void; onTemplate: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <Card className="flex items-center gap-4 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <UserPlus className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Elle ekle</h2>
          <p className="text-xs text-slate-500">Ad soyad, branş ve ünvanı girerek tek tek ekleyin.</p>
        </div>
        <Button onClick={onManual}>Öğretmen ekle</Button>
      </Card>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={clsx(
          'flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors',
          drag ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-surface hover:border-brand-300 hover:bg-brand-50/40',
        )}
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <FileSpreadsheet className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Excel'den yükle</h2>
          <p className="text-xs text-slate-500">
            .xlsx dosyasını sürükleyin ya da seçin.{' '}
            <button
              type="button"
              className="font-semibold text-brand-600 hover:text-brand-700"
              onClick={(e) => {
                e.stopPropagation();
                onTemplate();
              }}
            >
              Örnek şablonu indir
            </button>
          </p>
        </div>
        <Upload className="size-5 shrink-0 text-slate-400" />
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/* ---------- Sayfa ---------- */

export function Teachers() {
  const { can } = useAuth();
  const editable = can('directory.manage');
  const toast = useToast();
  const qc = useQueryClient();
  const { schoolId } = useAuth();
  const teachersPath = useSchoolPath('teachers');
  const school = useSchool();
  const list = useList<Teacher>('teachers');
  const branches = useList<TeacherOption>('teacher-branches');
  const titles = useList<TeacherOption>('teacher-titles');
  const ops = useResource<Teacher>('teachers', 'Öğretmen');
  const form = useForm<Form>(emptyForm());

  const [q, setQ] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [sort, setSort] = useState<Sort>('name-asc');
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Teacher | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [managing, setManaging] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [downloading, setDownloading] = useState<'template' | 'export' | null>(null);

  const all = list.data ?? [];
  const sortedBranches = useMemo(() => [...(branches.data ?? [])].sort((a, b) => trCompare(a.name, b.name)), [branches.data]);
  const sortedTitles = useMemo(() => [...(titles.data ?? [])].sort((a, b) => trCompare(a.name, b.name)), [titles.data]);

  const visible = useMemo(() => {
    const needle = normalizeName(q);
    const rows = all.filter((t) => {
      if (branchFilter === NO_BRANCH ? t.branchId : branchFilter && t.branchId !== branchFilter) return false;
      if (!needle) return true;
      return normalizeName(`${t.fullName} ${t.branch ?? ''} ${t.title ?? ''}`).includes(needle);
    });
    const byName = (a: Teacher, b: Teacher) => trCompare(a.fullName, b.fullName);
    if (sort === 'name-desc') return rows.sort((a, b) => byName(b, a));
    if (sort === 'surname-asc') return rows.sort((a, b) => trCompare(surnameOf(a.fullName), surnameOf(b.fullName)) || byName(a, b));
    return rows.sort(byName);
  }, [all, q, branchFilter, sort]);

  const noBranchCount = all.filter((t) => !t.branchId).length;
  const filtered = Boolean(q || branchFilter);

  const download = async (kind: 'template' | 'export') => {
    setDownloading(kind);
    try {
      await downloadFile(`${teachersPath}/${kind}`, kind === 'template' ? excelFileName(undefined, 'Öğretmen Kadrosu Şablonu') : excelFileName(school.data?.name, 'Öğretmen Kadrosu'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İndirilemedi');
    } finally {
      setDownloading(null);
    }
  };

  const openNew = (keep?: Partial<Form>) => {
    form.reset(emptyForm(keep));
    setEditing('new');
  };
  const openEdit = (t: Teacher) => {
    form.reset({ fullName: t.fullName, branchId: t.branchId ?? '', titleId: t.titleId ?? '', isActive: t.isActive });
    setEditing(t);
  };

  const submit = async (andNext = false) => {
    const payload = form.validate(teacherSchema, {
      fullName: form.values.fullName,
      branchId: form.values.branchId || null,
      titleId: form.values.titleId || null,
      isActive: form.values.isActive,
    });
    if (!payload) return;
    try {
      if (editing && editing !== 'new') await ops.update.mutateAsync({ id: editing.id, body: payload });
      else await ops.create.mutateAsync(payload);
      void qc.invalidateQueries({ queryKey: [schoolId, 'teacher-branches'] });
      void qc.invalidateQueries({ queryKey: [schoolId, 'teacher-titles'] });
      // Hızlı giriş: aynı branş ve ünvanla bir sonrakine geç
      if (andNext) openNew({ branchId: form.values.branchId, titleId: form.values.titleId });
      else setEditing(null);
    } catch (err) {
      form.fail(err);
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => api(`${teachersPath}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId] });
      toast.success(`${deleting?.fullName} silindi`);
      setDeleting(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const saving = ops.create.isPending || ops.update.isPending;

  return (
    <>
      <PageHeader
        title="Öğretmen Kadrosu"
        description="Nöbet çizelgesi, izinler ve ders programında seçilen öğretmenler. Excel'den toplu yükleyebilir, listeyi Excel'e aktarabilirsiniz."
        actions={
          <>
            {editable && (
              <Button variant="secondary" icon={<Tags className="size-4" />} onClick={() => setManaging(true)}>
                Branş ve ünvanlar
              </Button>
            )}
            <Button variant="secondary" icon={<FileDown className="size-4" />} loading={downloading === 'export'} disabled={!all.length} onClick={() => void download('export')}>
              Excel'e aktar
            </Button>
          </>
        }
      />

      {editable && <AddBlock onManual={() => openNew()} onFile={setImportFile} onTemplate={() => void download('template')} />}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, branş ya da ünvan ara" className="pl-9" aria-label="Öğretmen ara" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:flex">
            <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Branşa göre filtrele" className="lg:w-56">
              <option value="">Tüm branşlar</option>
              {sortedBranches
                .filter((b) => b.teacherCount > 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.teacherCount})
                  </option>
                ))}
              {noBranchCount > 0 && <option value={NO_BRANCH}>Branşı girilmemiş ({noBranchCount})</option>}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sıralama" className="lg:w-48">
              <option value="name-asc">Ad (A → Z)</option>
              <option value="name-desc">Ad (Z → A)</option>
              <option value="surname-asc">Soyad (A → Z)</option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 lg:ml-auto">
            <span className="text-sm text-slate-500">
              {filtered ? `${visible.length} / ${all.length} öğretmen` : `${all.length} öğretmen`}
            </span>
            {editable && all.length > 0 && (
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="size-3.5" />} onClick={() => setDeletingAll(true)}>
                Tümünü sil
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {list.isLoading ? (
            <Spinner />
          ) : !all.length ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title="Henüz öğretmen eklenmemiş"
              description="Yukarıdan tek tek ekleyebilir ya da örnek şablonu indirip doldurduktan sonra Excel'den yükleyebilirsiniz."
              action={
                editable && (
                  <Button variant="secondary" icon={<Download className="size-4" />} loading={downloading === 'template'} onClick={() => void download('template')}>
                    Örnek şablonu indir
                  </Button>
                )
              }
            />
          ) : !visible.length ? (
            <EmptyState
              icon={<Search className="size-6" />}
              title="Eşleşen öğretmen yok"
              action={
                <Button
                  variant="secondary"
                  icon={<X className="size-4" />}
                  onClick={() => {
                    setQ('');
                    setBranchFilter('');
                  }}
                >
                  Filtreleri temizle
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
              {visible.map((t) => (
                <TeacherCard key={t.id} teacher={t} editable={editable} onEdit={() => openEdit(t)} onDelete={() => setDeleting(t)} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Ekle / düzenle */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Öğretmen ekle' : 'Öğretmeni düzenle'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Vazgeç
            </Button>
            {editing === 'new' && (
              <Button variant="secondary" disabled={saving} onClick={() => void submit(true)}>
                Kaydet ve yenisini ekle
              </Button>
            )}
            <Button loading={saving} onClick={() => void submit()}>
              Kaydet
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          <Field label="Ad soyad" error={form.errors.fullName}>
            {(id) => (
              <Input
                id={id}
                autoFocus
                value={form.values.fullName}
                maxLength={80}
                onChange={(e) => form.set('fullName', e.target.value)}
                placeholder="ör. Ayşe Demir"
                invalid={Boolean(form.errors.fullName)}
              />
            )}
          </Field>
          <Field label="Branş" error={form.errors.branchId}>
            {(id) => <OptionSelect id={id} kind="teacher-branches" options={sortedBranches} value={form.values.branchId} onChange={(v) => form.set('branchId', v)} />}
          </Field>
          <Field label="Ünvan" error={form.errors.titleId}>
            {(id) => <OptionSelect id={id} kind="teacher-titles" options={sortedTitles} value={form.values.titleId} onChange={(v) => form.set('titleId', v)} />}
          </Field>
          {editing !== 'new' && (
            <Toggle
              checked={form.values.isActive}
              onChange={(v) => form.set('isActive', v)}
              label="Aktif"
              description="Okuldan ayrılan öğretmeni silmek yerine pasifleştirirseniz geçmiş kayıtlar korunur; nöbet ve ders programı seçimlerinde görünmez."
            />
          )}
          {editing === 'new' &&
            all.some((t) => normalizeName(t.fullName) === normalizeName(form.values.fullName) && form.values.fullName.trim()) && (
              <Alert>Bu isimde bir öğretmen zaten kayıtlı.</Alert>
            )}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      {/* Tek öğretmeni silme onayı */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`${deleting?.fullName ?? ''} silinsin mi?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Sil
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Öğretmenin nöbet ve izin kayıtları da silinir; ders programında öğretmen alanı boşalır. Okuldan ayrılan öğretmenler için silmek yerine
          düzenleyip <strong>pasif</strong> yapabilirsiniz.
        </p>
      </Modal>

      <ImportDialog file={importFile} onClose={() => setImportFile(null)} />
      <OptionsManager open={managing} onClose={() => setManaging(false)} />
      <DeleteAllDialog open={deletingAll} onClose={() => setDeletingAll(false)} />
    </>
  );
}
