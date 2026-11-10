import { applyPersonRole, errorText, PERSON_ROLES, type EnrollRole, type PersonRole } from '@okulpano/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Check, Copy, Plus, X } from '../../components/icons.tsx';
import { Alert, Button, Input, Modal, Select } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { formatCode } from './dialogs.tsx';
import { Avatar } from './PersonCard.tsx';
import type { Person } from './people.ts';

type Method = 'invite' | 'code' | 'meeting' | 'password';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Row {
  /** Kadrodaki öğretmen; yoksa kadro dışı kişi */
  teacherId: string | null;
  key: string;
  fullName: string;
  sub: string;
  email: string;
  /** Kadrodaki e-posta (değişirse kadro kartına yazılır) */
  rosterEmail: string | null;
  role: Exclude<PersonRole, 'owner'>;
}

type Result = { key: string; fullName: string; email: string; state: 'emailed' | 'link' | 'existing' | 'password' | 'code' | 'error'; value?: string; error?: string };

const toEnroll = (r: Row['role']): EnrollRole => (r === 'admin' ? 'admin' : r === 'counselor' ? 'counselor' : 'teacher');

function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Tek "Hesap aç" penceresi: 1) kimler (kadrodan ya da kadro dışı) 2) nasıl giriş yapacaklar (e-posta daveti, giriş kodu,
 * toplantı QR'ı, geçici şifre) 3) rol (ünvandan önerilir). Görevler hesap açıldıktan sonra kişi kartından verilir.
 */
export function OpenAccountsDialog({
  open,
  initial,
  people,
  full,
  isOwner,
  mail,
  membersPath,
  enrollPath,
  onClose,
  onDone,
  onMeeting,
}: {
  open: boolean;
  initial: string[];
  people: Person[];
  full: boolean;
  isOwner: boolean;
  mail: boolean;
  membersPath: string;
  enrollPath: string;
  onClose: () => void;
  onDone: () => void;
  onMeeting: () => void;
}) {
  const candidates = people.filter((p) => p.roster && (p.status === 'none' || p.status === 'code'));
  const toRow = (p: Person): Row => ({
    teacherId: p.teacherId,
    key: p.key,
    fullName: p.fullName,
    sub: p.sub,
    email: p.email ?? '',
    rosterEmail: p.email,
    role: (full && (p.role !== 'admin' || isOwner) ? p.role : p.teacherId ? 'teacher' : 'staff') as Row['role'],
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [method, setMethod] = useState<Method>('invite');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [extName, setExtName] = useState('');
  const [extEmail, setExtEmail] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(candidates.filter((p) => initial.includes(p.key)).map(toRow));
    setMethod('invite');
    setResults(null);
    setExtName('');
    setExtEmail('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const external = rows.some((r) => !r.teacherId);
  const needsEmail = method === 'invite' || method === 'password';
  const emailOk = (r: Row) => EMAIL_RE.test(r.email.trim());
  const ready = method === 'code' ? rows.filter((r) => r.teacherId) : needsEmail ? rows.filter(emailOk) : [];
  const invalid = needsEmail && rows.some((r) => r.email.trim() && !emailOk(r));
  const set = (key: string, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const roleChoices = (r: Row): Row['role'][] => (full ? [r.teacherId ? 'teacher' : 'staff', 'counselor', ...(isOwner ? (['admin'] as const) : [])] : ['teacher']);

  const send = async () => {
    setBusy(true);
    const out: Result[] = [];
    for (const r of ready) {
      const email = r.email.trim().toLowerCase();
      try {
        if (method === 'code') {
          const res = await api<{ code: string }>(`${enrollPath}/code`, { method: 'POST', body: { teacherId: r.teacherId, role: toEnroll(r.role) } });
          out.push({ key: r.key, fullName: r.fullName, email, state: 'code', value: formatCode(res.code) });
        } else if (method === 'invite' && r.teacherId) {
          const res = await api<{ existingUser: boolean; emailed: boolean; inviteUrl: string | null }>(`${enrollPath}/invite`, {
            method: 'POST',
            body: { teacherId: r.teacherId, role: toEnroll(r.role), ...(email !== (r.rosterEmail ?? '').toLowerCase() ? { email } : {}) },
          });
          out.push({ key: r.key, fullName: r.fullName, email, state: res.existingUser ? 'existing' : res.emailed ? 'emailed' : 'link', value: res.inviteUrl ?? undefined });
        } else {
          // Kadro dışı kişi ya da geçici şifre: üyelik doğrudan açılır
          const password = method === 'password' ? tempPassword() : undefined;
          const res = await api<{ existingUser: boolean; invite?: { inviteUrl: string; emailed: boolean } | null }>(membersPath, {
            method: 'POST',
            body: { email, fullName: r.fullName, invite: method === 'invite', password, ...applyPersonRole(r.role, []), teacherId: r.teacherId },
          });
          out.push(
            res.existingUser
              ? { key: r.key, fullName: r.fullName, email, state: 'existing' }
              : res.invite
                ? { key: r.key, fullName: r.fullName, email, state: res.invite.emailed ? 'emailed' : 'link', value: res.invite.inviteUrl }
                : { key: r.key, fullName: r.fullName, email, state: 'password', value: password },
          );
        }
      } catch (err) {
        out.push({ key: r.key, fullName: r.fullName, email, state: 'error', error: errorText(err, 'açılamadı') });
      }
    }
    setBusy(false);
    setResults(out);
    onDone();
  };

  if (results) {
    const share = results.filter((r) => r.value && r.state !== 'emailed');
    const text = share
      .map((r) => (r.state === 'password' ? `${r.fullName}: ${location.origin}/admin/ · ${r.email} · şifre ${r.value}` : r.state === 'code' ? `${r.fullName}: giriş kodu ${r.value} (15 dakika geçerli)` : `${r.fullName}: ${r.value}`))
      .join('\n');
    const label: Record<Result['state'], string> = {
      emailed: 'Davet e-postayla gönderildi',
      link: 'E-posta gitmedi: bağlantıyı iletin',
      existing: 'Mevcut hesabıyla okula eklendi',
      password: 'Geçici şifre: güvenli bir yoldan iletin',
      code: 'Giriş kodu: 15 dakika geçerli, bir kez kullanılır',
      error: '',
    };
    return (
      <Modal open onClose={onClose} size="lg" title="Hesap açma sonucu" footer={<Button onClick={onClose}>Tamam</Button>}>
        <div className="space-y-3 text-sm">
          <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
            {results.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{r.fullName}</div>
                  {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
                </div>
                <span className={clsx('text-xs', r.state === 'error' ? 'text-red-700' : r.state === 'emailed' || r.state === 'existing' ? 'text-emerald-700' : 'text-amber-700')}>{r.error ?? label[r.state]}</span>
                {r.value && r.state !== 'emailed' && (
                  <div className={clsx('w-full rounded-lg bg-slate-50 px-3 py-2 font-mono break-all ring-1 ring-slate-200', r.state === 'code' ? 'text-center text-2xl font-extrabold tracking-[0.2em]' : 'text-xs')}>{r.value}</div>
                )}
              </div>
            ))}
          </div>
          {share.length > 0 && (
            <Button
              variant="secondary"
              icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => {
                void navigator.clipboard?.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Kopyalandı' : 'Hepsini kopyala'}
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  const methods: { key: Method; title: string; text: string; disabled?: string }[] = [
    { key: 'invite', title: 'E-posta daveti', text: 'Bağlantı gider, şifresini kendisi belirler. E-postası yoksa aşağıda yazılır.' },
    { key: 'code', title: 'Giriş kodu', text: 'Kişiye 8 haneli kod verilir; telefondan girer. E-posta gerekmez.', disabled: external ? 'Kadro dışı kişiye giriş kodu verilemez' : undefined },
    { key: 'meeting', title: 'Toplantı QR’ı', text: 'Toplantıda ekrana yansıtın; herkes kendi hesabını açar, siz onaylarsınız.' },
    ...(full ? [{ key: 'password' as const, title: 'Geçici şifre', text: 'Şifre üretilir, siz iletirsiniz; ilk girişte değiştirilir.' }] : []),
  ];
  const remaining = candidates.filter((p) => !rows.some((r) => r.key === p.key));

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={rows.length ? `Hesap aç · ${rows.length} kişi` : 'Hesap aç'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          {method === 'meeting' ? (
            <Button onClick={onMeeting}>Toplantı QR’ını aç</Button>
          ) : (
            <Button loading={busy} disabled={!ready.length || invalid} onClick={() => void send()}>
              {`${ready.length ? `${ready.length} ` : ''}${method === 'code' ? 'giriş kodu ver' : method === 'password' ? 'hesap aç' : 'davet gönder'}`.replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="text-sm font-semibold text-slate-700">1 · Nasıl giriş yapacaklar</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={Boolean(m.disabled)}
                onClick={() => setMethod(m.key)}
                title={m.disabled}
                className={clsx('rounded-2xl p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', method === m.key ? 'bg-slate-50 ring-2 ring-ink' : 'ring-1 ring-slate-200 enabled:hover:bg-slate-50')}
              >
                <div className="text-sm font-bold text-ink">
                  {method === m.key ? '● ' : '○ '}
                  {m.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">{m.disabled ?? m.text}</div>
              </button>
            ))}
          </div>
          {method === 'invite' && !mail && <div className="mt-2"><Alert tone="amber">E-posta gönderimi ayarlı değil: davetler oluşturulur, bağlantıları sonraki ekranda kopyalayıp iletirsiniz.</Alert></div>}
        </section>

        {method === 'meeting' ? (
          <Alert tone="blue">Toplantı QR’ı herkese açıktır: öğretmenler kadrodan adını seçer, hesaplar “Onay bekliyor” olarak düşer. Kişiler listesinde “Onay bekliyor” süzgecinden onaylarsınız.</Alert>
        ) : (
          <section>
            <div className="text-sm font-semibold text-slate-700">
              2 · Kimler <span className="font-normal text-slate-400">· rol ünvandan önerildi, değiştirebilirsiniz</span>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              {rows.map((r) => {
                const bad = needsEmail && r.email.trim() !== '' && !emailOk(r);
                const empty = needsEmail && !r.email.trim();
                return (
                  <div key={r.key} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_1.3fr_0.9fr_auto] sm:items-start sm:gap-3">
                    <div className="flex items-center gap-2 pt-0.5">
                      <Avatar name={r.fullName} className="size-8" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{r.fullName}</div>
                        <div className="truncate text-xs text-slate-500">{r.sub}</div>
                      </div>
                    </div>
                    {needsEmail ? (
                      <div>
                        <Input type="email" value={r.email} invalid={bad || empty} onChange={(e) => set(r.key, { email: e.target.value })} placeholder="e-posta yazın" aria-label={`${r.fullName} e-posta`} />
                        <div className={clsx('mt-0.5 text-xs', bad || empty ? 'text-amber-700' : 'text-slate-400')}>
                          {bad ? 'E-posta geçersiz' : empty ? (r.teacherId ? 'Kadroda yok · yazınca karta kaydedilir' : 'E-posta gerekli') : r.teacherId && r.email.trim().toLowerCase() !== (r.rosterEmail ?? '').toLowerCase() ? 'Kadro kartına kaydedilecek' : r.teacherId ? 'kadrodan' : 'kadro dışı'}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 text-xs text-slate-500">{r.teacherId ? 'E-posta gerekmez' : 'Kadro dışı: giriş kodu verilemez'}</div>
                    )}
                    <Select value={r.role} onChange={(e) => set(r.key, { role: e.target.value as Row['role'] })} aria-label={`${r.fullName} rol`} disabled={roleChoices(r).length < 2}>
                      {roleChoices(r).map((k) => (
                        <option key={k} value={k}>
                          {PERSON_ROLES[k].label}
                        </option>
                      ))}
                    </Select>
                    <button type="button" aria-label={`${r.fullName} çıkar`} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="mt-1.5 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-ink">
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
              {!rows.length && <p className="py-3 text-sm text-slate-500">Aşağıdan kadrodan kişi ekleyin{full ? ' ya da kadro dışı bir kişi yazın' : ''}.</p>}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Select
                value=""
                onChange={(e) => {
                  const p = candidates.find((x) => x.key === e.target.value);
                  if (p) setRows((x) => [...x, toRow(p)]);
                }}
                aria-label="Kadrodan ekle"
              >
                <option value="">＋ Kadrodan ekle ({remaining.length} kişinin hesabı yok)</option>
                {remaining.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
              {full && method !== 'code' && (
                <div className="flex gap-2">
                  <Input value={extName} onChange={(e) => setExtName(e.target.value)} placeholder="Kadro dışı: ad soyad" aria-label="Kadro dışı kişi adı" />
                  <Input type="email" value={extEmail} onChange={(e) => setExtEmail(e.target.value)} placeholder="e-posta" aria-label="Kadro dışı kişi e-postası" />
                  <Button
                    variant="secondary"
                    icon={<Plus className="size-4" />}
                    disabled={extName.trim().length < 2}
                    onClick={() => {
                      setRows((x) => [...x, { teacherId: null, key: `x:${Date.now()}`, fullName: extName.trim(), sub: 'Kadro dışı', email: extEmail.trim(), rosterEmail: null, role: 'staff' }]);
                      setExtName('');
                      setExtEmail('');
                    }}
                  >
                    Ekle
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Görevler (duyurular, nöbet…) hesap açıldıktan sonra kişi kartından verilir. E-posta başka bir okulda kayıtlıysa kişi bu okula eklenir ve kendi şifresiyle girer.
            </p>
          </section>
        )}
      </div>
    </Modal>
  );
}
