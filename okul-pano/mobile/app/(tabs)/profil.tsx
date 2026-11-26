import type { Permission } from '@okulpano/shared/permissions';
import { reminderSummary, useReminderSettings } from '../../src/reminders.ts';
import { router } from 'expo-router';
import { useState } from 'react';
import { AccountsSheet } from '../../src/accountsSheet.tsx';
import { switchAllowed } from '../../src/accounts.ts';
import { Platform, Pressable, View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { membershipLabel, useAuth, type AppRole } from '../../src/auth.tsx';
import { schoolFullName, shortTitle } from '@okulpano/shared';
import { useInternshipAccess, useMyLeaves } from '../../src/data.ts';
import { useOpenSchool } from '../../src/platform.tsx';
import { colors, radius, tiles, type TileTone } from '../../src/theme.ts';
import { Avatar, Badge, Card, Chip, Icon, ListRow, Screen, SectionTitle, Segmented, T, type IconName } from '../../src/ui.tsx';
import { useThemeMode } from '../../src/themeMode.tsx';
import { useTabBack } from '../../src/tabs.ts';

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
  İşletmeler: { icon: 'factory', tone: 'peach' },
  Öğrenciler: { icon: 'school-outline', tone: 'mint' },
  'Etkinlik geçmişi': { icon: 'history', tone: 'paper' },
  'Çalışma takvimi': { icon: 'calendar-week', tone: 'sun' },
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
          <Text style={{ flexBasis: '100%', fontSize: 12.5, fontWeight: '600', color: t.sub }} numberOfLines={2}>
            {school}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Menünün öne çıkan bölümündeki renkli kutu: simge, başlık ve kısa açıklama */
/**
 * Menü: role göre bölümler (okul yönetimi, içerik, öğretmen araçları, okul) ve herkes için Hesabım
 * (profil, şifre, bildirimler, çıkış). Alt menüye sığmayan her şey buradadır.
 */
export default function Menu() {
  const { me, school, role, can, isTeacher, selectSchool, setPlatformMode, signOut, accounts } = useAuth();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const back = useTabBack('profil');
  // Menü bütün ekranları listeler; alt menüde ya da ana sayfanın hızlı işlemlerinde olanlar da burada bulunur (12)
  const openSchool = useOpenSchool();
  const theme = useThemeMode();
  const leaves = useMyLeaves();
  const internship = useInternshipAccess();
  const [reminders] = useReminderSettings();
  const pendingLeaves = (leaves.data ?? []).filter((l) => l.approvalStatus === 'pending').length;
  const managerial = role === 'owner' || role === 'admin';

  const sections: { title: string; items: Item[] }[] = [];

  if (role === 'platform') {
    const own = me?.schools.filter((s) => !s.support) ?? [];
    const support = me?.schools.filter((s) => s.support) ?? [];
    // KVKK: platform hesabı okula üye olamaz. Kuraldan önce kalan üyelik varsa hesap ayrılır.
    if (own.length)
      sections.push({
        title: 'Hesap ayrımı',
        items: [
          {
            title: 'Platform hesabını ayır',
            subtitle: 'Okul üyeliği bu hesapta kalır, platform yeni e-postaya geçer',
            icon: 'swap-horizontal-outline',
            tone: 'gold',
            to: '/hesap/ayir',
          },
        ],
      });
    // Platform hesabının okulu yoktur: destek erişimi verilen okullar "Okullarım" değildir, Destek bölümündedir
    if (own.length)
      sections.push({
        title: 'Okullarım',
        items: own.map(
          (s): Item => ({ title: schoolFullName(s.name, s.schoolType), subtitle: `${membershipLabel(s)} görünümüne geç`, icon: 'swap-horizontal-outline', onPress: () => void openSchool(s.id) }),
        ),
      });
    sections.push({
      title: 'Destek',
      items: [
        {
          title: 'Destek erişimi olan okullar',
          icon: 'key-outline',
          right: support.length ? <Badge tone="primary">{String(support.length)}</Badge> : undefined,
          to: '/platform/destek-okullar',
        },
        { title: 'Destek talepleri', subtitle: 'Okul müdürü ve yöneticilerinden gelen sorun, öneri, soru', icon: 'lifebuoy', to: '/platform/destek' },
      ],
    });
    sections.push({
      title: 'Platform',
      items: [
        { title: 'Abonelikler', subtitle: 'Paketler, pano sayısı, deneme süreleri', icon: 'business-outline', to: '/okullar' },
        { title: 'Kayıt onayları', subtitle: 'E-postası doğrulanmamış başvurular', icon: 'checkmark-done-outline', to: '/kayit-onaylari' },
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

  // Gruplar web paneliyle aynı ad ve sırada: Pano · Takvim ve Ders · Personel · Öğrenci takibi · Mesleki eğitim ·
  // İletişim · Yönetim. Boş kalan grup görünmez.
  if (role !== 'platform') {
    const add = (title: string, items: (Item | false | undefined)[]) => {
      const list = items.filter((i): i is Item => Boolean(i));
      if (list.length) sections.push({ title, items: list });
    };
    const counsel = can('conduct.counsel') || can('conduct.manage');
    const content = CONTENT.filter((c) => can(c.permission)).map((c): Item => ({ title: c.title, subtitle: c.subtitle, icon: c.icon, to: `/icerik/${c.tur}` }));
    // Dersi ve nöbeti olan müdür / müdür yardımcısı: kendi programı ve nöbetleri Menü'nün başında
    const mine = managerial && isTeacher;
    if (mine)
      add('Derslerim ve nöbetlerim', [
        { title: 'Ders programım', subtitle: 'Haftalık ders programı', icon: 'time-outline', to: '/programim' },
        { title: 'Nöbetlerim', subtitle: 'Bu hafta ve yerine görevlendirmeler', icon: 'shield-checkmark-outline', to: '/nobet' },
      ]);
    add('Pano', [
      (can('announcements.approve') || can('leaves.manage')) && { title: 'Onaylar', subtitle: 'Onay bekleyen duyurular ve izinler', icon: 'checkmark-done-outline', to: '/onaylar' },
      (can('board.control') || can('screens.manage')) && { title: 'Panolar', subtitle: 'Açık / kapalı panolar, uzaktan komut', icon: 'tv-outline', to: '/panolar' },
      can('announcements.manage')
        ? { title: 'Duyurular', subtitle: 'Yayındakiler, onay bekleyenler, taslaklar', icon: 'megaphone-outline', to: '/duyurular' }
        : { title: 'Duyurular', subtitle: 'Panoda yayındaki duyurular', icon: 'megaphone-outline', to: '/duyurular' },
      ...content,
    ]);
    add('Takvim ve Ders', [
      isTeacher && !mine && { title: 'Ders programım', subtitle: 'Haftalık ders programı', icon: 'time-outline', to: '/programim' },
      (managerial || isTeacher) && {
        title: 'Sınav takvimi',
        subtitle: isTeacher && !managerial ? 'Gözetmen olduğunuz ve dersinizin sınavları' : 'Sınıfların yazılı ve ortak sınavları',
        icon: 'clipboard-check',
        to: '/sinav-takvimi',
      },
      can('schedule.manage') && { title: 'Zil saatleri', subtitle: 'Eğitim düzeni, günün zili, zil düzenleri', icon: 'notifications-outline', to: '/zil-saatleri' },
      !managerial && { title: 'Sınavlar ve etkinlikler', subtitle: 'Yaklaşan sınav ve etkinlikler', icon: 'school-outline', to: '/yaklasanlar' },
      { title: 'Çalışma takvimi', subtitle: 'Ders günleri, ara tatiller, bayramlar', icon: 'calendar-week', to: '/tatiller' },
      isTeacher && { title: 'Telefon takvimine ekle', subtitle: 'Nöbetler ve sınavlar takviminize', icon: 'calendar-outline', to: '/takvime-ekle' },
    ]);
    add('Personel', [
      isTeacher && !mine
        ? { title: 'Nöbetlerim', subtitle: 'Bu hafta ve yerine görevlendirmeler', icon: 'shield-checkmark-outline', to: '/nobet' }
        : can('duties.manage') && { title: 'Nöbet çizelgesi', subtitle: 'Bugünkü nöbetçiler ve haftalık çizelge', icon: 'shield-checkmark-outline', to: '/nobet?g=cizelge' },
      can('duties.manage') && { title: 'Ders görevlendirme', subtitle: 'İzinli öğretmenin dersleri ve nöbet yeri', icon: 'people-outline', to: '/gorevlendirme' },
      can('directory.manage') && { title: 'Öğretmen kadrosu', subtitle: 'Ad, branş, görev, iletişim · ekle, düzenle', icon: 'school-outline', to: '/kadro' },
      isTeacher && {
        title: role === 'teacher' ? 'İzinlerim' : 'İzin bildir',
        subtitle: pendingLeaves ? `${pendingLeaves} bildirim onay bekliyor` : 'Onay durumu',
        icon: 'calendar-clear-outline',
        to: role === 'teacher' ? '/izinlerim' : '/izin',
      },
    ]);
    add('Öğrenci takibi', [
      (managerial || isTeacher || counsel) && { title: 'Gözlem', subtitle: 'Öğrencilere artı / eksi, öğrenci kartları', icon: 'clipboard-outline', to: '/gozlem' },
      (managerial || counsel) && { title: 'Rehberlik uyarıları', subtitle: 'Kısa sürede çok eksi alan öğrenciler', icon: 'heart-outline', to: '/rehberlik' },
      { title: 'Doğum günleri', subtitle: 'Bugün doğum günü olan öğrenciler', icon: 'gift-outline', to: '/dogum-gunleri' },
    ]);
    // Yönetim, işaretli koordinatör öğretmen ve alan şefi görür; diğer öğretmenler görmez
    if (internship.data?.enabled && (internship.data.all || internship.data.teacher || internship.data.areaHead)) {
      // Sıra: İşletmeler · Öğrenciler · İşletmede devam · Formlar
      add('Mesleki eğitim', [
        { title: 'İşletmeler', subtitle: 'İşletme bilgileri, ekle, düzenle', icon: 'business-outline', to: '/isletme' },
        { title: 'Öğrenciler', subtitle: 'İşletmedeki öğrenciler, öğrenci ekle', icon: 'people-outline', to: '/isletme?sekme=ogrenciler' },
        { title: 'İşletmede devam', subtitle: 'Gün gün işaretleme ve aylık çizelge', icon: 'grid-outline', to: '/isletme-devam' },
        { title: 'Formlar', subtitle: 'Günlük rehberlik formu, devam çizelgesi, aylık rehberlik raporu', icon: 'print-outline', to: '/isletme?formlar=1' },
      ]);
    }
    add('İletişim', [
      managerial
        ? { title: 'Okul sorunları', subtitle: 'Öğretmenlerin bildirdiği arıza, temizlik, ısınma…', icon: 'alert-triangle', to: '/sorunlar' }
        : { title: 'Sorun bildir', subtitle: 'Arıza, temizlik, ısınma… idareye iletin', icon: 'alert-triangle', to: '/sorunlar' },
      (managerial || can('support.contact')) && { title: 'Platforma yaz', subtitle: 'Okul Yayın ekibine sorun, öneri ya da soru', icon: 'lifebuoy', to: '/platforma-yaz' },
    ]);
    add('Yönetim', [
      (can('users.manage') || can('accounts.enroll') || can('roles.assign')) && {
        title: 'Kişiler ve yetkiler',
        subtitle: can('users.manage') ? 'Hesap aç · rol ve görev ver · iş bölümü' : 'Öğretmen hesabı aç · onay bekleyenler',
        icon: 'people-outline',
        to: '/kullanicilar',
      },
      // Okulun ayarları tek yerde (webdeki Genel Ayarlar); destek erişimi de buradaki Destek kategorisinde
      (can('settings.manage') || Boolean(internship.data?.manage)) && {
        title: 'Genel ayarlar',
        subtitle: 'Okul, modüller, takvim ve zil, mesleki eğitim, destek…',
        icon: 'settings-outline',
        to: '/genel-ayarlar',
      },
      managerial && { title: 'Etkinlik geçmişi', subtitle: 'Kim ne zaman neyi değiştirdi', icon: 'time-outline', tone: 'muted', to: '/gecmis' },
    ]);
  }

  const schoolChoices = role === 'platform' ? [] : (me?.schools ?? []);

  // Bütün bölümler aynı liste düzeninde (12): ilk bölüm de kutu kutu değil

  return (
    <Screen title="Menü" back={back}>
      <ProfileTile
        name={me?.user.fullName ?? ''}
        email={me?.user.email ?? ''}
        school={role !== 'platform' && school ? schoolFullName(school.name, school.schoolType) : null}
        badges={
          // Destek erişimiyle açılan okulda kişi okulun üyesi değildir: okul rolü (Okul müdürü vb.) yazılmaz
          school?.support && role !== 'platform'
            ? ['Destek erişimi', 'Platform']
            : [
                // Öğretmen kaydı bağlıysa kadrodaki ünvan (Müdür Yardımcısı, Uzman Öğretmen…), değilse rol
                role !== 'platform' && school ? shortTitle(membershipLabel(school)) : ROLE_LABEL[role],
                ...(isTeacher && role !== 'teacher' && role !== 'platform' && !school?.teacherTitle ? ['Öğretmen'] : []),
              ]
        }
      />
      {/* Hızlı hesap geçişi (A): yalnızca platform yöneticisine açık; platform ve kendi okul hesabı arasında şifresiz geçiş */}
      {switchAllowed(accounts, me?.user.isSuperAdmin) && (
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <ListRow
          tile={{ icon: 'swap-horizontal-outline', tone: 'sky' }}
          title="Hesap değiştir"
          subtitle={accounts.length > 1 ? `${accounts.length} hesap kayıtlı` : 'Başka bir hesap ekleyin'}
          onPress={() => setAccountsOpen(true)}
          last
        />
      </Card>
      )}
      <AccountsSheet open={accountsOpen} onClose={() => setAccountsOpen(false)} />

      {schoolChoices.length > 1 && (
        <>
          <SectionTitle>Okul</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {schoolChoices.map((s) => (
              <Chip key={s.id} label={schoolFullName(s.name, s.schoolType)} selected={s.id === school?.id} onPress={() => void selectSchool(s.id)} />
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
                tile={tileFor(it)}
                iconTone={it.tone ?? 'primary'}
                title={it.title}
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

      <View style={{ gap: 6 }}>
        <SectionTitle>Uygulama ayarları</SectionTitle>
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <ListRow tile={{ icon: 'notifications-outline', tone: 'sun' }} title="Bildirimler" onPress={() => router.push('/hatirlatmalar')} />
          <ListRow tile={{ icon: 'shield-checkmark-outline', tone: 'lilac' }} title="Güvenlik" onPress={() => router.push('/hesap/guvenlik')} last />
        </Card>
      </View>

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
