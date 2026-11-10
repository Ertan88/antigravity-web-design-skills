import { useSearchParams } from 'react-router-dom';
import { defaultTitleRole, ENROLL_ROLES, normalizeName, type EnrollRole, errorText } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Mail, QrCodeIcon, Search, Tags, X } from '../../components/icons.tsx';
import { QrCode } from '../../components/QrCode.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, Segmented, Select, Spinner, Table, Td } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type TeacherOption } from '../../lib/data.ts';
import { RosterInviteDialog, type InviteRow } from './RosterInvite.tsx';

interface RosterRow {
  teacherId: string;
  fullName: string;
  title: string | null;
  branch: string | null;
  status: Status;
  role: EnrollRole;
  email: string | null;
  enrollmentId: string | null;
}

interface Roster {
  mail: boolean;
  /** Kullanıcı yönetimi yetkisi (yoksa dar yetki: yalnızca Öğretmen rolü) */
  full: boolean;
  owner: boolean;
  rows: RosterRow[];
}

type Status = 'account' | 'invited' | 'pending' | 'code' | 'none';
type Filter = 'all' | 'none' | 'pending' | 'account';

const STATUS: Record<Status, { label: string; tone: 'green' | 'blue' | 'amber' | 'slate' }> = {
  account: { label: 'Hesabı var', tone: 'green' },
  invited: { label: 'Davet gönderildi', tone: 'blue' },
  pending: { label: 'Onay bekliyor', tone: 'amber' },
  code: { label: 'Kod verildi', tone: 'blue' },
  none: { label: 'Hesabı yok', tone: 'slate' },
};

const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return '';
  const left = Math.max(0, new Date(until).getTime() - now);
  return left ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : 'süresi doldu';
}

/**
 * Kullanıcılar → Kadro: kadrodaki her öğretmenin hesap durumu. Hesap üç yoldan açılır:
 * kadroda e-postası olana davet bağlantısı, kişi başı tek kullanımlık giriş kodu ya da toplantıda okutulan QR (onaylı).
 * Öğretmen e-postasını ve şifresini kendisi girer; ortada yazılı şifre olmaz.
 */
export function RosterTab() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const school = useSchool();
  const titles = useList<TeacherOption>('teacher-titles');
  const enrollPath = useSchoolPath('enrollments');
  const schoolPath = useSchoolPath();
  const enroll = useQuery({
    queryKey: [schoolId, 'enrollments'],
    queryFn: () => api<Roster>(`${enrollPath}/roster`),
    enabled: Boolean(schoolId),
    refetchInterval: 15_000,
  });
  const isOwner = Boolean(enroll.data?.owner);
  const full = Boolean(enroll.data?.full);
  const titleRoles = (school.data?.settings?.titleRoles ?? {}) as Record<string, EnrollRole>;

  // "Kullanıcı ekle"den kadrodaki bir öğretmen için gelindiyse arama onun adıyla açılır
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('ara') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, EnrollRole>>({});
  const [code, setCode] = useState<{ code: string; url: string; expiresAt: string; fullName: string } | null>(null);
  const [meeting, setMeeting] = useState<{ url: string; expiresAt: string } | null>(null);
  const [mapping, setMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState<InviteRow[] | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [schoolId, 'enrollments'] });
    void qc.invalidateQueries({ queryKey: [schoolId, 'members'] });
    void qc.invalidateQueries({ queryKey: [schoolId, 'teachers'] });
  };

  // Dar yetkiyle yalnızca "Öğretmen" rolü seçilebilir
  const rows = useMemo(
    () =>
      (enroll.data?.rows ?? []).map((r) => ({
        ...r,
        t: { id: r.teacherId, fullName: r.fullName, title: r.title, branch: r.branch, email: r.email },
        role: (full ? (roles[r.teacherId] ?? r.role) : 'teacher') as EnrollRole,
      })),
    [enroll.data, roles, full],
  );

  const counts = {
    none: rows.filter((r) => r.status === 'none' || r.status === 'code').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    account: rows.filter((r) => r.status === 'account' || r.status === 'invited').length,
  };
  const visible = rows.filter((r) => {
    if (filter === 'none' && !(r.status === 'none' || r.status === 'code')) return false;
    if (filter === 'pending' && r.status !== 'pending') return false;
    if (filter === 'account' && !(r.status === 'account' || r.status === 'invited')) return false;
    const needle = normalizeName(q);
    return !needle || normalizeName(`${r.t.fullName} ${r.t.branch ?? ''} ${r.t.title ?? ''}`).includes(needle);
  });
  const chosen = rows.filter((r) => selected.has(r.t.id));
  const invitable = chosen.filter((r) => r.status === 'none' || r.status === 'code');
  const approvable = chosen.filter((r) => r.status === 'pending');
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const selectable = (r: (typeof rows)[number]) => r.status !== 'account' && r.status !== 'invited';

  const giveCode = useMutation({
    mutationFn: (r: (typeof rows)[number]) => api<{ code: string; url: string; expiresAt: string; fullName: string }>(`${enrollPath}/code`, { method: 'POST', body: { teacherId: r.t.id, role: r.role } }),
    onSuccess: (res) => {
      setCode(res);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const openMeeting = useMutation({
    mutationFn: () => api<{ url: string; expiresAt: string }>(`${enrollPath}/meeting`, { method: 'POST', body: {} }),
    onSuccess: setMeeting,
    onError: (e) => toast.error(e.message),
  });
  const closeMeeting = async () => {
    await api(`${enrollPath}/meeting`, { method: 'DELETE' }).catch(() => undefined);
    setMeeting(null);
    toast.success('Toplantı QR\'ı kapatıldı');
  };

  const approve = async (list: typeof rows) => {
    setBusy(true);
    let ok = 0;
    for (const r of list) {
      try {
        await api(`${enrollPath}/${r.enrollmentId}/approve`, { method: 'POST', body: { role: r.role } });
        ok++;
      } catch (err) {
        toast.error(`${r.t.fullName}: ${errorText(err, 'onaylanamadı')}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    refresh();
    if (ok) toast.success(`${ok} hesap onaylandı`);
  };
  const reject = async (r: (typeof rows)[number]) => {
    await api(`${enrollPath}/${r.enrollmentId}/cancel`, { method: 'POST' }).catch((e: Error) => toast.error(e.message));
    refresh();
  };

  /** Davet penceresi: seçilenlerden hesabı olmayanlar (e-postası kadroda yoksa pencerede yazılır) */
  const openInvite = () =>
    setInviting(
      invitable.map((r) => ({
        teacherId: r.t.id,
        fullName: r.t.fullName,
        sub: [r.t.title, r.t.branch].filter(Boolean).join(' · ') || 'Ünvan girilmemiş',
        email: r.t.email,
        role: r.role,
      })),
    );

  if (enroll.isLoading) return <Spinner />;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
          <Button size="sm" icon={<QrCodeIcon className="size-4" />} loading={openMeeting.isPending} onClick={() => openMeeting.mutate()}>
            Toplantı QR'ı
          </Button>
          {full && (
            <Button size="sm" variant="secondary" icon={<Tags className="size-4" />} onClick={() => setMapping(true)}>
              Ünvan → rol
            </Button>
          )}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, branş ya da ünvan ara" className="pl-9" aria-label="Öğretmen ara" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Tümü (${rows.length})` },
              { value: 'none', label: `Hesabı yok (${counts.none})` },
              { value: 'pending', label: `Onay bekliyor (${counts.pending})` },
              { value: 'account', label: `Hesabı var (${counts.account})` },
            ]}
          />
          {!enroll.data?.mail && (
            <span className="text-xs text-slate-500">E-posta gönderimi ayarlı değil: davet ve doğrulama kodu gitmez; giriş kodu ve QR çalışır.</span>
          )}
        </div>
        {!rows.length ? (
          <EmptyState icon={<Search className="size-6" />} title="Kadroda öğretmen yok" description="Önce Öğretmen Kadrosu sayfasından öğretmenleri ekleyin ya da Excel'den yükleyin." />
        ) : (
          <Table head={['', 'Öğretmen', 'Rol', 'E-posta', 'Durum', '']}>
            {visible.map((r) => (
              <tr key={r.t.id}>
                <Td className="w-px">
                  {selectable(r) && (
                    <input type="checkbox" className="size-4 accent-brand-600" checked={selected.has(r.t.id)} onChange={() => toggle(r.t.id)} aria-label={`${r.t.fullName} seç`} />
                  )}
                </Td>
                <Td>
                  <div className="font-semibold text-ink">{r.t.fullName}</div>
                  <div className="text-slate-500">{[r.t.title, r.t.branch].filter(Boolean).join(' · ') || 'Ünvan girilmemiş'}</div>
                </Td>
                <Td className="min-w-40">
                  {selectable(r) && full ? (
                    <Select value={r.role} onChange={(e) => setRoles((x) => ({ ...x, [r.t.id]: e.target.value as EnrollRole }))} aria-label="Rol">
                      {(Object.keys(ENROLL_ROLES) as EnrollRole[])
                        .filter((k) => k !== 'admin' || isOwner || r.role === 'admin')
                        .map((k) => (
                          <option key={k} value={k}>
                            {ENROLL_ROLES[k]}
                          </option>
                        ))}
                    </Select>
                  ) : (
                    <span className="text-slate-500">{ENROLL_ROLES[r.role]}</span>
                  )}
                </Td>
                <Td className="text-slate-600">{r.email ?? <span className="text-slate-400">yok</span>}</Td>
                <Td className="whitespace-nowrap">
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </Td>
                <Td className="w-px text-right whitespace-nowrap">
                  {r.status === 'pending' ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => void reject(r)}>
                        Reddet
                      </Button>
                      <Button size="sm" icon={<Check className="size-4" />} loading={busy} onClick={() => void approve([r])}>
                        Onayla
                      </Button>
                    </div>
                  ) : selectable(r) ? (
                    <Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} loading={giveCode.isPending && giveCode.variables?.t.id === r.t.id} onClick={() => giveCode.mutate(r)}>
                      Giriş kodu
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <span className="text-sm font-semibold text-ink">{chosen.length} öğretmen seçildi</span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Seçimi kaldır
            </Button>
            {approvable.length > 0 && (
              <Button size="sm" variant="secondary" icon={<Check className="size-4" />} loading={busy} onClick={() => void approve(approvable)}>
                Onayla ({approvable.length})
              </Button>
            )}
            <Button size="sm" icon={<Mail className="size-4" />} disabled={!invitable.length} onClick={openInvite}>
              Davet gönder ({invitable.length})
            </Button>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Davet için öğretmenleri seçip “Davet gönder”e basın; kadroda e-postası olmayanın e-postasını açılan pencerede yazabilirsiniz. E-postasını bilmediğiniz öğretmene “Giriş kodu” verin ya da toplantıda “Toplantı QR'ı”nı gösterin: öğretmen
        e-postasını doğrulayıp şifresini kendisi belirler, doğrulanan e-posta kadro kartına yazılır.
      </p>

      <RosterInviteDialog
        rows={inviting}
        onClose={() => setInviting(null)}
        onDone={() => {
          setSelected(new Set());
          refresh();
        }}
        enrollPath={enrollPath}
        full={full}
        isOwner={isOwner}
        mail={Boolean(enroll.data?.mail)}
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
          setRoles({});
          toast.success('Ünvan → rol eşleştirmesi kaydedildi');
          setMapping(false);
        }}
      />
    </>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Bağlantı" />
      <Button
        variant="secondary"
        icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </Button>
    </div>
  );
}

/** Kişi başı giriş kodu: yalnızca bu ekranda görünür, 15 dakika geçerli, bir kez kullanılır */
function CodeDialog({ value, onClose }: { value: { code: string; url: string; expiresAt: string; fullName: string } | null; onClose: () => void }) {
  const left = useCountdown(value?.expiresAt ?? null);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={`${value?.fullName ?? ''} · giriş kodu`} footer={<Button onClick={onClose}>Kapat</Button>}>
      {value && (
        <div className="flex flex-col items-center gap-4 text-center">
          <QrCode value={value.url} size={220} label="Giriş kodu QR" />
          <div className="font-mono text-4xl font-extrabold tracking-[0.2em] text-ink">{formatCode(value.code)}</div>
          <Badge tone={left === 'süresi doldu' ? 'red' : 'amber'}>{left === 'süresi doldu' ? 'Süresi doldu' : `${left} içinde kullanılmalı`}</Badge>
          <p className="max-w-md text-sm text-slate-600">
            Öğretmen telefonuyla QR'ı okutur ya da uygulamada “Giriş kodum var”a dokunup kodu yazar. Ardından e-postasını doğrular ve şifresini belirler. Kod bir kez
            kullanılır; kâğıda yazmayın, yalnızca bu ekranda gösterin.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** Toplantı QR'ı: projeksiyona yansıtılır; öğretmen kadrodan adını seçer, hesap onayınızla açılır */
function MeetingDialog({ value, onClose, onStop }: { value: { url: string; expiresAt: string } | null; onClose: () => void; onStop: () => void }) {
  const left = useCountdown(value?.expiresAt ?? null);
  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      size="lg"
      title="Toplantı QR'ı"
      description="Projeksiyona yansıtın. Öğretmenler okutup kadrodan adını seçer, e-postasını doğrular ve şifresini belirler. Hesaplar siz onaylayınca açılır."
      footer={
        <>
          <Button variant="secondary" onClick={onStop}>
            Bağlantıyı şimdi kapat
          </Button>
          <Button onClick={onClose}>Tamam</Button>
        </>
      }
    >
      {value && (
        <div className="flex flex-col items-center gap-4">
          <QrCode value={value.url} size={320} label="Toplantı QR" />
          <Badge tone={left === 'süresi doldu' ? 'red' : 'blue'}>{left === 'süresi doldu' ? 'Süresi doldu' : `${left} daha geçerli`}</Badge>
          <div className="w-full">
            <CopyLink url={value.url} />
          </div>
          <Alert>Başkası bir öğretmenin adını seçebileceği için her hesap “Onay bekliyor” olarak düşer; adı ve e-postayı kontrol edip onaylayın.</Alert>
        </div>
      )}
    </Modal>
  );
}

/** Kadrodaki ünvan → önerilen rol (okul kendisi belirler; ünvan adları koda sabit değildir) */
function TitleRoleDialog({
  open,
  onClose,
  titles,
  value,
  isOwner,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  titles: TeacherOption[];
  value: Record<string, EnrollRole>;
  isOwner: boolean;
  onSave: (v: Record<string, EnrollRole>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, EnrollRole>>(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ünvan → rol"
      description="Kadrodaki ünvana göre hesap açılırken önerilecek rol. Müdür yardımcısı ünvanları için Yönetici önerilir; isterseniz değiştirin. Her öğretmen için ayrıca da değiştirebilirsiniz."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                // Varsayılan öneriyle aynı olanlar saklanmaz (ör. müdür yardımcısı → Yönetici); farklı seçim saklanır
                const nameOf = (id: string) => titles.find((t) => t.id === id)?.name;
                await onSave(Object.fromEntries(Object.entries(draft).filter(([id, r]) => r !== defaultTitleRole(nameOf(id)))));
              } finally {
                setSaving(false);
              }
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="divide-y divide-slate-100">
        {titles
          .filter((t) => t.teacherCount > 0 || draft[t.id])
          .map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{t.name}</div>
                <div className="text-xs text-slate-500">{t.teacherCount} öğretmen</div>
              </div>
              <div className="w-48">
                <Select value={draft[t.id] ?? defaultTitleRole(t.name)} onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value as EnrollRole }))} aria-label={`${t.name} rolü`}>
                  {(Object.keys(ENROLL_ROLES) as EnrollRole[])
                    .filter((k) => k !== 'admin' || isOwner || (draft[t.id] ?? defaultTitleRole(t.name)) === 'admin')
                    .map((k) => (
                      <option key={k} value={k}>
                        {ENROLL_ROLES[k]}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
}
