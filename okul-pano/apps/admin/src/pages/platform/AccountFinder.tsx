import clsx from 'clsx';
import { useState } from 'react';
import { confirm } from '../../components/confirm.tsx';
import { KeyRound, Search, Trash2 } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Button, Input, Modal } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { formatDate, timeAgo } from '../../lib/format.ts';
import { CredentialsDialog, type Credentials } from '../users/Credentials.tsx';

interface Account {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  invitePending: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** soleOwner: okulun tek müdürü (silinirse okul müdürsüz kalır) */
  memberships: { schoolId: string; schoolName: string; role: 'owner' | 'admin' | 'editor'; soleOwner: boolean }[];
}

const ROLE: Record<Account['memberships'][number]['role'], string> = { owner: 'Okul müdürü', admin: 'Yönetici', editor: 'Editör' };
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .join('');

/**
 * Platform yöneticisi: hesabı tam e-postayla bulur (toplu liste yok, KVKK). Okul müdürü olmayan hesabı siler ya da yeni
 * şifre verir. Okul listesinde görünmeyen hesaplar (örnek kurulum, okulsuz kalan) için.
 */
export function AccountFinderDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'find' | 'delete' | 'password' | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const close = () => {
    setEmail('');
    setAccount(null);
    setError(null);
    onClose();
  };

  const find = async () => {
    if (!email.trim()) return;
    setBusy('find');
    setError(null);
    setAccount(null);
    try {
      setAccount(await api<Account>(`/api/platform/accounts?email=${encodeURIComponent(email.trim())}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const owned = account?.memberships.filter((m) => m.soleOwner) ?? [];
  const blocked = !account || account.isSuperAdmin || owned.length > 0;

  const remove = async () => {
    if (!account) return;
    const ok = await confirm({
      title: 'Hesap silinsin mi?',
      message: `${account.fullName} · ${account.email}`,
      effects: [
        ...account.memberships.map((m) => ({ text: `${m.schoolName} okulundaki ${ROLE[m.role].toLocaleLowerCase('tr-TR')} kaydı kalkar` })),
        { text: 'Bu e-posta ve şifreyle giriş yapılamaz; oturumları kapanır' },
        { text: 'Okulların verileri (çizelgeler, duyurular, kayıtlar) olduğu gibi kalır', ok: true },
      ],
      confirmLabel: 'Sil',
      tone: 'danger',
      hold: true,
      holdLabel: 'Silmek için basılı tutun',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api(`/api/platform/accounts/${account.id}`, { method: 'DELETE' });
      toast.success(`${account.email} hesabı silindi`);
      setAccount(null);
      setEmail('');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const newPassword = async () => {
    if (!account) return;
    const ok = await confirm({
      title: 'Yeni şifre verilsin mi?',
      message: `${account.fullName} için yeni geçici şifre üretilir; açık oturumları kapanır.`,
      confirmLabel: 'Yeni şifre ver',
    });
    if (!ok) return;
    setBusy('password');
    try {
      setCredentials(await api<Credentials>(`/api/platform/accounts/${account.id}/password`, { method: 'POST', body: {} }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title="Hesap bul"
        description="Okullarda görünmeyen ya da örnek kurulumdan kalan hesaplar"
        footer={
          <Button variant="secondary" onClick={close}>
            Kapat
          </Button>
        }
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <Input type="email" className="flex-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@okul.k12.tr" aria-label="E-posta" autoFocus />
          <Button type="submit" icon={<Search className="size-4" />} loading={busy === 'find'} disabled={!email.trim()}>
            Bul
          </Button>
        </form>

        {error && (
          <div className="mt-4">
            <Alert tone="red">{error}</Alert>
          </div>
        )}

        {account && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-800">{initials(account.fullName)}</div>
              <div className="min-w-0">
                <div className="font-bold text-ink">{account.fullName}</div>
                <div className="text-sm text-slate-500">
                  {account.email} · {account.invitePending ? 'davet bekliyor' : account.lastLoginAt ? `son giriş ${timeAgo(account.lastLoginAt)}` : 'hiç giriş yapmadı'} · hesap açılışı {formatDate(account.createdAt.slice(0, 10))}
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm font-semibold text-slate-700">Kayıtlı olduğu okullar</div>
            <div className="mt-2 grid gap-2">
              {account.memberships.length ? (
                account.memberships.map((m) => (
                  <div key={m.schoolId} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-slate-200">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{m.schoolName}</div>
                      {m.role === 'owner' && (
                        <div className="text-xs text-slate-500">{m.soleOwner ? 'Okulun tek müdürü: önce müdürlük devredilmeli' : 'Okulda başka bir müdür kaydı da var; bu hesap silinebilir'}</div>
                      )}
                    </div>
                    <span className={clsx('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', m.role === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>{ROLE[m.role]}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">Hiçbir okula bağlı değil.</div>
              )}
            </div>

            {account.isSuperAdmin ? (
              <div className="mt-4">
                <Alert tone="blue">Bu bir platform yöneticisi hesabı; buradan silinemez.</Alert>
              </div>
            ) : (
              owned.length > 0 && (
                <div className="mt-4">
                  <Alert tone="amber">
                    Bu kişi okul müdürü. Hesap silinirse okul müdürsüz kalır; önce okul listesinden <strong>Müdürü değiştir</strong> ile devredin.
                  </Alert>
                </div>
              )
            )}

            {!account.isSuperAdmin && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="delete" icon={<Trash2 className="size-4" />} disabled={blocked} loading={busy === 'delete'} onClick={() => void remove()}>
                  Hesabı sil
                </Button>
                <Button variant="secondary" icon={<KeyRound className="size-4" />} loading={busy === 'password'} onClick={() => void newPassword()}>
                  Yeni şifre ver
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">Yalnızca tam e-posta ile aranır; hesaplar listelenmez (KVKK). Silme ve şifre işlemleri okulun kayıt geçmişine yazılır.</p>
          </div>
        )}
      </Modal>
      <CredentialsDialog value={credentials} onClose={() => setCredentials(null)} />
    </>
  );
}
