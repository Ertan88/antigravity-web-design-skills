import { HoldButton, typedOk } from '../../components/confirm.tsx';
import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Button, Field, Input, Modal } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

export type ClearScope = { scope: 'all' } | { scope: 'class' | 'teacher'; id: string; name: string };


/** Bir sınıfın, bir öğretmenin ya da okulun bütün ders programını silme onayı */
export function ClearDialog({ target, count, onClose }: { target: ClearScope | null; count: number; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('timetable');
  const qc = useQueryClient();
  const toast = useToast();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setWord('');
    setError(null);
    onClose();
  };

  const run = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const body = target.scope === 'all' ? { scope: 'all', confirm: 'delete-all' } : { scope: target.scope, id: target.id };
      const res = await api<{ deleted: number }>(`${path}/clear`, { method: 'POST', body });
      await qc.invalidateQueries({ queryKey: [schoolId, 'timetable'] });
      toast.success(`${res.deleted} ders saati silindi`);
      close();
    } catch (err) {
      setError(errorText(err, 'Silinemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const all = target?.scope === 'all';
  const title = !target
    ? ''
    : target.scope === 'all'
      ? 'Okulun bütün ders programını sil'
      : target.scope === 'class'
        ? `${target.name} sınıfının programını sil`
        : `${target.name} adlı öğretmenin derslerini sil`;

  return (
    <Modal
      open={Boolean(target)}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Vazgeç
          </Button>
          {/* Toplu silme (KURALLAR 3.5): basılı tut; bütün programda önce ders saati sayısı yazılır */}
          <HoldButton
            label={busy ? 'Siliniyor…' : count ? `${count} ders saatini silmek için basılı tutun` : 'Silinecek ders yok'}
            tone="danger"
            disabled={busy || !count || (all && !typedOk(word, String(count)))}
            onDone={() => void run()}
          />
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Alert tone="red">{error}</Alert>}
        <Alert tone="red">
          {target?.scope === 'all' ? (
            <>
              Okuldaki bütün sınıfların ders programı (<strong>{count}</strong> ders saati) silinecek. Bu işlem geri alınamaz.
            </>
          ) : target?.scope === 'class' ? (
            <>
              <strong>{target.name}</strong> sınıfının haftalık programındaki <strong>{count}</strong> ders saati silinecek. Bu işlem geri alınamaz.
            </>
          ) : target ? (
            <>
              <strong>{target.name}</strong> adlı öğretmenin girdiği <strong>{count}</strong> ders saati bütün sınıfların programından silinecek. Bu işlem geri
              alınamaz.
            </>
          ) : null}
        </Alert>
        <p className="text-slate-600">Sınıflar, öğretmenler ve zil saatleri silinmez. Programı e-Okul PDF'ini yeniden yükleyerek geri getirebilirsiniz.</p>
        {all && (
          <Field label={`Onaylamak için silinecek ders saati sayısını yazın: ${count}`}>
            {(id) => <Input id={id} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" inputMode="numeric" placeholder={String(count)} />}
          </Field>
        )}
      </div>
    </Modal>
  );
}
