import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../src/auth.tsx';
import { useAnnouncements, type Announcement } from '../../src/data.ts';
import { timeAgo } from '../../src/day.ts';
import { AnnouncementPreview } from '../../src/preview.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, Loading, Screen, SectionTitle, T } from '../../src/ui.tsx';

function status(a: Announcement): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  if (a.approvalStatus === 'pending') return { label: 'Onay bekliyor', tone: 'warning' };
  if (a.approvalStatus === 'rejected') return { label: 'Düzeltme istendi', tone: 'danger' };
  if (!a.isActive) return { label: 'Yayında değil', tone: 'muted' };
  if (a.endsAt && Date.parse(a.endsAt) <= Date.now()) return { label: 'Süresi bitti', tone: 'muted' };
  return { label: 'Panolarda yayında', tone: 'success' };
}

/** Öğretmenin duyuruları: gönderdikleri ve durumları (onay bekliyor, yayında, düzeltme istendi) */
export default function Duyurular() {
  const { me, can } = useAuth();
  const list = useAnnouncements();
  const mine = (list.data ?? []).filter((a) => a.createdBy === me?.user.id);
  return (
    <Screen
      title="Duyurularım"
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      right={
        can('announcements.manage') ? (
          <Button size="sm" icon="add" onPress={() => router.push('/duyuru-yeni')}>
            Yeni
          </Button>
        ) : undefined
      }
    >
      {list.isLoading ? (
        <Loading />
      ) : !can('announcements.manage') ? (
        <Card>
          <Empty icon="megaphone-outline" title="Duyuru ekleme yetkiniz yok" text="Panoya duyuru eklemek için okul yöneticinizden Duyurular yetkisi isteyin." />
        </Card>
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
