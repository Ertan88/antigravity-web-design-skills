import { DESIGN_PALETTES, designTemplate, designTitle, type AnnouncementDesign } from '@okulpano/shared/designs';
import { parseYouTubeUrl, youTubeThumbnail } from '@okulpano/shared/youtube';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, Switch, View } from 'react-native';
import { absoluteUrl, api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useAnnouncementDrafts, useAnnouncements, useScreens, type Announcement, type AnnouncementDraft } from '../../src/data.ts';
import { timeAgo } from '../../src/day.ts';
import { AnnouncementPreview } from '../../src/preview.tsx';
import { Sheet } from '../../src/sheet.tsx';
import { Text } from '../../src/text.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, confirm, DeleteIconButton, Empty, Icon, Loading, Screen, Segmented, T, switchColors, type IconName } from '../../src/ui.tsx';

/*
 * Duyurular (tasarım B): duruma göre bölümler. Önce "İlgilenmeniz gerekenler" (kendi onay bekleyen ve düzeltme istenen
 * duyurularınız; onaylayıcıya başkalarının bekleyenleri için "Onaylar'da incele"), sonra panolarda şu an yayında
 * olanlar (büyük kart ve yayın anahtarı), planlananlar, yayında olmayanlar ve kapalı duran süresi bitenler. Duyuruya
 * dokununca işlem sayfası açılır: yayın anahtarı, Düzenle, Benzerini oluştur, Sil. Sekmeler: Tümü, Yayınladıklarım,
 * Taslaklar. Duyuru yetkisi olmayan öğretmen yalnızca panolarda şu an yayında olanları görür.
 */

type Tab = 'all' | 'mine' | 'drafts';
type Phase = 'attention' | 'live' | 'scheduled' | 'off' | 'expired';

function phaseOf(a: Announcement, now: number): Phase {
  if (a.approvalStatus !== 'approved') return 'attention';
  if (a.endsAt && Date.parse(a.endsAt) <= now) return 'expired';
  if (!a.isActive) return 'off';
  if (a.startsAt && Date.parse(a.startsAt) > now) return 'scheduled';
  return 'live';
}

const STATUS: Record<Phase | 'pending' | 'rejected', { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' | 'primary' }> = {
  pending: { label: 'Onay bekliyor', tone: 'warning' },
  rejected: { label: 'Düzeltme istendi', tone: 'danger' },
  attention: { label: 'Onay bekliyor', tone: 'warning' },
  live: { label: 'Yayında', tone: 'success' },
  scheduled: { label: 'Planlandı', tone: 'primary' },
  off: { label: 'Yayında değil', tone: 'muted' },
  expired: { label: 'Süresi bitti', tone: 'muted' },
};
const statusOf = (a: Announcement, now: number) => (a.approvalStatus === 'rejected' ? STATUS.rejected : a.approvalStatus === 'pending' ? STATUS.pending : STATUS[phaseOf(a, now)]);

const shortDate = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(iso));
const titleOf = (a: Announcement) => (a.kind === 'design' && a.design ? designTitle(a.design) : a.title) || 'Başlıksız duyuru';

/** Satırın alt yazısı: panolar ve süre ("Tüm panolar · 20 Kasım'a kadar") */
function meta(a: Announcement, screenName: (id: string) => string, now: number) {
  const where = a.screenIds?.length ? a.screenIds.map(screenName).join(', ') : 'Tüm panolar';
  const p = phaseOf(a, now);
  const when =
    p === 'expired' && a.endsAt
      ? `${shortDate(a.endsAt)} tarihinde bitti`
      : a.startsAt && Date.parse(a.startsAt) > now
        ? `${shortDate(a.startsAt)} tarihinde başlar`
        : a.endsAt
          ? `${shortDate(a.endsAt)} tarihine kadar`
          : 'süresiz';
  return `${where} · ${when}`;
}

/** Küçük önizleme (liste satırı) */
function Thumb({ a, w = 76, h = 46 }: { a: Announcement; w?: number; h?: number }) {
  const box = { width: w, height: h, borderRadius: 10, overflow: 'hidden' as const, justifyContent: 'flex-end' as const, padding: 5 };
  if (a.kind === 'image' && a.imageUrl)
    return (
      <View style={[box, { backgroundColor: '#0b1220', padding: 0 }]}>
        <Image source={{ uri: absoluteUrl(a.imageUrl)! }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  if (a.kind === 'video') {
    const yt = a.youtubeUrl ? parseYouTubeUrl(a.youtubeUrl) : null;
    return (
      <View style={[box, { backgroundColor: '#1c1917', alignItems: 'center', justifyContent: 'center', padding: 0 }]}>
        {yt && <Image source={{ uri: youTubeThumbnail(yt.id) }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" />}
        <Icon name="play" size={18} color="#ffffff" />
      </View>
    );
  }
  const bg = a.kind === 'design' && a.design ? (DESIGN_PALETTES[a.design.palette as keyof typeof DESIGN_PALETTES] ?? DESIGN_PALETTES.petrol).from : colors.brand;
  return (
    <View style={[box, { backgroundColor: bg }]}>
      <Text style={{ color: '#ffffff', fontSize: 8.5, fontWeight: '800', lineHeight: 10 }} numberOfLines={3}>
        {titleOf(a)}
      </Text>
    </View>
  );
}

function Row({ a, sub, badge, onPress }: { a: Announcement; sub: string; badge?: { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' | 'primary' }; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${titleOf(a)}: işlemler`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
        <Thumb a={a} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="700" lines={1}>
            {titleOf(a)}
          </T>
          <T size={12} color={colors.muted} lines={2}>
            {sub}
          </T>
          {badge && (
            <View style={{ alignSelf: 'flex-start', marginTop: 2 }}>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

function Section({ title, count, right, children }: { title: string; count: number; right?: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 }}>
          {title.toLocaleUpperCase('tr-TR')} · {count}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Taslaklar: yarım kalan duyurular (web ile ortak); "Devam et" kaldığı adımdan açar */
function Drafts({ list }: { list: AnnouncementDraft[] }) {
  const { school } = useAuth();
  const path = useSchoolPath('announcement-drafts');
  const qc = useQueryClient();
  const STEPS = ['Tür', 'İçerik', 'Nerede ve ne zaman', 'Kontrol ve gönder'];
  const KIND: Record<string, string> = { design: 'Hazır şablon', image: 'Fotoğraf', text: 'Yazı', video: 'YouTube' };
  if (!list.length)
    return (
      <Card>
        <Empty icon="albums-outline" title="Taslak yok" text="Yeni duyuruyu yarıda bırakırsanız burada saklanır; kaldığınız adımdan devam edebilirsiniz." />
      </Card>
    );
  return (
    <>
      {list.map((d) => {
        const x = d.data;
        const title = (x.kind === 'design' && x.design ? designTitle(x.design as AnnouncementDesign) : x.title)?.trim() || 'Başlıksız taslak';
        return (
          <Card key={d.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="700" lines={2}>
                  {title}
                </T>
                <T size={12} color={colors.muted}>
                  {KIND[x.kind ?? 'design']} · "{STEPS[Math.min(3, d.step)]}" adımında kaldı · {timeAgo(d.updatedAt)}
                </T>
              </View>
              <DeleteIconButton
                label="Taslağı sil"
                onPress={() =>
                  void confirm('Taslak silinsin mi?', 'Bu taslak kalıcı olarak silinir.', 'Sil').then(async (ok) => {
                    if (!ok) return;
                    await api(`${path}/${d.id}`, { method: 'DELETE' }).catch(() => undefined);
                    await qc.invalidateQueries({ queryKey: [school?.id, 'announcement-drafts'] });
                  })
                }
              />
            </View>
            <Button size="sm" onPress={() => router.push(`/duyuru-yeni?taslak=${d.id}`)}>
              Devam et
            </Button>
          </Card>
        );
      })}
    </>
  );
}

/** İşlem sayfası: büyük önizleme, durum, giren kişi; yayın anahtarı, Düzenle, Benzerini oluştur, Sil */
function ActionSheet({ a, canAct, onClose, onToggle, onDelete }: { a: Announcement | null; canAct: boolean; onClose: () => void; onToggle: (a: Announcement, v: boolean) => void; onDelete: (a: Announcement) => void }) {
  const { me } = useAuth();
  const now = Date.now();
  if (!a) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const st = statusOf(a, now);
  const p = phaseOf(a, now);
  const action = (icon: IconName, label: string, onPress: () => void, tone: 'default' | 'danger' = 'default') => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.divider, opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.ink} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: tone === 'danger' ? colors.danger : colors.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet open onClose={onClose}>
      <View style={{ gap: 10 }}>
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          <AnnouncementPreview kind={a.kind} title={a.title} body={a.body} imageUrl={a.imageUrl} design={a.design} youtubeUrl={a.youtubeUrl} height={150} />
        </View>
        <View style={{ gap: 4 }}>
          <T size={16} weight="800" lines={2}>
            {titleOf(a)}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={st.tone}>{st.label}</Badge>
            {a.createdBy !== me?.user.id && a.createdByName ? (
              <T size={12.5} color={colors.muted}>
                Giren: {a.createdByName}
              </T>
            ) : null}
          </View>
          {a.approvalStatus === 'rejected' && a.reviewNote ? (
            <T size={13} color={colors.danger}>
              Düzeltme notu: {a.reviewNote}
            </T>
          ) : null}
        </View>
        {canAct && a.approvalStatus === 'approved' && p !== 'expired' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink }}>Panolarda yayında</Text>
            <Switch value={a.isActive} onValueChange={(v) => onToggle(a, v)} {...switchColors()} accessibilityLabel="Panolarda yayında" />
          </View>
        )}
        {canAct && action('create-outline', 'Düzenle', () => (onClose(), router.push(`/duyuru-yeni?duzenle=${a.id}`)))}
        {action('albums-outline', 'Benzerini oluştur', () => (onClose(), router.push(`/duyuru-yeni?kopya=${a.id}`)))}
        {canAct && (
          <Button variant="delete" icon="trash-outline" onPress={() => onDelete(a)}>
            Sil
          </Button>
        )}
      </View>
    </Sheet>
  );
}

/** Duyuru yetkisi olmayan öğretmen: panolarda şu an yayında olanlar; dokununca büyük görünür */
function OnAir({ list }: { list: Announcement[] }) {
  const screens = useScreens();
  const [open, setOpen] = useState<Announcement | null>(null);
  const now = Date.now();
  const live = list.filter((a) => phaseOf(a, now) === 'live');
  const screenName = (id: string) => screens.data?.find((s) => s.id === id)?.name ?? 'Pano';
  if (!live.length)
    return (
      <Card>
        <Empty icon="megaphone-outline" title="Şu an panolarda duyuru yok" text="Panoya duyuru eklemek isterseniz okul yöneticinizden Duyurular yetkisi isteyin." />
      </Card>
    );
  return (
    <>
      <Section title="Panolarda şu an" count={live.length}>
        {live.map((a) => (
          <Row key={a.id} a={a} sub={meta(a, screenName, now)} onPress={() => setOpen(a)} />
        ))}
      </Section>
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)}>
        {open && (
          <View style={{ gap: 10 }}>
            <View style={{ borderRadius: 14, overflow: 'hidden' }}>
              <AnnouncementPreview kind={open.kind} title={open.title} body={open.body} imageUrl={open.imageUrl} design={open.design} youtubeUrl={open.youtubeUrl} height={200} />
            </View>
            <T size={17} weight="800">
              {titleOf(open)}
            </T>
            {open.body ? <T color={colors.muted}>{open.body}</T> : null}
          </View>
        )}
      </Sheet>
    </>
  );
}

export default function Duyurular() {
  const { me, can: canRaw, role, school } = useAuth();
  // Öğretmen görünümünde duyurular her zaman yalnızca okunur (yetkisi olsa da): yayındaki duyurular ve içerikleri
  const can = (p: Parameters<typeof canRaw>[0]) => role !== 'teacher' && canRaw(p);
  const manages = can('announcements.manage');
  const approver = can('announcements.approve');
  const list = useAnnouncements();
  const drafts = useAnnouncementDrafts(manages);
  const screens = useScreens();
  const path = useSchoolPath('announcements');
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [showExpired, setShowExpired] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const myId = me?.user.id;
  const screenName = (id: string) => screens.data?.find((s) => s.id === id)?.name ?? 'Pano';
  // Başkasının duyurusunda işlem (yayın, düzenleme, silme) yalnızca onay yetkisi olana; herkes kendi duyurusunda
  const canAct = (a: Announcement) => approver || a.createdBy === myId;
  const refresh = () => Promise.all(['announcements', 'control-center'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));

  const toggle = async (a: Announcement, v: boolean) => {
    setError(null);
    setSelected((s) => (s && s.id === a.id ? { ...s, isActive: v } : s));
    try {
      await api(`${path}/${a.id}`, { method: 'PATCH', body: { isActive: v } });
    } catch {
      setError('Yayın durumu değiştirilemedi.');
    }
    await refresh();
  };
  const remove = (a: Announcement) =>
    void confirm('Duyuru silinsin mi?', `"${titleOf(a)}" panolardan kalkar ve kalıcı olarak silinir.`, 'Sil').then(async (ok) => {
      if (!ok) return;
      setSelected(null);
      try {
        await api(`${path}/${a.id}`, { method: 'DELETE' });
      } catch {
        setError('Duyuru silinemedi.');
      }
      await refresh();
    });

  const all = list.data ?? [];
  const rows = tab === 'mine' ? all.filter((a) => a.createdBy === myId) : all;
  const byPhase = (p: Phase) => rows.filter((a) => phaseOf(a, now) === p);
  // İlgilenmeniz gerekenler: kendi onay bekleyen / düzeltme istenen duyurularınız; başkalarınınki onaylayıcıya
  // Onaylar sekmesinde (burada yalnızca sayısı ve bağlantı), diğer yetkililere "Onay bekleyenler" olarak görünür
  const mineAttention = byPhase('attention').filter((a) => a.createdBy === myId);
  const othersPending = byPhase('attention').filter((a) => a.createdBy !== myId);
  const draftCount = drafts.data?.length ?? 0;

  const sub = (a: Announcement) => {
    const m = meta(a, screenName, now);
    return a.createdBy !== myId && a.createdByName ? `${m} · ${a.createdByName}` : m;
  };

  return (
    <Screen
      title="Duyurular"
      refreshing={list.isRefetching}
      onRefresh={() => void Promise.all([list.refetch(), manages ? drafts.refetch() : null])}
      right={
        manages ? (
          <Button size="sm" icon="add" onPress={() => router.push('/duyuru-yeni')}>
            Yeni
          </Button>
        ) : undefined
      }
    >
      {manages && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'mine', label: 'Yayınladıklarım' },
            { value: 'drafts', label: 'Taslaklar', badge: draftCount },
          ]}
        />
      )}
      {error && <T color={colors.danger}>{error}</T>}
      {list.isLoading ? (
        <Loading />
      ) : !manages ? (
        <OnAir list={all} />
      ) : tab === 'drafts' ? (
        <Drafts list={drafts.data ?? []} />
      ) : !rows.length ? (
        <Card>
          <Empty icon="megaphone-outline" title={tab === 'mine' ? 'Henüz duyuru göndermediniz' : 'Henüz duyuru yok'} text="Veli toplantısı, gezi, sınav gibi hazır şablonlarla bir dakikada duyuru hazırlayın." />
          <Button icon="add" onPress={() => router.push('/duyuru-yeni')}>
            Yeni duyuru
          </Button>
        </Card>
      ) : (
        <>
          {(mineAttention.length > 0 || (approver && othersPending.length > 0)) && (
            <Section title="İlgilenmeniz gerekenler" count={mineAttention.length + (approver ? othersPending.length : 0)}>
              {approver && othersPending.length > 0 && (
                <Pressable accessibilityRole="button" onPress={() => router.push('/onaylar')}>
                  <Card tone="warning" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
                    <Icon name="checkmark-done-outline" size={20} color={colors.warning} />
                    <T weight="700" style={{ flex: 1 }}>
                      {othersPending.length} duyuru onayınızı bekliyor
                    </T>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.brand }}>Onaylar'da incele ›</Text>
                  </Card>
                </Pressable>
              )}
              {mineAttention.map((a) => (
                <Row key={a.id} a={a} sub={sub(a)} badge={statusOf(a, now)} onPress={() => setSelected(a)} />
              ))}
            </Section>
          )}
          {!approver && othersPending.length > 0 && (
            <Section title="Onay bekleyenler" count={othersPending.length}>
              {othersPending.map((a) => (
                <Row key={a.id} a={a} sub={sub(a)} badge={statusOf(a, now)} onPress={() => setSelected(a)} />
              ))}
            </Section>
          )}
          {byPhase('live').length > 0 && (
            <Section title="Panolarda şu an" count={byPhase('live').length}>
              {byPhase('live').map((a) => (
                <Card key={a.id} style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${titleOf(a)}: işlemler`} onPress={() => setSelected(a)}>
                    <AnnouncementPreview kind={a.kind} title={a.title} body={a.body} imageUrl={a.imageUrl} design={a.design} youtubeUrl={a.youtubeUrl} height={110} />
                  </Pressable>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setSelected(a)}>
                      <T weight="700" lines={1}>
                        {titleOf(a)}
                      </T>
                      <T size={12} color={colors.muted} lines={2}>
                        {sub(a)}
                      </T>
                    </Pressable>
                    {canAct(a) && <Switch value={a.isActive} onValueChange={(v) => void toggle(a, v)} {...switchColors()} accessibilityLabel={`${titleOf(a)}: panolarda yayında`} />}
                  </View>
                </Card>
              ))}
            </Section>
          )}
          {byPhase('scheduled').length > 0 && (
            <Section title="Planlandı" count={byPhase('scheduled').length}>
              {byPhase('scheduled').map((a) => (
                <Row key={a.id} a={a} sub={sub(a)} onPress={() => setSelected(a)} />
              ))}
            </Section>
          )}
          {byPhase('off').length > 0 && (
            <Section title="Yayında değil" count={byPhase('off').length}>
              {byPhase('off').map((a) => (
                <Row key={a.id} a={a} sub={sub(a)} onPress={() => setSelected(a)} />
              ))}
            </Section>
          )}
          {byPhase('expired').length > 0 && (
            <Section
              title="Süresi bitenler"
              count={byPhase('expired').length}
              right={
                <Pressable accessibilityRole="button" onPress={() => setShowExpired((x) => !x)} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.brand }}>{showExpired ? 'Gizle' : 'Göster ›'}</Text>
                </Pressable>
              }
            >
              {showExpired && byPhase('expired').map((a) => <Row key={a.id} a={a} sub={sub(a)} onPress={() => setSelected(a)} />)}
            </Section>
          )}
        </>
      )}
      <ActionSheet a={selected} canAct={selected ? canAct(selected) : false} onClose={() => setSelected(null)} onToggle={(a, v) => void toggle(a, v)} onDelete={remove} />
    </Screen>
  );
}
