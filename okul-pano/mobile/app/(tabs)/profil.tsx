import type { Permission } from '@okulpano/shared/permissions';
import { reminderSummary, useReminderSettings } from '../../src/reminders.ts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { membershipLabel, useAuth, type AppRole } from '../../src/auth.tsx';
import { useInbox, useInternshipAccess, useMyLeaves } from '../../src/data.ts';
import { useOpenSchool } from '../../src/platform.tsx';
import { PUSH_TEXT, pushStatus, registerForPush, type PushState } from '../../src/push.ts';
import { colors, radius, tiles, type TileTone } from '../../src/theme.ts';
import { Avatar, Badge, BentoRow, Card, Chip, Icon, ListRow, Screen, SectionTitle, Segmented, T, type IconName } from '../../src/ui.tsx';
import { useThemeMode } from '../../src/themeMode.tsx';

interface Item {
  title: string;
  subtitle?: string;
  icon: IconName;
  tile?: { icon: IconName; tone: TileTone };
  tone?: 'primary' | 'warning' | 'danger' | 'gold' | 'muted';
  to?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}

const ROLE_LABEL: Record<AppRole, string> = {
  platform: 'Platform yöneticisi',
  owner: 'Okul müdürü',
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

const TILE_CYCLE: TileTone[] = ['sky', 'peach', 'mint', 'lilac', 'sun', 'rose'];

type Tile = { icon: IconName; tone: TileTone };
/** Menü simgeleri renkli kutuda: önce başlığa, yoksa simge adına göre (her rolün menüsü kendi maddelerini gösterir) */
const TILE_BY_TITLE: Record<string, Tile> = {
  'Ders programım': { icon: 'time-outline', tone: 'sky' },
  'Sınav takvimi': { icon: 'clipboard-check', tone: 'rose' },
  'Nöbet hatırlatmaları': { icon: 'alarm', tone: 'peach' },
  'Nöbetlerim': { icon: 'shield-checkmark-outline', tone: 'peach' },
  'İzinlerim': { icon: 'calendar-user', tone: 'mint' },
  'İzin bildir': { icon: 'calendar-plus', tone: 'mint' },
  'Telefon takvimine ekle': { icon: 'calendar-share', tone: 'sky' },
  'İşletmede devam': { icon: 'clipboard-check', tone: 'sky' },
  'İşletmelerim': { icon: 'factory', tone: 'peach' },
  'Etkinlik geçmişi': { icon: 'history', tone: 'paper' },
  'Tatil takvimi': { icon: 'beach', tone: 'sun' },
  'MEB çalışma takvimi': { icon: 'calendar-number-outline', tone: 'sky' },
  'Destek erişimi': { icon: 'lock-access', tone: 'sun' },
  'Destek erişimi olan okullar': { icon: 'key-outline', tone: 'sun' },
  'Platform görünümüne dön': { icon: 'compass', tone: 'lilac' },
  Abonelikler: { icon: 'building-community', tone: 'sky' },
  'Kayıt onayları': { icon: 'checkmark-circle-outline', tone: 'mint' },
  'Sınavlar ve etkinlikler': { icon: 'school-outline', tone: 'lilac' },
};
const TILE_BY_ICON: Partial<Record<IconName, Tile>> = {
  'swap-horizontal-outline': { icon: 'swap-horizontal-outline', tone: 'sky' },
  'people-outline': { icon: 'people-outline', tone: 'sky' },
  'clipboard-outline': { icon: 'clipboard-text', tone: 'mint' },
  'heart-outline': { icon: 'heart-outline', tone: 'rose' },
  'megaphone-outline': { icon: 'megaphone-outline', tone: 'peach' },
  'reorder-three-outline': { icon: 'message', tone: 'sky' },
  'trophy-outline': { icon: 'trophy-outline', tone: 'sun' },
  'calendar-number-outline': { icon: 'calendar-number-outline', tone: 'lilac' },
  'school-outline': { icon: 'hourglass-outline', tone: 'lilac' },
  'book-outline': { icon: 'book-outline', tone: 'mint' },
  'gift-outline': { icon: 'cake', tone: 'rose' },
  'notifications-outline': { icon: 'notifications-outline', tone: 'sun' },
  'person-outline': { icon: 'person-outline', tone: 'paper' },
  'phone-portrait-outline': { icon: 'phone-portrait-outline', tone: 'paper' },
  'business-outline': { icon: 'building-community', tone: 'sky' },
  'calendar-outline': { icon: 'calendar-outline', tone: 'sky' },
  'grid-outline': { icon: 'compass', tone: 'lilac' },
  'key-outline': { icon: 'key-outline', tone: 'sun' },
  'sunny-outline': { icon: 'beach', tone: 'sun' },
  'shield-checkmark-outline': { icon: 'shield-checkmark-outline', tone: 'peach' },
  'time-outline': { icon: 'time-outline', tone: 'sky' },
};
const tileFor = (it: Item): Tile | undefined => it.tile ?? TILE_BY_TITLE[it.title] ?? TILE_BY_ICON[it.icon];

/** Koyu profil kutusu: renkli baş harf rozeti, ad, e-posta, rol hapları ve okul; dokununca profil bilgileri */
function ProfileTile({ name, email, school, badges }: { name: string; email: string; school?: string | null; badges: string[] }) {
  const t = tiles.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, profil bilgilerim`}
      onPress={() => router.push('/hesap/profil')}
      style={({ pressed }) => ({ backgroundColor: t.bg, borderRadius: radius.xl, padding: 18, gap: 16, opacity: pressed ? 0.92 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={name} size={58} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: '#fff' }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: t.sub, marginTop: 2 }} numberOfLines={1}>
            {email}
          </Text>
        </View>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow-forward" size={16} color="#fff" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {badges.map((b, i) => (
          <View key={b} style={{ backgroundColor: i === 0 ? '#fde68a' : t.chip, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: i === 0 ? '#713f12' : '#fff' }}>{b}</Text>
          </View>
        ))}
        {school ? (
          <Text style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: t.sub, marginLeft: 4 }} numberOfLines={1}>
            {school}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Menünün öne çıkan bölümündeki renkli kutu: simge, başlık ve kısa açıklama */
function MenuTile({ item, tone }: { item: Item; tone: TileTone }) {
  const t = tiles[tone];
  const onPress = item.onPress ?? (item.to ? () => router.push(item.to as never) : undefined);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.title, item.subtitle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, backgroundColor: t.bg, borderRadius: radius.lg, padding: 14, minHeight: 124, gap: 12, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={tileFor(item)?.icon ?? item.icon} size={21} color={t.fg} />
      </View>
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.3, color: t.fg }} numberOfLines={2}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.sub }} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Menü: role göre bölümler (okul yönetimi, içerik, öğretmen araçları, okul) ve herkes için Hesabım
 * (profil, şifre, bildirimler, çıkış). Alt menüye sığmayan her şey buradadır.
 */
export default function Menu() {
  const { me, school, role, can, isTeacher, selectSchool, setPlatformMode, signOut } = useAuth();
  const openSchool = useOpenSchool();
  const theme = useThemeMode();
  const inbox = useInbox('unread');
  const leaves = useMyLeaves();
  const internship = useInternshipAccess();
  const [push, setPush] = useState<PushState | 'error' | null>(null);
  const [reminders] = useReminderSettings();
  // Menüye her girişte telefonun gerçek izin durumu okunur (açıldıysa açık görünür)
  useEffect(() => {
    void pushStatus().then(setPush).catch(() => undefined);
  }, []);
  const pendingLeaves = (leaves.data ?? []).filter((l) => l.approvalStatus === 'pending').length;
  const unread = inbox.data?.unread ?? 0;
  const managerial = role === 'owner' || role === 'admin';

  const sections: { title: string; items: Item[] }[] = [];

  if (role === 'platform') {
    const own = me?.schools.filter((s) => !s.support) ?? [];
    const support = me?.schools.filter((s) => s.support) ?? [];
    sections.push({
      title: 'Okullarım',
      items: [
        ...own.map(
          (s): Item => ({ title: s.name, subtitle: `${membershipLabel(s)} görünümüne geç`, icon: 'swap-horizontal-outline', onPress: () => void openSchool(s.id) }),
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
        { title: 'Abonelikler', subtitle: 'Paketler, pano sayısı, deneme süreleri', icon: 'business-outline', to: '/okullar' },
        { title: 'Kayıt onayları', subtitle: 'E-postası doğrulanmamış başvurular', icon: 'checkmark-done-outline', to: '/kayit-onaylari' },
        { title: 'MEB çalışma takvimi', subtitle: 'Tara · onayla', icon: 'calendar-outline', to: '/takvim' },
        { title: 'Destek talepleri', subtitle: 'Okul müdürü ve yöneticilerinden gelen sorun, öneri, soru', icon: 'lifebuoy', to: '/platform/destek' },
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

  // Gruplar web paneliyle aynı ad ve sırada: Pano · Takvim ve Ders · Personel · Öğrenciler · Mesleki eğitim ·
  // İletişim · Yönetim. Boş kalan grup görünmez.
  if (role !== 'platform') {
    const add = (title: string, items: (Item | false | undefined)[]) => {
      const list = items.filter((i): i is Item => Boolean(i));
      if (list.length) sections.push({ title, items: list });
    };
    const counsel = can('conduct.counsel') || can('conduct.manage');
    const content = role === 'teacher' ? [] : CONTENT.filter((c) => can(c.permission)).map((c): Item => ({ title: c.title, subtitle: c.subtitle, icon: c.icon, to: `/icerik/${c.tur}` }));
    add('Pano', [
      role !== 'teacher' && can('announcements.manage') && { title: 'Duyurular ve yayın akışı', subtitle: 'Yeni duyuru, yayındakiler', icon: 'megaphone-outline', to: '/yayin-akisi' },
      ...content,
    ]);
    add('Takvim ve Ders', [
      isTeacher && { title: 'Ders programım', subtitle: 'Haftalık ders programı', icon: 'time-outline', to: '/programim' },
      (managerial || isTeacher) && {
        title: 'Sınav takvimi',
        subtitle: isTeacher && !managerial ? 'Gözetmen olduğunuz ve dersinizin sınavları' : 'Sınıfların yazılı ve ortak sınavları',
        icon: 'clipboard-check',
        to: '/sinav-takvimi',
      },
      !managerial && { title: 'Sınavlar ve etkinlikler', subtitle: 'Yaklaşan sınav ve etkinlikler', icon: 'school-outline', to: '/yaklasanlar' },
      { title: 'Tatil takvimi', subtitle: 'MEB takvimi, ara tatil, bayramlar', icon: 'sunny-outline', to: '/tatiller' },
      isTeacher && { title: 'Telefon takvimine ekle', subtitle: 'Nöbetler ve sınavlar takviminize', icon: 'calendar-outline', to: '/takvime-ekle' },
    ]);
    add('Personel', [
      role === 'editor' && isTeacher && { title: 'Nöbetlerim', subtitle: 'Bu hafta ve yerine görevlendirmeler', icon: 'shield-checkmark-outline', to: '/nobet' },
      isTeacher && { title: 'Nöbet hatırlatmaları', subtitle: reminderSummary(reminders), icon: 'notifications-outline', to: '/hatirlatmalar' },
      isTeacher && {
        title: role === 'teacher' ? 'İzinlerim' : 'İzin bildir',
        subtitle: pendingLeaves ? `${pendingLeaves} bildirim onay bekliyor` : 'Onay durumu',
        icon: 'calendar-clear-outline',
        to: role === 'teacher' ? '/izinlerim' : '/izin',
      },
    ]);
    add('Öğrenciler', [
      // Öğretmen görünümünde Gözlem alt menüde
      role !== 'teacher' && (managerial || isTeacher || counsel) && { title: 'Gözlem', subtitle: 'Öğrencilere artı / eksi, öğrenci kartları', icon: 'clipboard-outline', to: '/gozlem' },
      (managerial || (role === 'editor' && counsel)) && { title: 'Rehberlik uyarıları', subtitle: 'Kısa sürede çok eksi alan öğrenciler', icon: 'heart-outline', to: '/rehberlik' },
      { title: 'Doğum günleri', subtitle: 'Bugün doğum günü olan öğrenciler', icon: 'gift-outline', to: '/dogum-gunleri' },
    ]);
    if (internship.data?.enabled && (internship.data.all || internship.data.coordinator || internship.data.teacher)) {
      add('Mesleki eğitim', [
        { title: 'İşletmede devam', subtitle: 'Aylık çizelge: X, D, İ, R, H, K, T · özürlü / özürsüz', icon: 'grid-outline', to: '/isletme-devam' },
        { title: 'İşletmelerim', subtitle: 'İşletme bilgileri, ekle, düzenle', icon: 'business-outline', to: '/isletme' },
      ]);
    }
    add('İletişim', [
      managerial
        ? { title: 'Okul sorunları', subtitle: 'Öğretmenlerin bildirdiği arıza, temizlik, ısınma…', icon: 'alert-triangle', to: '/sorunlar' }
        : { title: 'Sorun bildir', subtitle: 'Arıza, temizlik, ısınma… idareye iletin', icon: 'alert-triangle', to: '/sorunlar' },
      managerial && { title: 'Platforma yaz', subtitle: 'Okul Yayın ekibine sorun, öneri ya da soru', icon: 'lifebuoy', to: '/platforma-yaz' },
    ]);
    add('Yönetim', [
      (can('users.manage') || can('accounts.enroll')) && {
        title: 'Kişiler ve yetkiler',
        subtitle: can('users.manage') ? 'Hesap aç · rol ve görev ver · iş bölümü' : 'Öğretmen hesabı aç · onay bekleyenler',
        icon: 'people-outline',
        to: '/kullanicilar',
      },
      role === 'owner' && !school?.support && !me?.user.isSuperAdmin && {
        title: 'Destek erişimi',
        subtitle: 'Platform desteğine 24 saat ya da 7 gün onay ver, kapat',
        icon: 'key-outline',
        tone: 'gold',
        to: '/destek',
      },
      managerial && { title: 'Etkinlik geçmişi', subtitle: 'Kim ne zaman neyi değiştirdi', icon: 'time-outline', tone: 'muted', to: '/gecmis' },
    ]);
  }

  sections.push({
    title: 'Hesabım',
    items: [
      { title: 'Hesabım', subtitle: 'Ad soyad, e-posta, şifre', icon: 'person-outline', tone: 'muted', to: '/hesap/profil' },
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
              title: push === 'ok' || push === 'local' ? 'Telefon bildirimleri' : 'Telefon bildirimlerini aç',
              subtitle: push === 'error' ? 'Kaydedilemedi: internet bağlantınızı kontrol edip yeniden deneyin.' : push ? PUSH_TEXT[push] : 'Onaylar, nöbet hatırlatmaları',
              icon: 'phone-portrait-outline' as IconName,
              tone: 'muted' as const,
              right: push === 'ok' || push === 'local' ? <Badge tone="success">Açık</Badge> : push === 'off' || push === 'denied' ? <Badge tone="warning">Kapalı</Badge> : undefined,
              onPress: () => void registerForPush().then((r) => setPush(r === 'denied' ? 'denied' : r)).catch(() => setPush('error')),
            },
          ]
        : []),
    ],
  });

  const schoolChoices = role === 'platform' ? [] : (me?.schools ?? []);

  // Rolün ilk bölümü renkli kutular hâlinde (en sık kullanılanlar; tek kalan kutu tam genişlikte), geri kalanı liste
  const [featured, ...rest] = sections;

  return (
    <Screen title="Menü" back={role !== 'teacher'}>
      <ProfileTile
        name={me?.user.fullName ?? ''}
        email={me?.user.email ?? ''}
        school={role !== 'platform' ? school?.name : null}
        badges={[
          // Öğretmen kaydı bağlıysa kadrodaki ünvan (Müdür Yardımcısı, Uzman Öğretmen…), değilse rol
          role !== 'platform' && school?.teacherTitle ? school.teacherTitle : ROLE_LABEL[role],
          ...(isTeacher && role !== 'teacher' && role !== 'platform' && !school?.teacherTitle ? ['Öğretmen'] : []),
          ...(school?.support && role !== 'platform' ? ['Destek erişimi'] : []),
        ]}
      />

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

      {featured && featured !== sections[sections.length - 1] && (
        <View style={{ gap: 10 }}>
          <SectionTitle>{featured.title}</SectionTitle>
          {Array.from({ length: Math.ceil(featured.items.length / 2) }, (_, r) => featured.items.slice(r * 2, r * 2 + 2)).map((row, r) => (
            <BentoRow key={r}>
              {row.map((it, j) => (
                <MenuTile key={it.title} item={it} tone={TILE_CYCLE[(r * 2 + j) % TILE_CYCLE.length]} />
              ))}
            </BentoRow>
          ))}
        </View>
      )}

      {(featured === sections[sections.length - 1] ? sections : rest).map((s) => (
        <View key={s.title} style={{ gap: 6 }}>
          <SectionTitle>{s.title}</SectionTitle>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {s.items.map((it, i) => (
              <ListRow
                key={it.title}
                icon={it.icon}
                tile={tileFor(it)}
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
          Üyesi olduğunuz okullarda üyeliğinizdeki rolle çalışırsınız. Diğer okullara yalnızca müdürün onayladığı süreli destek erişimiyle girersiniz.
        </T>
      )}

      <View style={{ gap: 10 }}>
        <SectionTitle>Görünüm</SectionTitle>
        <Segmented
          value={theme.mode}
          onChange={theme.setMode}
          options={[
            { value: 'system', label: 'Sistem' },
            { value: 'light', label: 'Açık' },
            { value: 'dark', label: 'Koyu' },
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: radius.pill, backgroundColor: pressed ? colors.dangerBorder : colors.dangerSoft, marginTop: 4 })}
      >
        <Icon name="log-out-outline" size={20} color={colors.danger} />
        <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.danger }}>Çıkış yap</Text>
      </Pressable>
    </Screen>
  );
}
