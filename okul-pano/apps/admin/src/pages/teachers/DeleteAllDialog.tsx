import { HoldButton, typedOk } from '../../components/confirm.tsx';
import { errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Button, Field, Input, Modal } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface Usage {
  teachers: number;
  duties: number;
  leaves: number;
  timetable: number;
}


export function DeleteAllDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('teachers');
  const qc = useQueryClient();
  const toast = useToast();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usage = useQuery({
    queryKey: [schoolId, 'teachers', 'usage'],
    queryFn: () => api<Usage>(`${path}/usage`),
    enabled: open,
    staleTime: 0,
  });
  const u = usage.data;

  const close = () => {
    setWord('');
    setError(null);
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ deleted: number }>(`${path}/delete-all`, { method: 'POST', body: { confirm: 'delete-all' } });
      await qc.invalidateQueries({ queryKey: [schoolId] });
      toast.success(`${res.deleted} öğretmen silindi`);
      close();
    } catch (err) {
      setError(errorText(err, 'Silinemedi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Tüm öğretmenleri sil"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Vazgeç
          </Button>
          {/* En ağır işlem (KURALLAR 3.5): önce silinecek sayıyı yazmak, sonra basılı tutmak */}
          <HoldButton
            label={busy ? 'Siliniyor…' : u ? `${u.teachers} öğretmeni silmek için basılı tutun` : 'Silmek için basılı tutun'}
            tone="danger"
            disabled={busy || !u?.teachers || !typedOk(word, String(u.teachers))}
            onDone={() => void run()}
          />
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Alert tone="red">{error}</Alert>}
        <Alert tone="red">
          Bu işlem geri alınamaz. Öğretmenlerle birlikte bağlı kayıtlar da etkilenir:
          {u && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              <li>
                <strong>{u.teachers}</strong> öğretmen silinecek
              </li>
              {u.duties > 0 && (
                <li>
                  Nöbet çizelgesindeki <strong>{u.duties}</strong> kayıt silinecek
                </li>
              )}
              {u.leaves > 0 && (
                <li>
                  <strong>{u.leaves}</strong> izin kaydı silinecek
                </li>
              )}
              {u.timetable > 0 && (
                <li>
                  Ders programındaki <strong>{u.timetable}</strong> dersin öğretmen alanı boşalacak
                </li>
              )}
            </ul>
          )}
        </Alert>
        <p className="text-slate-600">Branş ve görev listeleri silinmez. Önce "Excel'e aktar" ile yedek almanızı öneririz.</p>
        <Field label={`Onaylamak için silinecek öğretmen sayısını yazın: ${u?.teachers ?? ''}`}>
          {(id) => <Input id={id} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" inputMode="numeric" placeholder={String(u?.teachers ?? '')} />}
        </Field>
      </div>
    </Modal>
  );
}
