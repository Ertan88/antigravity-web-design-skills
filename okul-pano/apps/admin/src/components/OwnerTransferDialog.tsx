import { ownershipTransferSchema } from '@okulpano/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { confirm } from './confirm.tsx';
import { Alert, Button, Field, Input, Modal, Segmented, Select } from './ui.tsx';
import { useForm } from '../lib/form.ts';

export interface TransferResult {
  newOwner: { fullName: string; email: string };
  invite: { inviteUrl: string; emailed: boolean } | null;
}

type Values = { source: 'member' | 'new'; memberId: string; fullName: string; email: string; keep: 'admin' | 'leave' };

/**
 * Okul müdürlüğü devri. Okulda tek müdür olur: yeni kişi müdür olur, eski müdür yönetici olarak kalır ya da okuldan çıkar.
 * Okulun kendi panelinde okuldaki bir kullanıcı seçilebilir; platform yöneticisi (KVKK: üye listesini görmez) ad ve e-posta yazar.
 */
export function OwnerTransferDialog({
  open,
  onClose,
  schoolName,
  currentOwner,
  members,
  ownerIsMe,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  schoolName: string;
  currentOwner: { fullName: string; email: string } | null;
  /** Okuldaki kullanıcılar (müdür hariç); verilmezse yalnızca ad ve e-posta yazılır */
  members?: { id: string; fullName: string; email: string }[];
  /** Devreden kişi müdürün kendisi mi (metinler "ben" diliyle yazılır) */
  ownerIsMe: boolean;
  onSubmit: (body: unknown) => Promise<TransferResult>;
}) {
  const canPick = Boolean(members?.length);
  const form = useForm<Values>({ source: canPick ? 'member' : 'new', memberId: '', fullName: '', email: '', keep: 'admin' });
  const [busy, setBusy] = useState(false);
  const v = form.values;

  useEffect(() => {
    if (open) form.reset({ source: canPick ? 'member' : 'new', memberId: '', fullName: '', email: '', keep: 'admin' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const picked = members?.find((m) => m.id === v.memberId);
  const target = v.source === 'member' ? picked : v.fullName.trim() && v.email.trim() ? { fullName: v.fullName.trim(), email: v.email.trim() } : undefined;
  const who = ownerIsMe ? 'Siz' : currentOwner?.fullName ?? 'Eski müdür';

  const submit = async () => {
    if (v.source === 'member' && !v.memberId) {
      form.setErrors({ memberId: 'Yeni müdürü seçin.' });
      return;
    }
    const payload = form.validate(
      ownershipTransferSchema,
      v.source === 'member' ? { memberId: v.memberId || undefined, keep: v.keep } : { email: v.email.trim(), fullName: v.fullName.trim(), keep: v.keep },
    );
    if (!payload) return;
    const ok = await confirm({
      title: 'Müdürlük devredilsin mi?',
      message: `${schoolName} okulunun müdürü ${target?.fullName ?? ''} olacak.`,
      effects: [
        { text: `${target?.fullName ?? 'Yeni müdür'} kullanıcı ekler, yönetici atar ve okulun bütün ayarlarını yönetir`, ok: true },
        v.keep === 'admin'
          ? { text: `${who} yönetici olarak kal${ownerIsMe ? 'ırsınız' : 'ır'}; yönetici atama ve müdürlüğü devretme yetkisi gider` }
          : { text: `${who} okuldan çık${ownerIsMe ? 'arsınız' : 'ar'}; başka okulda kaydı yoksa hesap silinir` },
        { text: 'Okulun verileri (çizelgeler, duyurular, kayıtlar) olduğu gibi kalır', ok: true },
      ],
      confirmLabel: 'Devret',
      tone: 'danger',
      hold: true,
      holdLabel: 'Devretmek için basılı tutun',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      form.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={ownerIsMe ? 'Müdürlüğü devret' : `${schoolName} · müdürü değiştir`}
      description={currentOwner ? `Şu anki müdür: ${currentOwner.fullName} · ${currentOwner.email}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="danger" loading={busy} disabled={!target} onClick={() => void submit()}>
            Devret
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
        {canPick && (
          <Segmented
            value={v.source}
            onChange={(s) => form.set('source', s)}
            options={[
              { value: 'member', label: 'Okuldaki bir kullanıcı' },
              { value: 'new', label: 'Yeni kişi (e-postayla davet)' },
            ]}
          />
        )}
        {v.source === 'member' && canPick ? (
          <Field label="Yeni müdür" error={form.errors.memberId} help="Listede yoksa “Yeni kişi” ile adını ve e-postasını yazın.">
            {(id) => (
              <Select id={id} value={v.memberId} onChange={(e) => form.set('memberId', e.target.value)}>
                <option value="">Seçin</option>
                {members!.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} · {m.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yeni müdürün adı soyadı" error={form.errors.fullName}>
              {(id) => <Input id={id} value={v.fullName} onChange={(e) => form.set('fullName', e.target.value)} maxLength={80} />}
            </Field>
            <Field label="E-posta" error={form.errors.email} help="Hesabı yoksa davet bağlantısı gider; varsa bildirim gider.">
              {(id) => <Input id={id} type="email" value={v.email} onChange={(e) => form.set('email', e.target.value)} />}
            </Field>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">{ownerIsMe ? 'Devirden sonra ben' : `Devirden sonra ${currentOwner?.fullName ?? 'eski müdür'}`}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['admin', ownerIsMe ? 'Yönetici olarak kalayım' : 'Yönetici olarak kalsın', 'Paneli kullanmaya devam eder; yönetici atayamaz.'],
                ['leave', ownerIsMe ? 'Okuldan çıkayım' : 'Okuldan çıksın', 'Okula erişimi biter; başka okulda kaydı yoksa hesabı silinir.'],
              ] as const
            ).map(([k, title, text]) => (
              <button
                key={k}
                type="button"
                onClick={() => form.set('keep', k)}
                className={clsx('rounded-xl p-3.5 text-left ring-1 transition-colors', v.keep === k ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50')}
              >
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-xs text-slate-500">{text}</div>
              </button>
            ))}
          </div>
        </div>

        <Alert tone="amber">
          Okulda tek müdür olur. Devirden sonra {ownerIsMe ? 'müdürlüğü geri almak için yeni müdürün size devretmesi gerekir.' : 'yeni müdür kullanıcıları ve yetkileri yönetir.'}
        </Alert>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
