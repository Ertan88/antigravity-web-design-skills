import { errorText, schoolFullName, type SupportTicket } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast.tsx';
import { Button, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { formatDate, timeAgo } from '../lib/format.ts';

interface PSchool {
  id: string;
  name: string;
  isActive: boolean;
  plan: 'trial' | 'basic' | 'pro';
  trialEndsAt: string | null;
  supportAccessUntil: string | null;
  settings?: { schoolType?: string | null } | null;
  screenCount: number;
  screensOnline?: number;
  createdAt: string;
  member: boolean;
  canOpen: boolean;
}
interface Signup {
  id: string;
  schoolName: string;
  schoolType: string;
  city: string;
  createdAt: string;
  expired: boolean;
}
interface Calendar {
  startYear: number;
  label: string;
  status: string;
  pending?: { foundAt: string } | null;
}
interface Contact {
  id: string;
  name: string;
  school: string;
  topic: 'demo' | 'quote' | 'question';
  status: 'new' | 'done';
  createdAt: string;
}

const TOPIC = { demo: 'Demo isteği', quote: 'Fiyat teklifi', question: 'Soru' } as const;
const DAY = 86400_000;

type Task = { key: string; tag: string; tone: string; title: string; detail: string; at: string; action: ReactNode };

/**
 * Platform yöneticisinin ana sayfası (A · yapılacaklar önde): üstte dört sayı, altında platformun beklettiği bütün
 * işler tek listede (kayıt onayı, destek talebi, MEB takvimi, iletişim formu); sağda denemesi biten ve destek erişimi
 * açık okullar. Yalnızca platform verisi görünür; okulların kendi içindeki işlemler görünmez (KVKK).
 */
export function PlatformHome() {
  const { me, setSchoolId } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const schools = useQuery({ queryKey: ['platform', 'schools'], queryFn: () => api<PSchool[]>('/api/platform/schools') });
  const signups = useQuery({ queryKey: ['platform', 'signups'], queryFn: () => api<Signup[]>('/api/platform/signups') });
  const support = useQuery({ queryKey: ['platform', 'support'], queryFn: () => api<SupportTicket[]>('/api/platform/support') });
  const calendars = useQuery({ queryKey: ['platform', 'academic-calendars'], queryFn: () => api<Calendar[]>('/api/platform/academic-calendars') });
  const contact = useQuery({ queryKey: ['platform', 'contact'], queryFn: () => api<Contact[]>('/api/platform/contact') });
  const approve = useMutation({
    mutationFn: (x: Signup) => api(`/api/platform/signups/${x.id}/approve`, { method: 'POST' }),
    onSuccess: async (_r, x) => {
      toast.success(`${x.schoolName} açıldı`);
      await qc.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: (e) => toast.error(errorText(e, 'Onaylanamadı')),
  });

  const now = Date.now();
  const list = schools.data ?? [];
  const active = list.filter((s) => s.isActive);
  const trials = active.filter((s) => s.plan === 'trial');
  const screensTotal = list.reduce((n, s) => n + s.screenCount, 0);
  const screensOnline = list.reduce((n, s) => n + (s.screensOnline ?? 0), 0);
  const month = new Date().toISOString().slice(0, 7);
  const newThisMonth = list.filter((s) => s.createdAt.slice(0, 7) === month).length;
  const ending = trials
    .filter((s) => s.trialEndsAt && Date.parse(s.trialEndsAt) - now < 7 * DAY && Date.parse(s.trialEndsAt) > now)
    .sort((a, b) => a.trialEndsAt!.localeCompare(b.trialEndsAt!));
  const supportOpen = list.filter((s) => !s.member && s.canOpen && s.supportAccessUntil && Date.parse(s.supportAccessUntil) > now);
  const name = (s: PSchool) => schoolFullName(s.name, s.settings?.schoolType);

  const waitingSignups = (signups.data ?? []).filter((s) => !s.expired);
  const tasks: Task[] = [
    ...waitingSignups.map(
      (x): Task => ({
        key: `s-${x.id}`,
        tag: 'Kayıt',
        tone: 'bg-tile-sky text-tile-sky-ink',
        title: schoolFullName(x.schoolName, x.schoolType),
        detail: `${x.city} · ${timeAgo(x.createdAt)} başvurdu`,
        at: x.createdAt,
        action: (
          <Button size="sm" loading={approve.isPending && approve.variables?.id === x.id} onClick={() => approve.mutate(x)}>
            Onayla
          </Button>
        ),
      }),
    ),
    ...(support.data ?? [])
      .filter((t) => t.status === 'new')
      .map(
        (t): Task => ({
          key: `t-${t.id}`,
          tag: 'Destek',
          tone: 'bg-tile-rose text-tile-rose-ink',
          title: t.subject,
          detail: `${t.schoolName} · yanıt bekliyor`,
          at: t.updatedAt,
          action: <LinkButton to={`/platform/destek?id=${t.id}`}>Aç</LinkButton>,
        }),
      ),
    ...(calendars.data ?? [])
      .filter((c) => c.pending || c.status === 'review')
      .map(
        (c): Task => ({
          key: `c-${c.startYear}`,
          tag: 'Takvim',
          tone: 'bg-tile-sun text-tile-sun-ink',
          title: `${c.label.replace('-', '–')} MEB takvimi`,
          detail: c.pending ? `MEB duyurusundan · ${timeAgo(c.pending.foundAt)} bulundu` : 'Onay bekliyor',
          at: c.pending?.foundAt ?? '',
          action: <LinkButton to="/tatil-takvimi#meb">İncele</LinkButton>,
        }),
      ),
  ];
  const newContacts = (contact.data ?? []).filter((c) => c.status === 'new');
  if (newContacts.length)
    tasks.push({
      key: 'contact',
      tag: 'İletişim',
      tone: 'bg-tile-mint text-tile-mint-ink',
      title: newContacts.length === 1 ? `${TOPIC[newContacts[0]!.topic]} · ${newContacts[0]!.school}` : `${newContacts.length} yeni iletişim formu`,
      detail: newContacts.length === 1 ? newContacts[0]!.name : newContacts.map((c) => TOPIC[c.topic]).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      at: newContacts[0]!.createdAt,
      action: <LinkButton to="/platform/iletisim">Aç</LinkButton>,
    });

  const loading = schools.isLoading;
  const hour = new Date().getHours();
  const hello = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.04em] sm:text-[42px]">
          {hello}, {me?.user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-500">
          Platformun bugünkü durumu · {new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        </p>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi to="/platform" tone="bg-ink text-surface" label="Etkin okul" value={String(active.length)} sub={`${trials.length} deneme · ${active.length - trials.length} abone`} />
            <Kpi to="/platform" tone="bg-tile-mint text-tile-mint-ink" label="Panolar" value={`${screensOnline}/${screensTotal}`} sub="çevrimiçi" />
            <Kpi tone="bg-tile-sun text-tile-sun-ink" label="Bekleyen iş" value={String(tasks.length)} sub="onay ve talep" />
            <Kpi to="/platform" tone="bg-tile-lilac text-tile-lilac-ink" label="Bu ay yeni okul" value={String(newThisMonth)} sub={waitingSignups.length ? `${waitingSignups.length} kayıt onayda` : 'kayıt onayı yok'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <section className="rounded-3xl bg-surface p-5 ring-1 ring-slate-200/70 dark:ring-white/10">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink">Yapılacaklar</h2>
                {tasks.length > 0 && <span className="rounded-full bg-tile-sun px-2 py-0.5 text-xs font-extrabold text-tile-sun-ink">{tasks.length}</span>}
              </div>
              {!tasks.length ? (
                <p className="mt-3 text-sm text-slate-500">Bekleyen iş yok. Kayıt onayları, destek talepleri ve MEB takvimi burada görünür.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
                  {tasks.map((t) => (
                    <li key={t.key} className="flex items-center gap-3 py-3">
                      <span className={clsx('w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-bold', t.tone)}>{t.tag}</span>
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="truncate font-bold text-ink">{t.title}</div>
                        <div className="truncate text-xs text-slate-500">{t.detail}</div>
                      </div>
                      <div className="shrink-0">{t.action}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-4">
              <section className="rounded-3xl bg-surface p-5 ring-1 ring-slate-200/70 dark:ring-white/10">
                <h2 className="text-lg font-extrabold text-ink">Deneme süresi bitiyor</h2>
                {!ending.length ? (
                  <p className="mt-2 text-sm text-slate-500">Önümüzdeki 7 günde denemesi biten okul yok.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-100 dark:divide-white/10">
                    {ending.map((s) => {
                      const left = Math.max(1, Math.ceil((Date.parse(s.trialEndsAt!) - now) / DAY));
                      return (
                        <li key={s.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="truncate font-bold text-ink">{name(s)}</div>
                            <div className="text-xs text-slate-500">
                              {left} gün kaldı · {formatDate(s.trialEndsAt!.slice(0, 10))} · {s.screenCount} pano
                            </div>
                          </div>
                          <LinkButton to="/platform">Paket</LinkButton>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section className="rounded-3xl bg-surface p-5 ring-1 ring-slate-200/70 dark:ring-white/10">
                <h2 className="text-lg font-extrabold text-ink">Destek erişimi açık</h2>
                {!supportOpen.length ? (
                  <p className="mt-2 text-sm text-slate-500">Şu an destek erişimi veren okul yok. Okul müdürü Genel Ayarlar'dan süreli erişim verir.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-100 dark:divide-white/10">
                    {supportOpen.map((s) => {
                      const hours = Math.max(1, Math.round((Date.parse(s.supportAccessUntil!) - now) / 3600_000));
                      return (
                        <li key={s.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="truncate font-bold text-ink">{name(s)}</div>
                            <div className="text-xs text-slate-500">{hours < 48 ? `${hours} saat kaldı` : `${Math.round(hours / 24)} gün kaldı`}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSchoolId(s.id);
                              navigate('/');
                            }}
                          >
                            Okulu aç
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ tone, label, value, sub, to }: { tone: string; label: string; value: string; sub: string; to?: string }) {
  const body = (
    <>
      <div className="text-sm font-bold opacity-80">{label}</div>
      <div className="mt-1 text-4xl font-extrabold tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-semibold opacity-75">{sub}</div>
    </>
  );
  const cls = clsx('block rounded-3xl p-5', tone);
  return to ? (
    <Link to={to} className={clsx(cls, 'transition hover:opacity-90')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-8 items-center rounded-full px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-slate-200 dark:ring-white/20 dark:hover:bg-white/5">
      {children}
    </Link>
  );
}
