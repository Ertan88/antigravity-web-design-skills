import { resolveScreenDisplay } from '@okulpano/shared';
import { useQuery } from '@tanstack/react-query';
import { Cake, GraduationCap, Megaphone, MonitorSmartphone, Plus, ShieldCheck, TextCursorInput, UserMinus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BoardPreview } from '../components/BoardPreview.tsx';
import { Card, Segmented } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchoolPath, type Announcement, type Screen } from '../lib/data.ts';
import { timeAgo } from '../lib/format.ts';
import { TodaySummary } from './dashboard/Today.tsx';

interface Stats {
  activeAnnouncements: number;
  teachers: number;
  students: number;
  screens: number;
  screensOnline: number;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  summary: string | null;
  userName: string | null;
  createdAt: string;
}

const ACTIONS: Record<string, string> = {
  create: 'ekledi',
  update: 'güncelledi',
  delete: 'sildi',
  publish: 'yayına aldı',
  unpublish: 'yayından kaldırdı',
  approve: 'onayladı',
  reject: 'reddetti',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Günaydın';
  if (h < 17) return 'İyi günler';
  return 'İyi akşamlar';
}

function Stat({ icon, label, value, hint, to }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const body = (
    <Card className="h-full p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight">{value}</span>
            {hint && <span className="truncate text-xs font-medium text-amber-600">{hint}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Onay yetkisi olanlara bekleyen duyurular */
function PendingApprovals() {
  const { can } = useAuth();
  const list = useList<Announcement>('announcements');
  const n = (list.data ?? []).filter((a) => a.approvalStatus === 'pending').length;
  if (!n || !can('announcements.approve')) return null;
  return (
    <Link
      to="/duyurular"
      className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
    >
      <Megaphone className="size-4" />
      {n} duyuru onayınızı bekliyor
      <span className="ml-auto text-amber-700">İncele →</span>
    </Link>
  );
}

export function Dashboard() {
  const { me, school, schoolId, can } = useAuth();
  const base = useSchoolPath();
  const stats = useQuery({ queryKey: [schoolId, 'stats'], queryFn: () => api<Stats>(`${base}/stats`), refetchInterval: 30_000 });
  const audit = useQuery({
    queryKey: [schoolId, 'audit-recent'],
    queryFn: () => api<AuditRow[]>(`${base}/audit`),
    enabled: can('users.manage'),
  });
  const s = stats.data;
  // Önizleme belirli bir panonun gözünden de açılabilir (düzeni, yönü, gösterimi)
  const screens = useList<Screen>('screens');
  const [previewId, setPreviewId] = useState('');
  const previewScreen = screens.data?.find((x) => x.id === previewId) ?? null;

  const quick = [
    { to: '/duyurular?yeni=1', label: 'Duyuru ekle', icon: Megaphone, perm: 'announcements.manage' as const },
    { to: '/kayan-yazi', label: 'Kayan yazı', icon: TextCursorInput, perm: 'ticker.manage' as const },
    { to: '/sinavlar', label: 'Sınav sayacı', icon: GraduationCap, perm: 'exams.manage' as const },
    { to: '/izinler', label: 'İzinli ekle', icon: UserMinus, perm: 'leaves.manage' as const },
    { to: '/nobet', label: 'Nöbetler', icon: ShieldCheck, perm: 'duties.manage' as const },
    { to: '/ekranlar', label: 'Ekran ekle', icon: MonitorSmartphone, perm: 'screens.manage' as const },
  ].filter((q) => can(q.perm));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}, {me?.user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{school?.name} panosunun anlık durumu.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Megaphone className="size-5" />} label="Yayındaki duyuru" value={s?.activeAnnouncements ?? '—'} to="/duyurular" />
        <Stat
          icon={<MonitorSmartphone className="size-5" />}
          label="Çevrimiçi ekran"
          value={s ? `${s.screensOnline} / ${s.screens}` : '—'}
          hint={s && s.screens > s.screensOnline ? `${s.screens - s.screensOnline} çevrimdışı` : undefined}
          to="/ekranlar"
        />
        <Stat icon={<Users className="size-5" />} label="Öğretmen" value={s?.teachers ?? '—'} to="/ogretmenler" />
        <Stat icon={<Cake className="size-5" />} label="Öğrenci" value={s?.students ?? '—'} to="/ogrenciler" />
      </div>

      <PendingApprovals />

      <TodaySummary />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Canlı önizleme</h2>
            {(screens.data?.length ?? 0) > 0 ? (
              <Segmented
                value={previewScreen?.id ?? ''}
                onChange={setPreviewId}
                options={[{ value: '', label: 'Okul varsayılanı' }, ...screens.data!.map((x) => ({ value: x.id, label: x.name }))]}
              />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Ekranlarla aynı anda güncellenir
              </span>
            )}
          </div>
          <BoardPreview
            key={previewScreen?.id ?? 'school'}
            screenId={previewScreen?.id}
            portrait={previewScreen ? resolveScreenDisplay(previewScreen.display).orientation === 'portrait' : false}
          />
        </Card>

        <div className="space-y-6">
          {quick.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Hızlı işlemler</h2>
              <div className="grid grid-cols-2 gap-2">
                {quick.map((q) => (
                  <Link
                    key={q.to}
                    to={q.to}
                    className="flex flex-col items-start gap-2 rounded-xl p-3 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:ring-brand-200"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <q.icon className="size-4" />
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <Plus className="size-3.5 text-slate-400" />
                      {q.label}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {can('users.manage') && (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Son hareketler</h2>
                <Link to="/gecmis" className="text-xs font-semibold text-brand-600">
                  Tümü
                </Link>
              </div>
              <ul className="space-y-3">
                {(audit.data ?? []).slice(0, 6).map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="font-semibold">{a.userName ?? 'Sistem'}</span>{' '}
                    <span className="text-slate-500">
                      {a.entity.toLocaleLowerCase('tr-TR')} {ACTIONS[a.action] ?? a.action}
                    </span>
                    {a.summary && <div className="truncate text-slate-700">{a.summary}</div>}
                    <div className="text-xs text-slate-400">{timeAgo(a.createdAt)}</div>
                  </li>
                ))}
                {audit.data?.length === 0 && <li className="text-sm text-slate-500">Henüz hareket yok.</li>}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
