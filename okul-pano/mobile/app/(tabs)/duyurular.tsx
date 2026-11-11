import { designTitle, type AnnouncementDesign } from '@okulpano/shared/designs';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useAnnouncementDrafts, useAnnouncements, type Announcement, type AnnouncementDraft } from '../../src/data.ts';
import { fullDate, localIso, timeAgo } from '../../src/day.ts';
import { AnnouncementPreview } from '../../src/preview.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, confirm, DeleteIconButton, Empty, Loading, Screen, SectionTitle, Segmented, T } from '../../src/ui.tsx';

const DRAFT_STEPS = ['Tür', 'İçerik', 'Nerede ve ne zaman', 'Kontrol ve gönder'];
const DRAFT_KIND: Record<string, string> = { design: 'Hazır şablon', image: 'Fotoğraf', text: 'Yazı', video: 'YouTube' };

/** Taslaklar: yarım kalan duyurular (web ile ortak); "Devam et" kaldığı adımdan açar */
function Drafts({ list }: { list: AnnouncementDraft[] }) {
  const { school } = useAuth();
  const path = useSchoolPath('announcement-drafts');
  const qc = useQueryClient();
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
        // YouTube duyurusu yalnızca web panelinden eklenir
        const webOnly = x.kind === 'video';
        return (
          <Card key={d.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="700" lines={2}>
                  {title}
                </T>
                <T size={12} color={colors.muted}>
                  {DRAFT_KIND[x.kind ?? 'design']} · "{DRAFT_STEPS[Math.min(3, d.step)]}" adımında kaldı · {timeAgo(d.updatedAt)}
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
            {webOnly ? (
              <T size={12.5} color={colors.muted}>
                YouTube duyurusuna web panelinden devam edin.
              </T>
            ) : (
              <Button size="sm" onPress={() => router.push(`/duyuru-yeni?taslak=${d.id}`)}>
                Devam et
              </Button>
            )}
          </Card>
        );
      })}
    </>
  );
}

function status(a: Announcement): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  if (a.approvalStatus === 'pending') return { label: 'Onay bekliyor', tone: 'warning' };
  if (a.approvalStatus === 'rejected') return { label: 'Düzeltme istendi', tone: 'danger' };
  if (!a.isActive) return { label: 'Yayında değil', tone: 'muted' };
  if (a.endsAt && Date.parse(a.endsAt) <= Date.now()) return { label: 'Süresi bitti', tone: 'muted' };
  return { label: 'Panolarda yayında', tone: 'success' };
}

/** Duyuru yetkisi olmayan öğretmen: panolarda şu an yayında olan duyurular (okuma) */
function OnAir({ list }: { list: Announcement[] }) {
  const now = Date.now();
  const live = list.filter((a) => a.approvalStatus === 'approved' && a.isActive && (!a.startsAt || Date.parse(a.startsAt) <= now) && (!a.endsAt || Date.parse(a.endsAt) > now));
  if (!live.length)
    return (
      <Card>
        <Empty icon="megaphone-outline" title="Şu an panolarda duyuru yok" text="Panoya duyuru eklemek isterseniz okul yöneticinizden Duyurular yetkisi isteyin." />
      </Card>
    );
  return (
    <>
      <SectionTitle>Panolarda yayında</SectionTitle>
      {live.map((a) => (
        <Card key={a.id} style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          <AnnouncementPreview kind={a.kind} title={a.title} body={a.body} imageUrl={a.imageUrl} design={a.design} height={140} />
          <View style={{ padding: 14, gap: 4 }}>
            <T weight="700">{a.title}</T>
            {a.body ? (
              <T size={13} color={colors.muted}>
                {a.body}
              </T>
            ) : null}
            {a.endsAt ? (
              <T size={12} color={colors.muted}>
                {fullDate(localIso(new Date(a.endsAt)))} tarihine kadar
              </T>
            ) : null}
          </View>
        </Card>
      ))}
    </>
  );
}

/** Öğretmenin duyuruları: gönderdikleri ve durumları (onay bekliyor, yayında, düzeltme istendi) */
export default function Duyurular() {
  const { me, can: canRaw, role } = useAuth();
  // Öğretmen görünümünde duyurular her zaman yalnızca okunur (yetkisi olsa da): yayındaki duyurular ve içerikleri
  const can = (p: Parameters<typeof canRaw>[0]) => role !== 'teacher' && canRaw(p);
  const list = useAnnouncements();
  const mine = (list.data ?? []).filter((a) => a.createdBy === me?.user.id);
  const manages = can('announcements.manage');
  const drafts = useAnnouncementDrafts(manages);
  const draftCount = drafts.data?.length ?? 0;
  const [tab, setTab] = useState<'sent' | 'drafts'>('sent');
  return (
    <Screen
      title={can('announcements.manage') ? 'Duyurularım' : 'Duyurular'}
      refreshing={list.isRefetching}
      onRefresh={() => void Promise.all([list.refetch(), manages ? drafts.refetch() : null])}
      right={
        can('announcements.manage') ? (
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
            { value: 'sent', label: 'Gönderdiklerim' },
            { value: 'drafts', label: 'Taslaklar', badge: draftCount },
          ]}
        />
      )}
      {list.isLoading ? (
        <Loading />
      ) : manages && tab === 'drafts' ? (
        <Drafts list={drafts.data ?? []} />
      ) : !can('announcements.manage') ? (
        <OnAir list={list.data ?? []} />
      ) : !mine.length ? (
        <Card>
          <Empty icon="megaphone-outline" title="Henüz duyuru göndermediniz" text="Veli toplantısı, gezi, sınav gibi hazır şablonlarla bir dakikada duyuru hazırlayın." />
          <Button icon="add" onPress={() => router.push('/duyuru-yeni')}>
            Yeni duyuru
          </Button>
        </Card>
      ) : (
        <>
          <SectionTitle>Gönderdiklerim</SectionTitle>
          {mine.map((a) => {
            const st = status(a);
            return (
              <Card key={a.id} style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
                <AnnouncementPreview kind={a.kind} title={a.title} body={a.body} imageUrl={a.imageUrl} design={a.design} height={120} />
                <View style={{ padding: 14, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T weight="700" style={{ flex: 1 }} lines={2}>
                      {a.title}
                    </T>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </View>
                  {a.approvalStatus === 'rejected' && a.reviewNote && (
                    <T size={13} color={colors.danger}>
                      Not: {a.reviewNote}
                    </T>
                  )}
                  <T size={12} color={colors.muted}>
                    {timeAgo(a.createdAt)} · {a.screenIds?.length ? `${a.screenIds.length} pano` : 'tüm panolar'}
                  </T>
                </View>
              </Card>
            );
          })}
          <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
            Düzeltme istenen duyuruyu yönetim panelinden düzenleyip yeniden gönderebilirsiniz.
          </T>
        </>
      )}
    </Screen>
  );
}
