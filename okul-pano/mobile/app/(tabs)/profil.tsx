import type { Permission } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { useAuth, type AppRole } from '../../src/auth.tsx';
import { useInbox, useMyLeaves } from '../../src/data.ts';
import { initials, useOpenSchool } from '../../src/platform.tsx';
import { registerForPush } from '../../src/push.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Chip, ListRow, Screen, SectionTitle, T, type IconName } from '../../src/ui.tsx';

interface Item {
  title: string;
  subtitle?: string;
  icon: IconName;
  tone?: 'primary' | 'warning' | 'danger' | 'gold' | 'muted';
  to?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}

const ROLE_LABEL: Record<AppRole, string> = {
  platform: 'Platform yöneticisi',
  owner: 'Okul sahibi',
  admin: 'Yönetici',
  editor: 'Editör',
  teacher: 'Öğretmen',
};

/** İçerik türleri ve onları açan yetki (Menü › İçerik; editörde yalnız verilenler) */
const CONTENT: { tur: string; title: string; subtitle: string; icon: IconName; permission: Permission }[] = [
  { tur: 'ticker', title: 'Kayan yazı', subtitle: 'Tek satır ekle, kapat', icon: 'reorder-three-outline', permission: 'ticker.manage' },
  {
    tur: 'achievements',
    title: 'Başarılar ve ayın öğrencisi',
    subtitle: 'Kamerayla fotoğraf çek, panoya gönder',
    icon: 'trophy-outline',
    permission: 'highlights.manage',
  },
  { tur: 'events', title: 'Etkinlik takvimi', subtitle: 'Kulüp ve okul etkinlikleri', icon: 'calendar-number-outline', permission: 'highlights.manage' },
  { tur: 'exams', title: 'Sınav sayacı', subtitle: 'Sınav ekle ve düzenle', icon: 'school-outline', permission: 'exams.manage' },
  { tur: 'books', title: 'Haftanın kitabı', subtitle: 'Kapağı kamerayla çek', icon: 'book-outline', permission: 'highlights.manage' },
];

/**
 * Menü: role göre bölümler (okul yönetimi, içerik, öğretmen araçları, okul) ve herkes için Hesabım
 * (profil, şifre, bildirimler, çıkış). Alt menüye sığmayan her şey buradadır.
 */
export default function Menu() {
  const { me, school, role, can, isTeacher, selectSchool, setPlatformMode, signOut } = useAuth();
  const openSchool = useOpenSchool();
  const inbox = useInbox('unread');
  const leaves = useMyLeaves();
  const [push, setPush] = useState<string | null>(null);
  const pendingLeaves = (leaves.data ?? []).filter((l) => l.approvalStatus === 'pending').length;
  const unread = inbox.data?.unread ?? 0;
  const managerial = role === 'owner' || role === 'admin';

  const sections: { title: string; items: Item[] }[] = [];

  if (role === 'platform') {
    const own = me?.schools.filter((s) => !s.support) ?? [];
    const support = me?.schools.filter((s) => s.support) ?? [];
    sections.push({
      title: 'Okulum · süper kullanıcı',
      items: [
        ...own.map(
          (s): Item => ({ title: s.name, subtitle: 'Okulumu aç · her şey açık', icon: 'swap-horizontal-outline', onPress: () => void openSchool(s.id) }),
        ),
        {
          title: 'Destek erişimi olan okullar',
          subtitle: support.length ? `${support.length} okul · müdür onayıyla, süreli` : 'Şu an yok',
          icon: 'key-outline',
          to: '/okullar',
        },
      ],
    });
    sections.push({
      title: 'Platform',
      items: [
        { title: 'Okullar ve abonelikler', subtitle: 'Paketler, pano sayısı, deneme süreleri', icon: 'business-outline', to: '/okullar' },
        { title: 'Kayıt onayları', subtitle: 'E-postası doğrulanmamış başvurular', icon: 'checkmark-done-outline', to: '/' },
        { title: 'MEB çalışma takvimi', subtitle: 'Tara · onayla', icon: 'calendar-outline', to: '/takvim' },
      ],
    });
  }

  if (me?.user.isSuperAdmin && role !== 'platform') {
    sections.push({
      title: 'Platform',
      items: [
        {
          title: 'Platform görünümüne dön',
          subtitle: 'Okullar, kayıtlar, MEB takvimi',
          icon: 'grid-outline',
          onPress: () => void setPlatformMode(true).then(() => router.replace('/')),
        },
      ],
    });
  }

  if (managerial) {
    sections.push({
      title: 'Okul yönetimi',
      items: [
        {
          title: 'Kullanıcılar ve yetkiler',
          subtitle: role === 'owner' ? 'Davet · yönetici ve editör ata · yetki ver' : 'Davet · editör ekle ve yetki ver',
          icon: 'people-outline',
          to: '/kullanicilar',
        },
        ...(role === 'owner' && !school?.support && !me?.user.isSuperAdmin
          ? [
              {
                title: 'Destek erişimi',
                subtitle: 'Platform desteğine 24 saat ya da 7 gün onay ver, kapat',
                icon: 'key-outline' as IconName,
                tone: 'gold' as const,
                to: '/destek',
              },
            ]
          : []),
        { title: 'Tatil takvimi', subtitle: 'MEB takvimi, bayramlar, köprü günleri', icon: 'sunny-outline', to: '/tatiller' },
        { title: 'Etkinlik geçmişi', subtitle: 'Kim ne zaman neyi değiştirdi', icon: 'time-outline', tone: 'muted', to: '/gecmis' },
      ],
    });
  }

  if (role !== 'platform') {
    const content = CONTENT.filter((c) => can(c.permission)).map((c): Item => ({ title: c.title, subtitle: c.subtitle, icon: c.icon, to: `/icerik/${c.tur}` }));
    if (can('announcements.manage'))
      content.unshift({ title: 'Duyurular ve yayın akışı', subtitle: 'Yeni duyuru, yayındakiler', icon: 'megaphone-outline', to: '/yayin-akisi' });
    if (content.length && role !== 'teacher') {
      if (can('students.manage') || managerial)
        content.push({ title: 'Doğum günleri', subtitle: 'Bugün doğum günü olanlar', icon: 'gift-outline', to: '/dogum-gunleri' });
      sections.push({ title: role === 'editor' ? 'İçerik (yetkileriniz)' : 'İçerik', items: content });
    }
  }

  if (isTeacher && role !== 'platform') {
    sections.push({
      title: 'Öğretmen araçlarım',
      items: [
        { title: 'Ders programım ve zil saatleri', subtitle: 'Haftalık program, bugünün zilleri', icon: 'time-outline', to: '/programim' },
        ...(role === 'editor'
          ? [{ title: 'Nöbetlerim', subtitle: 'Bu hafta ve yerine görevlendirmeler', icon: 'shield-checkmark-outline' as IconName, to: '/nobet' }]
          : []),
        {
          title: role === 'teacher' ? 'İzinlerim' : 'İzin bildir',
          subtitle: pendingLeaves ? `${pendingLeaves} bildirim onay bekliyor` : 'Onay durumu',
          icon: 'calendar-clear-outline',
          to: role === 'teacher' ? '/izinlerim' : '/izin',
        },
        { title: 'Telefon takvimine ekle', subtitle: 'Nöbetler ve sınavlar takviminize', icon: 'calendar-outline', to: '/takvime-ekle' },
      ],
    });
  }

  if (role === 'editor' || role === 'teacher') {
    sections.push({
      title: 'Okul',
      items: [
        { title: 'Tatil takvimi', subtitle: 'Ara tatil, yarıyıl, bayramlar', icon: 'sunny-outline', to: '/tatiller' },
        { title: 'Sınavlar ve etkinlikler', subtitle: 'Yaklaşan sınav ve etkinlikler', icon: 'school-outline', to: '/yaklasanlar' },
        { title: 'Bugün doğum günü olanlar', subtitle: 'Öğrencilerimiz', icon: 'gift-outline', to: '/dogum-gunleri' },
      ],
    });
  }

  sections.push({
    title: 'Hesabım',
    items: [
      { title: 'Profil bilgilerim', subtitle: 'Ad soyad, e-posta', icon: 'person-outline', tone: 'muted', to: '/hesap/profil' },
      { title: 'Şifre değiştir', subtitle: 'Diğer cihazlardaki oturumlar kapanır', icon: 'lock-closed-outline', tone: 'muted', to: '/hesap/sifre' },
      {
        title: 'Bildirimler',
        subtitle: 'Okunanlar dahil geçmiş',
        icon: 'notifications-outline',
        tone: 'muted',
        to: '/bildirimler',
        right: unread ? <Badge tone="danger">{String(unread)}</Badge> : undefined,
      },
      ...(Platform.OS !== 'web'
        ? [
            {
              title: 'Telefon bildirimlerini aç',
              subtitle: push ?? 'Onaylar, nöbet hatırlatmaları',
              icon: 'phone-portrait-outline' as IconName,
              tone: 'muted' as const,
              onPress: () =>
                void registerForPush().then((r) =>
                  setPush(
                    r === 'ok'
                      ? 'Açık: bu telefon bildirim alacak.'
                      : r === 'local'
                        ? 'İzin verildi: nöbet hatırlatmaları çalışır. Onay ve acil durum bildirimleri için bildirim hizmeti henüz kurulmadı.'
                        : r === 'denied'
                          ? 'İzin verilmedi: telefon ayarlarından Okul Yayın için bildirimleri açın.'
                          : 'Bu cihazda kullanılamıyor.',
                  ),
                ).catch(() => setPush('Kaydedilemedi: internet bağlantınızı kontrol edip yeniden deneyin.')),
            },
          ]
        : []),
    ],
  });

  const schoolChoices = role === 'platform' ? [] : (me?.schools ?? []);

  return (
    <Screen title="Menü" back={role !== 'teacher'}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{initials(me?.user.fullName ?? '')}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T size={17} weight="800" lines={1}>
            {me?.user.fullName}
          </T>
          <T size={13} color={colors.muted} lines={1}>
            {me?.user.email}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <Badge tone={role === 'platform' ? 'primary' : 'muted'}>{ROLE_LABEL[role]}</Badge>
            {isTeacher && role !== 'teacher' && role !== 'platform' && <Badge tone="muted">Öğretmen</Badge>}
            {school?.support && role !== 'platform' && <Badge tone="warning">Destek erişimi</Badge>}
          </View>
          {role !== 'platform' && school && (
            <T size={12} color={colors.muted} lines={1}>
              {school.name}
            </T>
          )}
        </View>
      </Card>

      {schoolChoices.length > 1 && (
        <>
          <SectionTitle>Okul</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {schoolChoices.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === school?.id} onPress={() => void selectSchool(s.id)} />
            ))}
          </View>
        </>
      )}

      {sections.map((s) => (
        <View key={s.title} style={{ gap: 6 }}>
          <SectionTitle>{s.title}</SectionTitle>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {s.items.map((it, i) => (
              <ListRow
                key={it.title}
                icon={it.icon}
                iconTone={it.tone ?? 'primary'}
                title={it.title}
                subtitle={it.subtitle}
                right={it.right}
                onPress={it.onPress ?? (it.to ? () => router.push(it.to as never) : undefined)}
                last={i === s.items.length - 1}
              />
            ))}
          </Card>
        </View>
      ))}

      {role === 'platform' && (
        <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
          Kendi okulunuzda her şey açık. Diğer okullara yalnızca müdürün onayladığı süreli destek erişimiyle girersiniz.
        </T>
      )}

      <Button variant="secondary" icon="log-out-outline" onPress={() => void signOut()} style={{ borderColor: '#f5c2c2' }}>
        Çıkış yap
      </Button>
    </Screen>
  );
}
