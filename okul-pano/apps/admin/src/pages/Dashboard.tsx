import { resolveScreenDisplay } from '@okulpano/shared';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowUpRight, Cake, GraduationCap, Megaphone, MonitorSmartphone, Plus, ShieldCheck, TextCursorInput, UserMinus, Users } from 'lucide-react';
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

const TILE = {
  dark: 'bg-tile-dark text-white',
  mint: 'bg-tile-mint text-tile-mint-ink',
  sky: 'bg-tile-sky text-tile-sky-ink',
  lilac: 'bg-tile-lilac text-tile-lilac-ink',
} as const;

/** Bento kutusu: renkli zemin, simgeli küçük etiket, büyük rakam; dokununca ilgili sayfa */
function Stat({ icon, label, value, hint, to, tone }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; to?: string; tone: keyof typeof TILE }) {
  const body = (
    <div className={clsx('group relative flex h-full min-h-36 flex-col rounded-3xl p-5 transition-transform hover:-translate-y-0.5', TILE[tone])}>
      <div className="flex items-center gap-2 text-[13px] font-bold opacity-75">
        {icon}
        {label}
      </div>
      <div className="mt-auto pt-4 text-[44px] leading-none font-extrabold tracking-[-0.04em] tabular-nums">{value}</div>
      {hint && <div className="mt-2 text-[13px] font-bold">{hint}</div>}
      {to && (
        <span className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-white/50 transition group-hover:bg-white/80 dark:bg-white/10">
          <ArrowUpRight className="size-4" />
        </span>
      )}
    </div>
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
      className="flex items-center gap-4 rounded-3xl bg-tile-peach px-5 py-4 text-tile-peach-ink transition hover:brightness-[0.98]"
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-orange-500 text-white">
        <Megaphone className="size-5" />
      </span>
      <span className="text-[15px] font-extrabold">{n} duyuru onayınızı bekliyor</span>
      <span className="ml-auto shrink-0 rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-bold whitespace-nowrap dark:bg-white/10">İncele →</span>
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
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.04em] sm:text-[42px]">
          {greeting()}, {me?.user.fullName.split(' ')[0]}
          <span className="block text-slate-400">{new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-500">{school?.name} panosunun anlık durumu.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          tone="dark"
          icon={<MonitorSmartphone className="size-4" />}
          label="Ekranlar"
          value={
            s ? (
              <>
                {s.screensOnline}
                <span className="text-2xl opacity-50">/{s.screens}</span>
              </>
            ) : (
              '—'
            )
          }
          hint={s ? (s.screens > s.screensOnline ? <span className="text-rose-300">{s.screens - s.screensOnline} ekran çevrimdışı</span> : 'hepsi çevrimiçi') : undefined}
          to="/ekranlar"
        />
        <Stat tone="mint" icon={<Megaphone className="size-4" />} label="Yayında" value={s?.activeAnnouncements ?? '—'} hint="duyuru" to="/duyurular" />
        <Stat tone="sky" icon={<Users className="size-4" />} label="Öğretmen" value={s?.teachers ?? '—'} hint="kadroda" to="/ogretmenler" />
        <Stat tone="lilac" icon={<Cake className="size-4" />} label="Öğrenci" value={s?.students ?? '—'} hint="kayıtlı" to="/ogrenciler" />
      </div>

      <PendingApprovals />

      <TodaySummary />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold tracking-tight">Canlı önizleme</h2>
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
            <Card className="p-5">
              <h2 className="mb-3 text-lg font-extrabold tracking-tight">Hızlı işlemler</h2>
              <div className="flex flex-wrap gap-2">
                {quick.map((q, i) => (
                  <Link
                    key={q.to}
                    to={q.to}
                    className={clsx(
                      'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors',
                      i === 0 ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-surface ring-1 ring-slate-200 hover:bg-slate-100',
                    )}
                  >
                    {i === 0 ? <Plus className="size-4" /> : <q.icon className="size-4" />}
                    {q.label}
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {can('users.manage') && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold tracking-tight">Son hareketler</h2>
                <Link to="/gecmis" className="rounded-full px-3 py-1 text-xs font-bold ring-1 ring-slate-200 hover:bg-slate-100">
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
