import {
  applyPersonRole,
  DUTY_PACKAGES,
  dutiesOf,
  EXTRA_PERMISSIONS,
  partialDutyPermissions,
  PERSON_ROLES,
  toggleDuty,
  type DutyKey,
  type PersonRole,
} from '@okulpano/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { confirm } from '../../components/confirm.tsx';
import { ArrowLeftRight, Check, ChevronDown, KeyRound, Mail, Send, ShieldCheck, X } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Button, DeleteButton, Select } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useList, type Teacher } from '../../lib/data.ts';
import { timeAgo } from '../../lib/format.ts';
import { initials, ROLE_TONE, STATUS, type Person } from './people.ts';

export interface CardContext {
  full: boolean;
  isOwner: boolean;
  membersPath: string;
  enrollPath: string;
  refresh: () => void;
  onOpenAccount: (p: Person) => void;
  onCode: (p: Person) => void;
  onReset: (m: { id: string; fullName: string; email: string }) => void;
  onInvited: (r: { email: string; fullName: string; inviteUrl: string; emailed: boolean }) => void;
  onTransfer: () => void;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800', className)}>{initials(name)}</span>;
}

export const RolePill = ({ role }: { role: PersonRole }) => (
  <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', ROLE_TONE[role])}>{PERSON_ROLES[role].label}</span>
);

/**
 * Kişi kartı: rol (5 sabit rol), görev paketleri, diğer yetkiler ve hesap işlemleri. Yönetici atamayı yalnızca müdür
 * yapar; yönetici müdüre önerir. Müdürün kendi kartında müdürlük devri.
 */
export function PersonCard({ person, ctx }: { person: Person; ctx: CardContext }) {
  const { me, school } = useAuth();
  const toast = useToast();
  const m = person.member;
  const [role, setRole] = useState<PersonRole>(person.role);
  const [perms, setPerms] = useState<string[]>(m?.permissions ?? []);
  const [extra, setExtra] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const teachers = useList<Teacher>('teachers');

  useEffect(() => {
    setRole(person.role);
    setPerms(m?.permissions ?? []);
    setExtra((m?.permissions ?? []).some((p) => EXTRA_PERMISSIONS.some((e) => e.key === p)));
  }, [person.key, person.role, m?.permissions]);

  const isMe = m?.userId === me?.user.id;
  const iAmOwner = school?.role === 'owner';
  // Müdürün ve kendi hesabının yetkileri değişmez; yöneticiyi yalnızca müdür değiştirir
  const editable = Boolean(m) && ctx.full && m!.role !== 'owner' && !isMe && (m!.role !== 'admin' || iAmOwner);
  const baseline = m ? m.permissions : [];
  const dirty = Boolean(m) && (role !== person.role || [...perms].sort().join() !== [...baseline].sort().join());
  const duties = dutiesOf(perms);
  const partial = partialDutyPermissions(perms);
  const roleChoices: PersonRole[] = ['admin', 'counselor', person.teacherId ? 'teacher' : 'staff'];

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      ctx.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run(
      'save',
      () => {
        const body = role === 'owner' ? { permissions: perms } : applyPersonRole(role, perms);
        return api(`${ctx.membersPath}/${m!.id}`, { method: 'PATCH', body });
      },
      `${person.fullName} güncellendi`,
    );

  const setDuty = (key: DutyKey, on: boolean) => setPerms((p) => toggleDuty(p, key, on));

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={person.fullName} className="size-11 text-sm" />
        <div className="min-w-0">
          <div className="text-lg leading-tight font-bold text-ink">{person.fullName}</div>
          <div className="truncate text-xs text-slate-500">
            {person.sub}
            {person.email ? ` · ${person.email}` : ''}
          </div>
        </div>
      </div>

      {/* Hesap durumu */}
      <div className="mt-4">
        <AccountBox person={person} ctx={ctx} busy={busy} run={run} />
      </div>

      {m && (
        <>
          <div className="mt-5 text-sm font-semibold text-slate-700">Rol</div>
          {m.role === 'owner' ? (
            <div className="mt-2 space-y-2">
              <div className="rounded-xl px-3 py-2.5 ring-2 ring-ink">
                <div className="text-sm font-semibold">● {PERSON_ROLES.owner.label}</div>
                <div className="text-xs text-slate-500">{PERSON_ROLES.owner.text}</div>
              </div>
              {isMe && iAmOwner && (
                <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="size-4" />} onClick={ctx.onTransfer}>
                  Müdürlüğü devret
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-2 grid gap-1.5">
              {roleChoices.map((r) => {
                const locked = r === 'admin' && !iAmOwner && role !== 'admin';
                const on = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={!editable || locked}
                    onClick={() => setRole(r)}
                    className={clsx(
                      'rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-not-allowed',
                      on ? 'bg-slate-50 ring-2 ring-ink' : 'ring-1 ring-slate-200 enabled:hover:bg-slate-50',
                      locked && 'opacity-60',
                    )}
                  >
                    <div className="flex justify-between gap-2 text-sm font-semibold">
                      <span>
                        {on ? '● ' : '○ '}
                        {PERSON_ROLES[r].label}
                      </span>
                      {r === 'admin' && !iAmOwner && <span className="text-xs font-medium text-slate-400">yalnızca müdür verir</span>}
                    </div>
                    <div className="text-xs text-slate-500">{PERSON_ROLES[r].text}</div>
                  </button>
                );
              })}
              {editable && !iAmOwner && m.role === 'editor' && (
                <PromotionRow person={person} ctx={ctx} busy={busy} run={run} />
              )}
            </div>
          )}
          {iAmOwner && m.promotionRequest && <PromotionRow person={person} ctx={ctx} busy={busy} run={run} />}

          {m.role === 'editor' && (
            <>
              <div className="mt-5 text-sm font-semibold text-slate-700">
                Görevler <span className="font-normal text-slate-400">· düzenleyebileceği bölümler</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DUTY_PACKAGES.map((d) => {
                  const on = duties.includes(d.key);
                  const half = !on && d.permissions.some((p) => partial.includes(p));
                  return (
                    <button
                      key={d.key}
                      type="button"
                      title={d.text}
                      disabled={!editable}
                      onClick={() => setDuty(d.key, !on)}
                      className={clsx(
                        'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed',
                        on ? 'bg-ink text-surface' : half ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300' : 'text-slate-600 ring-1 ring-slate-200 enabled:hover:bg-slate-50',
                      )}
                    >
                      {on ? '✓ ' : half ? '~ ' : '+ '}
                      {d.label}
                      {half ? ' (kısmen)' : ''}
                    </button>
                  );
                })}
              </div>
              {partial.length > 0 && <p className="mt-1.5 text-xs text-amber-700">“Kısmen”: eski seçimden paketin bir bölümü verilmiş. Dokunursanız paketin tamamı verilir.</p>}

              <button type="button" onClick={() => setExtra((x) => !x)} className="mt-4 flex items-center gap-1 text-sm font-semibold text-slate-700">
                Diğer yetkiler <ChevronDown className={clsx('size-4 transition-transform', extra && 'rotate-180')} />
              </button>
              {extra && (
                <div className="mt-2 grid gap-1.5">
                  {EXTRA_PERMISSIONS.map((e) => {
                    const on = perms.includes(e.key);
                    return (
                      <label key={e.key} className={clsx('flex items-start gap-2.5 rounded-xl px-3 py-2 ring-1', on ? 'bg-brand-50 ring-brand-200' : 'ring-slate-200', editable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70')}>
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-brand-600"
                          disabled={!editable}
                          checked={on}
                          onChange={() => setPerms((p) => (on ? p.filter((x) => x !== e.key) : [...p, e.key]))}
                        />
                        <span>
                          <span className="block text-sm font-semibold">{e.label}</span>
                          <span className="block text-xs text-slate-500">{e.text}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {m.role !== 'editor' && <p className="mt-4 text-xs text-slate-500">Bütün bölümleri düzenler; ayrıca görev vermeye gerek yok.</p>}
          {m.role === 'admin' && role === 'admin' && (
            // Mesleki eğitim (KVKK): müdür yardımcısının rolü öğrencilerin işletme kayıtlarını kendiliğinden açmaz
            <label className={clsx('mt-3 flex items-start gap-2.5 rounded-xl px-3 py-2 ring-1', perms.includes('internship.manage') ? 'bg-brand-50 ring-brand-200' : 'ring-slate-200', editable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70')}>
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand-600"
                disabled={!editable}
                checked={perms.includes('internship.manage')}
                onChange={() => setPerms((p) => (p.includes('internship.manage') ? p.filter((x) => x !== 'internship.manage') : [...p, 'internship.manage']))}
              />
              <span>
                <span className="block text-sm font-semibold">Mesleki eğitimi yönetir</span>
                <span className="block text-xs text-slate-500">Bütün işletmeleri ve öğrencileri görür, koordinatör öğretmenleri işaretler, koordinatör müdür yardımcısını seçer.</span>
              </span>
            </label>
          )}

          {dirty && editable && (
            <div className="sticky bottom-0 mt-5 flex justify-end gap-2 border-t border-slate-100 bg-surface pt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setRole(person.role);
                  setPerms(m.permissions);
                }}
              >
                Vazgeç
              </Button>
              <Button loading={busy === 'save'} icon={<Check className="size-4" />} onClick={() => void save()}>
                Kaydet
              </Button>
            </div>
          )}

          {/* Kadro bağı: kadro dışı hesap bir öğretmen kaydına bağlanabilir (mobilde kendi programı ve nöbeti görünür) */}
          {ctx.full && m.role !== 'owner' && !person.roster && (
            <div className="mt-5">
              <div className="text-sm font-semibold text-slate-700">Kadro</div>
              <div className="mt-1.5">
                <Select
                  value={m.teacherId ?? ''}
                  onChange={(e) =>
                    void run('teacher', () => api(`${ctx.membersPath}/${m.id}/teacher`, { method: 'PUT', body: { teacherId: e.target.value || null } }), 'Kadro bağı güncellendi')
                  }
                  aria-label="Kadrodaki öğretmen kaydı"
                >
                  <option value="">Kadro dışı (öğretmen değil)</option>
                  {(teachers.data ?? [])
                    .filter((t) => t.isActive !== false)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          )}
        </>
      )}

      {!m && person.status !== 'pending' && ctx.full && (
        <p className="mt-4 text-xs text-slate-500">Rol ve görevler hesap açıldıktan sonra buradan verilir. Önerilen rol: {PERSON_ROLES[person.role].label}.</p>
      )}
    </div>
  );
}

type Run = (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;

/** Hesap durumu ve işlemleri */
function AccountBox({ person, ctx, busy, run }: { person: Person; ctx: CardContext; busy: string | null; run: Run }) {
  const { me } = useAuth();
  const m = person.member;
  const r = person.roster;
  const st = STATUS[person.status];
  const tone = { green: 'bg-emerald-50 text-emerald-800', blue: 'bg-sky-50 text-sky-800', amber: 'bg-amber-50 text-amber-800', slate: 'bg-slate-50 text-slate-700' }[st.tone];
  const canManage = ctx.full && m && m.role !== 'owner' && m.userId !== me?.user.id && (m.role !== 'admin' || ctx.isOwner);

  return (
    <div className="space-y-2.5">
      <div className={clsx('rounded-2xl px-4 py-2.5 text-sm', tone)}>
        <span className="font-semibold">{st.label}</span>
        {person.status === 'account' && m && ` · son giriş ${m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'yok'}`}
        {person.status === 'invited' && ' · bağlantı henüz açılmadı'}
        {person.status === 'code' && ' · öğretmen kodu henüz kullanmadı'}
        {person.status === 'pending' && ' · toplantı QR’ı ile başvurdu; adı ve e-postayı kontrol edip onaylayın'}
      </div>
      <div className="flex flex-wrap gap-2">
        {(person.status === 'none' || person.status === 'code') && r && (
          <>
            <Button size="sm" icon={<Mail className="size-4" />} onClick={() => ctx.onOpenAccount(person)}>
              Hesap aç
            </Button>
            <Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} loading={busy === 'code'} onClick={() => ctx.onCode(person)}>
              Giriş kodu
            </Button>
          </>
        )}
        {person.status === 'pending' && r?.enrollmentId && (
          <>
            <Button
              size="sm"
              icon={<Check className="size-4" />}
              loading={busy === 'approve'}
              onClick={() =>
                void run('approve', () => api(`${ctx.enrollPath}/${r.enrollmentId}/approve`, { method: 'POST', body: { role: ctx.full ? r.role : 'teacher' } }), `${person.fullName} hesabı onaylandı`)
              }
            >
              Onayla
            </Button>
            <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => void run('reject', () => api(`${ctx.enrollPath}/${r.enrollmentId}/cancel`, { method: 'POST' }), 'Başvuru reddedildi')}>
              Reddet
            </Button>
          </>
        )}
        {canManage && person.status === 'invited' && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Send className="size-4" />}
            loading={busy === 'reinvite'}
            onClick={() =>
              void run('reinvite', async () => {
                const res = await api<{ inviteUrl: string; emailed: boolean }>(`${ctx.membersPath}/${m!.id}/invite`, { method: 'POST' });
                ctx.onInvited({ ...res, email: m!.email, fullName: m!.fullName });
              })
            }
          >
            Daveti yeniden gönder
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => ctx.onReset({ id: m!.id, fullName: m!.fullName, email: m!.email })}>
            Şifreyi sıfırla
          </Button>
        )}
        {canManage && (
          <DeleteButton
            label="Erişimi kaldır"
            what={`${m!.fullName} kişisinin okul erişimi`}
            onConfirm={() => void run('remove', () => api(`${ctx.membersPath}/${m!.id}`, { method: 'DELETE' }), `${m!.fullName} kişisinin erişimi kaldırıldı`)}
          />
        )}
      </div>
    </div>
  );
}

/** Yönetici önerisi: yönetici önerir, müdür onaylar */
function PromotionRow({ person, ctx, busy, run }: { person: Person; ctx: CardContext; busy: string | null; run: Run }) {
  const { school } = useAuth();
  const m = person.member!;
  const path = `${ctx.membersPath}/${m.id}/promotion-request`;
  if (school?.role === 'owner') {
    return (
      <div className="mt-3">
        <Alert tone="amber">
          <div className="space-y-2">
            <div>{m.promotionRequest!.byName}, {person.fullName} kişisinin Müdür yardımcısı (Yönetici) yapılmasını öneriyor.</div>
            <div className="flex gap-2">
              <Button size="sm" icon={<Check className="size-4" />} loading={busy === 'promote'} onClick={() => void run('promote', () => api(`${path}/approve`, { method: 'POST', body: {} }), `${person.fullName} artık Müdür yardımcısı`)}>
                Onayla
              </Button>
              <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => void run('promote-no', () => api(path, { method: 'DELETE' }), 'Öneri reddedildi')}>
                Reddet
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }
  return m.promotionRequest ? (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span>Müdür yardımcısı önerisi müdürün onayını bekliyor</span>
      <Button size="sm" variant="ghost" onClick={() => void run('promote-no', () => api(path, { method: 'DELETE' }), 'Öneri geri çekildi')}>
        Geri çek
      </Button>
    </div>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      icon={<ShieldCheck className="size-4" />}
      loading={busy === 'promote'}
      onClick={async () => {
        if (await confirm({ title: 'Müdüre önerilsin mi?', message: `${person.fullName} kişisinin Müdür yardımcısı (Yönetici) yapılması müdürün onayına gönderilir.`, confirmLabel: 'Öner', tone: 'neutral' }))
          void run('promote', () => api(path, { method: 'POST', body: {} }), 'Öneri müdüre gönderildi');
      }}
    >
      Müdür yardımcısı yapılmasını müdüre öner
    </Button>
  );
}
