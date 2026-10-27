import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eraser, FilePlus2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../lib/data.ts';
import { useToast } from './Toast.tsx';
import { Button, Card, Modal } from './ui.tsx';

/** Okul verisini değiştiren işlemlerden sonra bütün okul sorgularını tazeler */
function useApplySchool() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return (data: School) => {
    qc.setQueryData([schoolId, 'school'], data);
    void qc.invalidateQueries({ queryKey: [schoolId], predicate: (q) => q.queryKey[1] !== 'school' });
  };
}

/**
 * Yeni okulun ilk girişinde sorulur: panel örnek öğretmen, ders programı, nöbet ve duyurularla mı dolsun,
 * yoksa boş mu başlansın. Yalnızca ayarları yönetebilen okul kullanıcısına (platform yöneticisine değil) gösterilir.
 */
export function WelcomeDialog() {
  const { me, can } = useAuth();
  const school = useSchool();
  const path = useSchoolPath('onboarding');
  const toast = useToast();
  const apply = useApplySchool();
  const [later, setLater] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const answer = useMutation({
    mutationFn: (sample: boolean) => api<School>(path, { method: 'POST', body: { sample } }),
    onSuccess: (data, sample) => {
      apply(data);
      toast.success(sample ? 'Örnek veriler eklendi. Ayarlar sayfasından tek tıkla temizleyebilirsiniz.' : 'Boş bir panelle başladınız.');
    },
    onError: (e) => toast.error(e.message),
  });
  if (later || !school.data || school.data.onboarding !== 'pending' || me?.user.isSuperAdmin || !can('settings.manage')) return null;

  const pick = (sample: boolean) => {
    setChoice(sample);
    answer.mutate(sample);
  };
  const options = [
    {
      sample: true,
      icon: <Sparkles className="size-5" />,
      title: 'Örnek verilerle başla',
      text: 'Öğretmen, sınıf, ders programı, nöbet çizelgesi, sınav ve duyurular eklenir; panonun nasıl görüneceğini hemen görürsünüz.',
    },
    {
      sample: false,
      icon: <FilePlus2 className="size-5" />,
      title: 'Boş başla',
      text: 'Kendi öğretmenlerinizi ve programınızı elle ya da Excel ile yüklersiniz.',
    },
  ];
  return (
    <Modal
      open
      onClose={() => setLater(true)}
      title={`Hoş geldiniz, ${school.data.name}`}
      description="Panelinize örnek verilerle mi başlamak istersiniz?"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={String(o.sample)}
            type="button"
            disabled={answer.isPending}
            onClick={() => pick(o.sample)}
            className={clsx(
              'flex flex-col gap-2 rounded-2xl p-4 text-left ring-1 transition-all disabled:opacity-60',
              o.sample ? 'bg-brand-50 ring-brand-200 hover:ring-brand-400' : 'bg-surface ring-slate-200 hover:ring-slate-300',
            )}
          >
            <span className={clsx('flex items-center gap-2 font-semibold', o.sample ? 'text-brand-800' : 'text-ink')}>
              {o.icon}
              {answer.isPending && choice === o.sample ? 'Hazırlanıyor…' : o.title}
            </span>
            <span className="text-sm text-slate-600">{o.text}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Örnek veriler gerçek kişilere ait değildir. Denedikten sonra <strong>Genel Ayarlar</strong> sayfasından tek tıkla silinir; sizin eklediğiniz
        kayıtlar kalır.
      </p>
    </Modal>
  );
}

/** Genel Ayarlar: örnek verileri silme kartı (yalnızca örnek veri varken görünür) */
export function SampleDataCard() {
  const school = useSchool();
  const path = useSchoolPath('sample-data/clear');
  const toast = useToast();
  const apply = useApplySchool();
  const [confirm, setConfirm] = useState(false);
  const clear = useMutation({
    mutationFn: () => api<School>(path, { method: 'POST' }),
    onSuccess: (data) => {
      apply(data);
      setConfirm(false);
      toast.success('Örnek veriler silindi');
    },
    onError: (e) => toast.error(e.message),
  });
  if (!school.data?.hasSampleData) return null;
  return (
    <Card className="mt-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div>
        <h2 className="font-semibold">Örnek veriler</h2>
        <p className="mt-1 text-sm text-slate-500">
          Başlangıçta eklenen örnek öğretmen, sınıf, ders programı, nöbet, sınav ve duyurular. Silince yalnızca bunlar kalkar; sizin eklediğiniz kayıtlar
          kalır.
        </p>
      </div>
      <Button variant="danger" icon={<Eraser className="size-4" />} onClick={() => setConfirm(true)}>
        Örnek verileri temizle
      </Button>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Örnek veriler silinsin mi?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>
              Sil
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Örnek öğretmenlere bağlı nöbet ve ders programı kayıtları da silinir. Örnek zil çizelgesini kendinize göre düzenlediyseniz o da silinir.
        </p>
      </Modal>
    </Card>
  );
}
