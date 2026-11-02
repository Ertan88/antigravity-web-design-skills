import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Modal, Spinner, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface Entry {
  weekday: number;
  periodNo: number;
  subject: string;
  teachers: string[];
  group: string | null;
}
interface Preview {
  pages: number;
  failedPages: number[];
  stats: { classes: number; lessons: number; split: number; electives: number; noTeacher: number; grouped: number };
  classes: { name: string; program: string; field: string; groups: string[]; lessons: number; existing: boolean; special: boolean; entries: Entry[] }[];
  teachers: { name: string; displayName: string; lessons: number; match: { id: string; fullName: string } | null }[];
  bell: { schedule: string | null; mismatches: { no: number; pdf: string; school: string | null }[] };
  /** e-Okul'daki ders saatleri: saatleri aynı sınıflar bir zil */
  bells: { periods: { no: number; start: string; end: string }[]; classNames: string[] }[];
}

/**
 * e-Okul'dan indirilen "haftalık ders programı çizelgesi" PDF'i: önce okunup gösterilir (hiçbir şey yazılmaz),
 * onaylanınca okulun bütün ders programı bununla değiştirilir.
 */
export function EokulImport({ file, onClose }: { file: File | null; onClose: () => void }) {
  const path = useSchoolPath('timetable/import/eokul');
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [createTeachers, setCreateTeachers] = useState(true);
  const [useBells, setUseBells] = useState(true);
  const [exemptSpecial, setExemptSpecial] = useState(true);

  const preview = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.append('file', f);
      return api<Preview>(`${path}/preview`, { method: 'POST', form });
    },
  });
  const apply = useMutation({
    mutationFn: (p: Preview) =>
      api<{ classesCreated: number; teachersCreated: number; entries: number; bellsUpdated: number }>(`${path}/apply`, {
        method: 'POST',
        body: {
          createTeachers,
          classes: p.classes.map((c) => ({ name: c.name, entries: c.entries })),
          bells: useBells ? p.bells : [],
          exemptClasses: exemptSpecial ? p.classes.filter((c) => c.special).map((c) => c.name) : [],
        },
      }),
    onSuccess: (r) => {
      for (const key of ['timetable', 'classes', 'teachers', 'bell-schedules']) void qc.invalidateQueries({ queryKey: [schoolId, key] });
      toast.success(
        `Ders programı yüklendi: ${r.entries} ders saati${r.classesCreated ? `, ${r.classesCreated} yeni sınıf` : ''}${r.teachersCreated ? `, ${r.teachersCreated} yeni öğretmen` : ''}`,
      );
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (file) preview.mutate(file);
    else preview.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const p = preview.data;
  const unmatched = p?.teachers.filter((t) => !t.match) ?? [];
  const newClasses = p?.classes.filter((c) => !c.existing) ?? [];
  const special = p?.classes.filter((c) => c.special) ?? [];

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size="xl"
      title="e-Okul ders programı"
      description={file?.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={apply.isPending} disabled={!p} onClick={() => p && apply.mutate(p)}>
            Programı yükle
          </Button>
        </>
      }
    >
      {preview.isPending ? (
        <div className="py-10">
          <Spinner />
          <p className="mt-3 text-center text-sm text-slate-500">PDF okunuyor…</p>
        </div>
      ) : preview.error ? (
        <Alert tone="red">{preview.error.message}</Alert>
      ) : p ? (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(
              [
                ['Sınıf', p.stats.classes, 'bg-tile-sky text-tile-sky-ink'],
                ['Ders saati', p.stats.lessons, 'bg-tile-mint text-tile-mint-ink'],
                ['Öğretmen', p.teachers.length, 'bg-tile-sun text-tile-sun-ink'],
                ['Bölünmüş ders', p.stats.split, 'bg-tile-lilac text-tile-lilac-ink'],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className={`rounded-2xl p-4 ${cls}`}>
                <div className="text-xs font-bold opacity-80">{label}</div>
                <div className="text-2xl font-extrabold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <p className="text-slate-500">
            {p.pages} sayfa okundu. {p.stats.electives} seçmeli ders saati kendi adıyla, {p.stats.noTeacher} ders saati öğretmensiz yazılacak
            {p.stats.grouped ? `; dallara ayrılan şubelerde ${p.stats.grouped} ders saati dal adıyla` : ''}.
          </p>
          {p.failedPages.length > 0 && <Alert tone="amber">Okunamayan sayfalar: {p.failedPages.join(', ')}. Bu sayfalar yüklenmeyecek.</Alert>}
          <div>
            <div className="mb-2 font-bold">Zil saatleri</div>
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              {p.bells.map((b, i) => (
                <div key={i} className="text-sm">
                  <span className="font-semibold text-ink">
                    {p.bells.length > 1 ? (i === 0 ? 'Sabahçı' : 'Öğlenci') : "e-Okul saatleri"} · {b.periods.length} ders saati · {b.periods[0]?.start}–{b.periods[b.periods.length - 1]?.end}
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    · {p.bells.length > 1 ? b.classNames.join(', ') : 'bütün sınıflar'}
                  </span>
                </div>
              ))}
              <Toggle
                checked={useBells}
                onChange={setUseBells}
                label="Zil düzenini e-Okul saatlerinden oluştur"
                description={
                  p.bells.length > 1
                    ? "İki farklı saat düzeni var: ikili öğretim açılır, erken başlayan sınıflar sabahçı, diğerleri öğlenci olur. Her vardiyada en sık görülen ders sayısı için düzen yazılır; diğer ders sayıları için Zil Saatleri sayfasında düzen önerilir."
                    : "En sık görülen günlük ders sayısı için düzen (ör. \"9 derslik gün\") e-Okul saatleriyle yazılır. Programdaki diğer ders sayıları (ör. 10, 11 dersli günler) için Zil Saatleri sayfasında düzen önerilir; teneffüs ve öğle arasını orada okulunuza göre ayarlarsınız."
                }
              />
            </div>
          </div>

          {special.length > 0 && (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <Toggle
                checked={exemptSpecial}
                onChange={setExemptSpecial}
                label={`Özel eğitim sınıflarını zil hesabına katma (${special.length})`}
                description={`${special.map((c) => c.name).join(', ')}. Genel zili izlerler; panodaki zil seçimine, "Şu an derste" listesine ve öğretmen çakışma denetimine girmezler. Sonra Zil Saatleri sayfasından değiştirilebilir.`}
              />
            </div>
          )}

          <div>
            <div className="mb-2 font-bold">
              Sınıflar {newClasses.length > 0 && <span className="font-medium text-slate-500">· {newClasses.length} yeni sınıf eklenecek</span>}
            </div>
            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
              {p.classes.map((c) => (
                <span
                  key={c.name}
                  title={`${c.field}${c.groups.length ? ` · ${c.groups.join(', ')}` : ''}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  {c.name}
                  {c.groups.length > 0 && <span className="text-slate-500">· {c.groups.length} dal</span>}
                  {!c.existing && <Badge tone="green">yeni</Badge>}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 font-bold">
              Öğretmenler · {p.teachers.length - unmatched.length} kadroda{unmatched.length > 0 && `, ${unmatched.length} kadroda yok`}
            </div>
            {unmatched.length > 0 ? (
              <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap gap-1.5">
                  {unmatched.map((t) => (
                    <span key={t.name} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold ring-1 ring-slate-200">
                      {t.displayName} <span className="text-slate-400">· {t.lessons} ders</span>
                    </span>
                  ))}
                </div>
                <Toggle
                  checked={createTeachers}
                  onChange={setCreateTeachers}
                  label="Kadroda olmayan öğretmenleri ekle"
                  description="Kapalıysa bu öğretmenlerin dersleri öğretmensiz yazılır; kadroya sonra ekleyip hücreden seçebilirsiniz."
                />
              </div>
            ) : (
              <p className="text-slate-500">Bütün öğretmenler kadroda; adlarına göre eşleştirildi.</p>
            )}
          </div>

          <Alert tone="amber">Okulun mevcut ders programının tamamı silinip bu PDF'teki programla değiştirilir.</Alert>
        </div>
      ) : null}
    </Modal>
  );
}
