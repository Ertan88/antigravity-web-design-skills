import { compareClassNames, parseClassName } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Field, Input, Modal, Select, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchoolPath, type ClassGroup } from '../lib/data.ts';

interface Technical {
  classIds: string[];
  start: string | null;
  end: string | null;
}
interface InternshipSettings {
  internshipManagerUserId: string | null;
  internshipProgramName: string;
  internshipTechnical: Technical;
  canPickManager: boolean;
}

/**
 * Mesleki eğitim ayarları (İşletmeler › Ayarlar): koordinatör müdür yardımcısı, günlük formdaki program adı ve teknik
 * program stajı tek pencerede. Genel Ayarlar'da yalnızca modülün açılıp kapandığı anahtar kalır.
 */
export function InternshipSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('internship');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: [schoolId, 'internship', 'settings'], queryFn: () => api<InternshipSettings>(`${path}/settings`), enabled: open });
  const candidates = useQuery({
    queryKey: [schoolId, 'internship', 'manager-candidates'],
    queryFn: () => api<{ userId: string; fullName: string }[]>(`${path}/manager-candidates`),
    enabled: open,
  });
  const classes = useList<ClassGroup>('classes');
  const [v, setV] = useState<Omit<InternshipSettings, 'canPickManager'> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && q.data) setV({ internshipManagerUserId: q.data.internshipManagerUserId, internshipProgramName: q.data.internshipProgramName, internshipTechnical: q.data.internshipTechnical });
    if (!open) setV(null);
  }, [open, q.data]);

  const tech = v?.internshipTechnical;
  const badRange = Boolean(tech?.start && tech?.end && tech.start > tech.end);
  // Teknik program stajı Anadolu Teknik Programı (ATP) sınıfları içindir; AMP (Anadolu Meslek Programı) sınıfları
  // işletmede haftalık mesleki eğitim görür, listelenmez. Daha önce seçilmiş başka bir sınıf varsa kaybolmasın diye görünür.
  const list = [...(classes.data ?? [])]
    .filter((c) => parseClassName(c.name)?.program === 'ATP' || tech?.classIds.includes(c.id))
    .sort((a, b) => compareClassNames(a.name, b.name));
  const toggle = (id: string) =>
    v && tech && setV({ ...v, internshipTechnical: { ...tech, classIds: tech.classIds.includes(id) ? tech.classIds.filter((x) => x !== id) : [...tech.classIds, id] } });
  const people = candidates.data ?? [];

  const save = async () => {
    if (!v || badRange) return;
    setBusy(true);
    try {
      await api(`${path}/settings`, {
        method: 'PUT',
        body: {
          ...(q.data?.canPickManager ? { internshipManagerUserId: v.internshipManagerUserId } : {}),
          internshipProgramName: v.internshipProgramName,
          internshipTechnical: v.internshipTechnical,
        },
      });
      await qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === schoolId && (x.queryKey[1] === 'internship' || x.queryKey[1] === 'school') });
      toast.success('Mesleki eğitim ayarları kaydedildi');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Mesleki eğitim ayarları"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!v || badRange} onClick={() => void save()}>
            Kaydet
          </Button>
        </>
      }
    >
      {!v || !tech ? (
        q.error ? <Alert tone="red">{q.error.message}</Alert> : <Spinner />
      ) : (
        <div className="grid gap-5">
          <Field
            label="Koordinatör müdür yardımcısı"
            help="Bütün işletmeleri ve öğrencileri görür, koordinatör öğretmenleri işaretler; devamsızlık (D) ve rapor (R) bildirimlerini alır."
          >
            {(id) => (
              <Select
                id={id}
                value={v.internshipManagerUserId ?? ''}
                disabled={!q.data?.canPickManager}
                onChange={(e) => setV({ ...v, internshipManagerUserId: e.target.value || null })}
                className="max-w-sm"
              >
                <option value="">Seçilmedi</option>
                {v.internshipManagerUserId && !people.some((u) => u.userId === v.internshipManagerUserId) && <option value={v.internshipManagerUserId}>Seçili kişi</option>}
                {people.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {!q.data?.canPickManager && <p className="-mt-3 text-xs text-slate-500">Bu seçimi okul müdürü ve “Mesleki eğitimi yönetir” yetkisi verilenler değiştirebilir.</p>}
          <Field label="Program adı" help="Günlük rehberlik formunda okul adının yanına yazılır (ör. Anadolu Meslek Programı). Boş bırakılırsa yazılmaz.">
            {(id) => <Input id={id} value={v.internshipProgramName} maxLength={80} onChange={(e) => setV({ ...v, internshipProgramName: e.target.value })} />}
          </Field>

          <div className="grid gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
            <div>
              <p className="text-sm font-bold text-ink">Teknik program stajı</p>
              <p className="text-xs text-slate-500">
                Anadolu Teknik Programı (ATP) sınıfları listelenir. Seçilen sınıflar staj tarihleri arasında her iş günü işletmededir; bu günlerde devam çizelgesinde okul günü olmaz. Tarihlerin dışında ders programı geçerlidir.
              </p>
            </div>
            {classes.isLoading ? (
              <Spinner />
            ) : !list.length ? (
              <p className="text-sm text-slate-500">Okulda Anadolu Teknik Programı (ATP) sınıfı yok. Sınıf adları e-Okul'daki gibi "ATP 12-A" biçiminde olmalıdır.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Teknik program sınıfları">
                {list.map((c) => {
                  const on = tech.classIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(c.id)}
                      className={clsx(
                        'min-h-9 rounded-full px-3 text-sm font-semibold ring-1 transition',
                        on ? 'bg-ink text-surface ring-ink' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300 dark:bg-white/5 dark:text-slate-200 dark:ring-white/15',
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Staj başlangıcı">
                {(id) => <Input id={id} type="date" value={tech.start ?? ''} onChange={(e) => setV({ ...v, internshipTechnical: { ...tech, start: e.target.value || null } })} />}
              </Field>
              <Field label="Staj bitişi">
                {(id) => <Input id={id} type="date" value={tech.end ?? ''} onChange={(e) => setV({ ...v, internshipTechnical: { ...tech, end: e.target.value || null } })} />}
              </Field>
            </div>
            {badRange && <Alert tone="amber">Bitiş tarihi başlangıçtan önce olamaz.</Alert>}
            {tech.classIds.length > 0 && (!tech.start || !tech.end) && <Alert tone="amber">Staj tarihleri girilmedi. Bu sınıflar tarihler girilene kadar ders programına göre sayılır.</Alert>}
          </div>
        </div>
      )}
    </Modal>
  );
}
