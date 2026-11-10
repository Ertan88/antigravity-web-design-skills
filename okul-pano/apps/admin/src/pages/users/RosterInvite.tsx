import { ENROLL_ROLES, errorText, type EnrollRole } from '@okulpano/shared';
import { useEffect, useState } from 'react';
import { Check, Copy } from '../../components/icons.tsx';
import { Alert, Button, Input, Modal, Select } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';

export interface InviteRow {
  teacherId: string;
  fullName: string;
  sub: string;
  email: string | null;
  role: EnrollRole;
}

type Result = { teacherId: string; fullName: string; email: string; state: 'emailed' | 'link' | 'existing' | 'error'; inviteUrl?: string; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Kadrodan seçilen öğretmenlere toplu davet. Kadroda e-postası olmayanın e-postası burada yazılır ve kadro kartına
 * kaydedilir; her kişinin rolü ayrı seçilir. E-posta gönderilemezse davet bağlantıları listelenir (kopyalanıp iletilir).
 */
export function RosterInviteDialog({
  rows,
  onClose,
  onDone,
  enrollPath,
  full,
  isOwner,
  mail,
}: {
  rows: InviteRow[] | null;
  onClose: () => void;
  onDone: () => void;
  enrollPath: string;
  /** Rol seçilebilir mi (dar yetkide yalnızca Öğretmen) */
  full: boolean;
  isOwner: boolean;
  /** Sunucuda e-posta gönderimi ayarlı mı */
  mail: boolean;
}) {
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, EnrollRole>>({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!rows) return;
    setEmails(Object.fromEntries(rows.map((r) => [r.teacherId, r.email ?? ''])));
    setRoles(Object.fromEntries(rows.map((r) => [r.teacherId, r.role])));
    setResults(null);
  }, [rows]);

  if (!rows) return null;
  const emailOf = (id: string) => (emails[id] ?? '').trim();
  const missing = rows.filter((r) => !emailOf(r.teacherId));
  const invalid = rows.filter((r) => emailOf(r.teacherId) && !EMAIL_RE.test(emailOf(r.teacherId)));
  const ready = rows.filter((r) => EMAIL_RE.test(emailOf(r.teacherId)));

  const send = async () => {
    setBusy(true);
    const out: Result[] = [];
    for (const r of ready) {
      const email = emailOf(r.teacherId).toLowerCase();
      try {
        const res = await api<{ existingUser: boolean; emailed: boolean; inviteUrl: string | null }>(`${enrollPath}/invite`, {
          method: 'POST',
          body: { teacherId: r.teacherId, role: full ? roles[r.teacherId] : 'teacher', ...(email !== (r.email ?? '').toLowerCase() ? { email } : {}) },
        });
        out.push({ teacherId: r.teacherId, fullName: r.fullName, email, state: res.existingUser ? 'existing' : res.emailed ? 'emailed' : 'link', inviteUrl: res.inviteUrl ?? undefined });
      } catch (err) {
        out.push({ teacherId: r.teacherId, fullName: r.fullName, email, state: 'error', error: errorText(err, 'gönderilemedi') });
      }
    }
    setBusy(false);
    setResults(out);
    onDone();
  };

  // Sonuç ekranı
  if (results) {
    const links = results.filter((r) => r.state === 'link');
    const count = (s: Result['state']) => results.filter((r) => r.state === s).length;
    const text = links.map((l) => `${l.fullName} (${l.email}): ${l.inviteUrl}`).join('\n');
    return (
      <Modal open onClose={onClose} size="lg" title="Davet sonucu" footer={<Button onClick={onClose}>Tamam</Button>}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {count('emailed') > 0 && <span className="font-semibold text-emerald-700">{count('emailed')} davet e-postayla gönderildi</span>}
            {count('existing') > 0 && <span className="font-semibold text-sky-700">{count('existing')} kişi mevcut hesabıyla okula eklendi</span>}
            {links.length > 0 && <span className="font-semibold text-amber-700">{links.length} bağlantı elle iletilmeli</span>}
            {count('error') > 0 && <span className="font-semibold text-red-700">{count('error')} kişiye gönderilemedi</span>}
          </div>
          <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
            {results.map((r) => (
              <div key={r.teacherId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{r.fullName}</div>
                  <div className="text-xs text-slate-500">{r.email}</div>
                </div>
                <span
                  className={
                    r.state === 'error' ? 'text-xs text-red-700' : r.state === 'link' ? 'text-xs text-amber-700' : r.state === 'existing' ? 'text-xs text-sky-700' : 'text-xs text-emerald-700'
                  }
                >
                  {r.state === 'emailed' ? 'E-posta gönderildi' : r.state === 'existing' ? 'Mevcut hesabıyla eklendi' : r.state === 'link' ? 'E-posta gitmedi: bağlantıyı iletin' : r.error}
                </span>
                {r.state === 'link' && <div className="w-full rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs break-all ring-1 ring-slate-200">{r.inviteUrl}</div>}
              </div>
            ))}
          </div>
          {links.length > 0 && (
            <Button
              variant="secondary"
              icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => {
                void navigator.clipboard?.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Kopyalandı' : 'Bağlantıları kopyala'}
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Davet gönder · ${rows.length} öğretmen`}
      description="Her kişiye ayrı davet bağlantısı gider; şifresini kendisi belirler."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!ready.length || invalid.length > 0} onClick={() => void send()}>
            {ready.length ? `${ready.length} davet gönder` : 'Davet gönder'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!mail && <Alert tone="amber">E-posta gönderimi ayarlı değil: davetler oluşturulur, bağlantıları sonraki ekranda kopyalayıp iletirsiniz.</Alert>}
        <div className="hidden gap-3 text-xs font-semibold text-slate-500 sm:grid sm:grid-cols-[1fr_1.4fr_0.9fr]">
          <span>Öğretmen</span>
          <span>E-posta</span>
          <span>Rol</span>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((r) => {
            const value = emails[r.teacherId] ?? '';
            const bad = value.trim() !== '' && !EMAIL_RE.test(value.trim());
            const changed = value.trim().toLowerCase() !== (r.email ?? '').toLowerCase();
            return (
              <div key={r.teacherId} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_1.4fr_0.9fr] sm:items-start sm:gap-3">
                <div className="pt-1">
                  <div className="text-sm font-semibold text-ink">{r.fullName}</div>
                  <div className="text-xs text-slate-500">{r.sub}</div>
                </div>
                <div>
                  <Input
                    type="email"
                    value={value}
                    invalid={bad || !value.trim()}
                    onChange={(e) => setEmails((x) => ({ ...x, [r.teacherId]: e.target.value }))}
                    placeholder="e-posta yazın"
                    aria-label={`${r.fullName} e-posta`}
                  />
                  <div className={`mt-0.5 text-xs ${bad || !value.trim() ? 'text-amber-700' : 'text-slate-400'}`}>
                    {bad ? 'E-posta geçersiz' : !value.trim() ? 'Kadroda yok · yazınca karta kaydedilir' : changed ? (r.email ? 'Kadrodaki e-posta bununla değişecek' : 'Kadro kartına kaydedilecek') : 'kadrodan'}
                  </div>
                </div>
                {full ? (
                  <Select value={roles[r.teacherId] ?? r.role} onChange={(e) => setRoles((x) => ({ ...x, [r.teacherId]: e.target.value as EnrollRole }))} aria-label={`${r.fullName} rol`}>
                    {(Object.keys(ENROLL_ROLES) as EnrollRole[])
                      .filter((k) => k !== 'admin' || isOwner || r.role === 'admin')
                      .map((k) => (
                        <option key={k} value={k}>
                          {ENROLL_ROLES[k]}
                        </option>
                      ))}
                  </Select>
                ) : (
                  <div className="pt-2.5 text-sm text-slate-500">{ENROLL_ROLES.teacher}</div>
                )}
              </div>
            );
          })}
        </div>
        {missing.length > 0 && <p className="text-xs text-amber-700">{missing.length} öğretmenin e-postası boş: onlara davet gitmez. Yazın ya da “Giriş kodu” verin.</p>}
        <Alert tone="blue">E-posta başka bir okulda kayıtlıysa davet yerine bu okula eklenir; kişi kendi şifresiyle girer.</Alert>
      </div>
    </Modal>
  );
}
