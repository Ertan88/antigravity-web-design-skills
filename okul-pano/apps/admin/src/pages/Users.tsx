import { errorText, type EnrollRole } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OwnerTransferDialog, type TransferResult } from '../components/OwnerTransferDialog.tsx';
import { Plus, QrCodeIcon, Tags } from '../components/icons.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, PageHeader, Segmented, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type TeacherOption } from '../lib/data.ts';
import { CredentialsDialog, InviteDialog, ResetPasswordDialog, type Credentials, type InviteResult } from './users/Credentials.tsx';
import { CodeDialog, MeetingDialog, TitleRoleDialog } from './users/dialogs.tsx';
import { DutiesTab } from './users/DutiesTab.tsx';
import { OpenAccountsDialog } from './users/OpenAccounts.tsx';
import { PeopleTab } from './users/PeopleTab.tsx';
import type { CardContext } from './users/PersonCard.tsx';
import { usePeople, type Person } from './users/people.ts';

type Tab = 'kisiler' | 'gorevler';

/**
 * Kişiler ve Yetkiler. Kadrodaki öğretmenler ve kadro dışı kişiler tek listede (Kişiler); rol 5 sabit rolden biri,
 * düzenleme yetkisi görev paketleriyle verilir. Görevler sekmesi iş bölümünü gösterir. Hesap tek pencereden açılır.
 */
export function Users() {
  const { me, school, schoolId, reloadMe } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { people, loading, full, mail, isOwner, membersPath, enrollPath, refresh } = usePeople();
  const schoolPath = useSchoolPath();
  const schoolData = useSchool();
  const titles = useList<TeacherOption>('teacher-titles');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('sekme') === 'gorevler' && full ? 'gorevler' : 'kisiler';

  const [opening, setOpening] = useState<string[] | null>(null);
  const [code, setCode] = useState<{ code: string; url: string; expiresAt: string; fullName: string } | null>(null);
  const [meeting, setMeeting] = useState<{ url: string; expiresAt: string } | null>(null);
  const [mapping, setMapping] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [invited, setInvited] = useState<InviteResult | null>(null);
  const [created, setCreated] = useState<Credentials | null>(null);
  const [resetting, setResetting] = useState<{ id: string; fullName: string; email: string } | null>(null);
  const [approving, setApproving] = useState(false);

  const openMeeting = async () => {
    try {
      setMeeting(await api<{ url: string; expiresAt: string }>(`${enrollPath}/meeting`, { method: 'POST', body: {} }));
      setOpening(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const closeMeeting = async () => {
    await api(`${enrollPath}/meeting`, { method: 'DELETE' }).catch(() => undefined);
    setMeeting(null);
    toast.success('Toplantı QR’ı kapatıldı');
  };

  const approveAll = async (list: Person[]) => {
    setApproving(true);
    let ok = 0;
    for (const p of list.filter((x) => x.status === 'pending' && x.roster?.enrollmentId)) {
      try {
        await api(`${enrollPath}/${p.roster!.enrollmentId}/approve`, { method: 'POST', body: { role: full ? p.roster!.role : 'teacher' } });
        ok++;
      } catch (err) {
        toast.error(`${p.fullName}: ${errorText(err, 'onaylanamadı')}`);
      }
    }
    setApproving(false);
    refresh();
    if (ok) toast.success(`${ok} hesap onaylandı`);
  };

  const ctx: CardContext = {
    full,
    isOwner,
    membersPath,
    enrollPath,
    refresh,
    onOpenAccount: (p) => setOpening([p.key]),
    onCode: async (p) => {
      try {
        const res = await api<{ code: string; url: string; expiresAt: string; fullName: string }>(`${enrollPath}/code`, {
          method: 'POST',
          body: { teacherId: p.teacherId, role: full && (p.role !== 'admin' || isOwner) ? (p.roster?.role ?? 'teacher') : 'teacher' },
        });
        setCode(res);
        refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    onReset: setResetting,
    onInvited: setInvited,
    onTransfer: () => setTransferring(true),
  };

  const pendingPromotions = people.filter((p) => p.member?.promotionRequest);
  const pendingEnrollments = people.filter((p) => p.status === 'pending').length;
  const titleRoles = (schoolData.data?.settings?.titleRoles ?? {}) as Record<string, EnrollRole>;

  return (
    <>
      <PageHeader
        title="Kişiler ve Yetkiler"
        description="Kadrodaki öğretmenler ve kadro dışı kişiler tek listede. Bir kişiye tıklayın; rolünü, görevlerini ve hesabını yanda düzenleyin."
        actions={
          <div className="flex flex-wrap gap-2">
            {full && (
              <Button variant="secondary" icon={<Tags className="size-4" />} onClick={() => setMapping(true)}>
                Ünvan → rol
              </Button>
            )}
            <Button variant="secondary" icon={<QrCodeIcon className="size-4" />} onClick={() => void openMeeting()}>
              Toplantı QR’ı
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setOpening([])}>
              Hesap aç
            </Button>
          </div>
        }
      />

      {school?.role === 'owner' && pendingPromotions.length > 0 && (
        <div className="mb-4">
          <Alert tone="amber">
            {pendingPromotions.length === 1
              ? `${pendingPromotions[0]!.member!.promotionRequest!.byName}, ${pendingPromotions[0]!.fullName} kişisinin Müdür yardımcısı yapılmasını öneriyor.`
              : `${pendingPromotions.length} kişi için Müdür yardımcısı önerisi var.`}{' '}
            Kişinin kartından onaylayın ya da reddedin.
          </Alert>
        </div>
      )}
      {pendingEnrollments > 0 && (
        <div className="mb-4">
          <Alert tone="blue">{pendingEnrollments} kişi toplantı QR’ı ile hesap açtı ve onayınızı bekliyor: “Onay bekliyor” süzgecine bakın.</Alert>
        </div>
      )}

      {full && (
        <div className="mb-4">
          <Segmented<Tab>
            value={tab}
            onChange={(v) => setParams(v === 'gorevler' ? { sekme: 'gorevler' } : {}, { replace: true })}
            options={[
              { value: 'kisiler', label: `Kişiler (${people.length})` },
              { value: 'gorevler', label: 'Görevler' },
            ]}
          />
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : tab === 'gorevler' ? (
        <DutiesTab people={people} membersPath={membersPath} refresh={refresh} />
      ) : (
        <PeopleTab people={people} ctx={ctx} initialQuery={params.get('ara') ?? undefined} onApproveAll={(l) => void approveAll(l)} approving={approving} />
      )}

      <OpenAccountsDialog
        open={opening !== null}
        initial={opening ?? []}
        people={people}
        full={full}
        isOwner={isOwner}
        mail={mail}
        membersPath={membersPath}
        enrollPath={enrollPath}
        onClose={() => setOpening(null)}
        onDone={refresh}
        onMeeting={() => void openMeeting()}
      />
      <CodeDialog value={code} onClose={() => setCode(null)} />
      <MeetingDialog value={meeting} onClose={() => setMeeting(null)} onStop={() => void closeMeeting()} />
      <TitleRoleDialog
        open={mapping}
        onClose={() => setMapping(false)}
        titles={titles.data ?? []}
        value={titleRoles}
        isOwner={isOwner}
        onSave={async (v) => {
          await api(schoolPath, { method: 'PATCH', body: { settings: { titleRoles: v } } });
          void qc.invalidateQueries({ queryKey: [schoolId, 'school'] });
          refresh();
          toast.success('Ünvan → rol eşleştirmesi kaydedildi');
          setMapping(false);
        }}
      />
      <OwnerTransferDialog
        open={transferring}
        onClose={() => setTransferring(false)}
        schoolName={school?.name ?? ''}
        currentOwner={me ? { fullName: me.user.fullName, email: me.user.email } : null}
        ownerIsMe
        members={people.filter((p) => p.member && p.member.role !== 'owner').map((p) => ({ id: p.member!.id, fullName: p.fullName, email: p.member!.email }))}
        onSubmit={async (body) => {
          const r = await api<TransferResult>(`${schoolPath}/transfer-ownership`, { method: 'POST', body });
          setTransferring(false);
          toast.success(`Müdürlük ${r.newOwner.fullName} kişisine devredildi`);
          if (r.invite) setInvited({ email: r.newOwner.email, fullName: r.newOwner.fullName, ...r.invite });
          refresh();
          await reloadMe();
          return r;
        }}
      />
      <InviteDialog value={invited} onClose={() => setInvited(null)} />
      <CredentialsDialog value={created} onClose={() => setCreated(null)} />
      <ResetPasswordDialog
        member={resetting}
        onClose={() => setResetting(null)}
        onDone={(c) => {
          setResetting(null);
          setCreated(c);
          toast.success(c.emailed ? `${c.fullName} kullanıcısının şifresi sıfırlandı ve e-postayla gönderildi` : `${c.fullName} kullanıcısının şifresi sıfırlandı`);
        }}
      />
    </>
  );
}
