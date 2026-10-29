import type { Permission } from "@okulpano/shared/permissions";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text } from "../../src/text.tsx";
import { useAuth, type AppRole } from "../../src/auth.tsx";
import { useInbox, useMyLeaves } from "../../src/data.ts";
import { useOpenSchool } from "../../src/platform.tsx";
import { registerForPush } from "../../src/push.ts";
import { colors, radius, tiles, type TileTone } from "../../src/theme.ts";
import {
  Avatar,
  Badge,
  BentoRow,
  Card,
  Chip,
  Icon,
  ListRow,
  Screen,
  SectionTitle,
  Segmented,
  T,
  type IconName,
} from "../../src/ui.tsx";
import { useThemeMode } from "../../src/themeMode.tsx";

interface Item {
  title: string;
  subtitle?: string;
  icon: IconName;
  tone?: "primary" | "warning" | "danger" | "gold" | "muted";
  to?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}

const ROLE_LABEL: Record<AppRole, string> = {
  platform: "Platform yöneticisi",
  owner: "Okul sahibi",
  admin: "Yönetici",
  editor: "Editör",
  teacher: "Öğretmen",
};

/** İçerik türleri ve onları açan yetki (Menü › İçerik; editörde yalnız verilenler) */
const CONTENT: {
  tur: string;
  title: string;
  subtitle: string;
  icon: IconName;
  permission: Permission;
}[] = [
  {
    tur: "ticker",
    title: "Kayan yazı",
    subtitle: "Tek satır ekle, kapat",
    icon: "reorder-three-outline",
    permission: "ticker.manage",
  },
  {
    tur: "achievements",
    title: "Başarılar ve ayın öğrencisi",
    subtitle: "Kamerayla fotoğraf çek, panoya gönder",
    icon: "trophy-outline",
    permission: "highlights.manage",
  },
  {
    tur: "events",
    title: "Etkinlik takvimi",
    subtitle: "Kulüp ve okul etkinlikleri",
    icon: "calendar-number-outline",
    permission: "highlights.manage",
  },
  {
    tur: "exams",
    title: "Sınav sayacı",
    subtitle: "Sınav ekle ve düzenle",
    icon: "school-outline",
    permission: "exams.manage",
  },
  {
    tur: "books",
    title: "Haftanın kitabı",
    subtitle: "Kapağı kamerayla çek",
    icon: "book-outline",
    permission: "highlights.manage",
  },
];

const TILE_CYCLE: TileTone[] = ["sky", "peach", "mint", "lilac", "sun", "rose"];

/** Koyu profil kutusu: renkli baş harf rozeti, ad, e-posta, rol hapları ve okul; dokununca profil bilgileri */
function ProfileTile({
  name,
  email,
  school,
  badges,
}: {
  name: string;
  email: string;
  school?: string | null;
  badges: string[];
}) {
  const t = tiles.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, profil bilgilerim`}
      onPress={() => router.push("/hesap/profil")}
      style={({ pressed }) => ({
        backgroundColor: t.bg,
        borderRadius: radius.xl,
        padding: 18,
        gap: 16,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={name} size={58} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              letterSpacing: -0.5,
              color: "#fff",
            }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: t.sub,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {email}
          </Text>
        </View>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: t.chip,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="arrow-forward" size={16} color="#fff" />
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        {badges.map((b, i) => (
          <View
            key={b}
            style={{
              backgroundColor: i === 0 ? "#fde68a" : t.chip,
              borderRadius: radius.pill,
              paddingHorizontal: 11,
              paddingVertical: 5,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: i === 0 ? "#713f12" : "#fff",
              }}
            >
              {b}
            </Text>
          </View>
        ))}
        {school ? (
          <Text
            style={{
              flexShrink: 1,
              fontSize: 12.5,
              fontWeight: "600",
              color: t.sub,
              marginLeft: 4,
            }}
            numberOfLines={1}
          >
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
  const onPress =
    item.onPress ?? (item.to ? () => router.push(item.to as never) : undefined);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.title, item.subtitle]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: t.bg,
        borderRadius: radius.lg,
        padding: 14,
        minHeight: 124,
        gap: 12,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: t.chip,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={item.icon} size={20} color={t.fg} />
      </View>
      <View style={{ gap: 3 }}>
        <Text
          style={{
            fontSize: 15,
            lineHeight: 19,
            fontWeight: "800",
            letterSpacing: -0.3,
            color: t.fg,
          }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text
            style={{
              fontSize: 12,
              lineHeight: 16,
              fontWeight: "600",
              color: t.sub,
            }}
            numberOfLines={2}
          >
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
  const {
    me,
    school,
    role,
    can,
    isTeacher,
    selectSchool,
    setPlatformMode,
    signOut,
  } = useAuth();
  const openSchool = useOpenSchool();
  const theme = useThemeMode();
  const inbox = useInbox("unread");
  const leaves = useMyLeaves();
  const [push, setPush] = useState<string | null>(null);
  const pendingLeaves = (leaves.data ?? []).filter(
    (l) => l.approvalStatus === "pending",
  ).length;
  const unread = inbox.data?.unread ?? 0;
  const managerial = role === "owner" || role === "admin";

  const sections: { title: string; items: Item[] }[] = [];

  if (role === "platform") {
    const own = me?.schools.filter((s) => !s.support) ?? [];
    const support = me?.schools.filter((s) => s.support) ?? [];
    sections.push({
      title: "Okulum · süper kullanıcı",
      items: [
        ...own.map(
          (s): Item => ({
            title: s.name,
            subtitle: "Okulumu aç · her şey açık",
            icon: "swap-horizontal-outline",
            onPress: () => void openSchool(s.id),
          }),
        ),
        {
          title: "Destek erişimi olan okullar",
          subtitle: support.length
            ? `${support.length} okul · müdür onayıyla, süreli`
            : "Şu an yok",
          icon: "key-outline",
          to: "/okullar",
        },
      ],
    });
    sections.push({
      title: "Platform",
      items: [
        {
          title: "Okullar ve abonelikler",
          subtitle: "Paketler, pano sayısı, deneme süreleri",
          icon: "business-outline",
          to: "/okullar",
        },
        {
          title: "Kayıt onayları",
          subtitle: "E-postası doğrulanmamış başvurular",
          icon: "checkmark-done-outline",
          to: "/",
        },
        {
          title: "MEB çalışma takvimi",
          subtitle: "Tara · onayla",
          icon: "calendar-outline",
          to: "/takvim",
        },
      ],
    });
  }

  if (me?.user.isSuperAdmin && role !== "platform") {
    sections.push({
      title: "Platform",
      items: [
        {
          title: "Platform görünümüne dön",
          subtitle: "Okullar, kayıtlar, MEB takvimi",
          icon: "grid-outline",
          onPress: () =>
            void setPlatformMode(true).then(() => router.replace("/")),
        },
      ],
    });
  }

  if (managerial) {
    sections.push({
      title: "Okul yönetimi",
      items: [
        {
          title: "Kullanıcılar ve yetkiler",
          subtitle:
            role === "owner"
              ? "Davet · yönetici ve editör ata · yetki ver"
              : "Davet · editör ekle ve yetki ver",
          icon: "people-outline",
          to: "/kullanicilar",
        },
        // Öğretmen kaydı olan yöneticide Gözlem "Öğretmen araçlarım"da
        ...(!isTeacher
          ? [
              {
                title: "Gözlem",
                subtitle: "Öğrencilere artı / eksi, öğrenci kartları",
                icon: "clipboard-outline" as IconName,
                to: "/gozlem",
              },
            ]
          : []),
        {
          title: "Rehberlik uyarıları",
          subtitle: "Kısa sürede çok eksi alan öğrenciler",
          icon: "heart-outline" as IconName,
          to: "/rehberlik",
        },
        ...(role === "owner" && !school?.support && !me?.user.isSuperAdmin
          ? [
              {
                title: "Destek erişimi",
                subtitle:
                  "Platform desteğine 24 saat ya da 7 gün onay ver, kapat",
                icon: "key-outline" as IconName,
                tone: "gold" as const,
                to: "/destek",
              },
            ]
          : []),
        {
          title: "Tatil takvimi",
          subtitle: "MEB takvimi, bayramlar, köprü günleri",
          icon: "sunny-outline",
          to: "/tatiller",
        },
        {
          title: "Etkinlik geçmişi",
          subtitle: "Kim ne zaman neyi değiştirdi",
          icon: "time-outline",
          tone: "muted",
          to: "/gecmis",
        },
      ],
    });
  }

  if (role !== "platform") {
    const content = CONTENT.filter((c) => can(c.permission)).map(
      (c): Item => ({
        title: c.title,
        subtitle: c.subtitle,
        icon: c.icon,
        to: `/icerik/${c.tur}`,
      }),
    );
    if (can("announcements.manage"))
      content.unshift({
        title: "Duyurular ve yayın akışı",
        subtitle: "Yeni duyuru, yayındakiler",
        icon: "megaphone-outline",
        to: "/yayin-akisi",
      });
    if (content.length && role !== "teacher") {
      if (can("students.manage") || managerial)
        content.push({
          title: "Doğum günleri",
          subtitle: "Bugün doğum günü olanlar",
          icon: "gift-outline",
          to: "/dogum-gunleri",
        });
      sections.push({
        title: role === "editor" ? "İçerik (yetkileriniz)" : "İçerik",
        items: content,
      });
    }
  }

  if (isTeacher && role !== "platform") {
    sections.push({
      title: "Öğretmen araçlarım",
      items: [
        {
          title: "Ders programım ve zil saatleri",
          subtitle: "Haftalık program, bugünün zilleri",
          icon: "time-outline",
          to: "/programim",
        },
        // Öğretmen görünümünde Gözlem alt menüde; Duyurular buraya taşındı
        ...(role === "teacher"
          ? [
              {
                title: "Duyurularım",
                subtitle: "Gönderdiklerim, onay durumu",
                icon: "megaphone-outline" as IconName,
                to: "/duyurular",
              },
            ]
          : [
              {
                title: "Gözlem",
                subtitle: "Öğrencilere artı / eksi, öğrenci kartları",
                icon: "clipboard-outline" as IconName,
                to: "/gozlem",
              },
            ]),
        ...(role === "editor"
          ? [
              {
                title: "Nöbetlerim",
                subtitle: "Bu hafta ve yerine görevlendirmeler",
                icon: "shield-checkmark-outline" as IconName,
                to: "/nobet",
              },
            ]
          : []),
        {
          title: role === "teacher" ? "İzinlerim" : "İzin bildir",
          subtitle: pendingLeaves
            ? `${pendingLeaves} bildirim onay bekliyor`
            : "Onay durumu",
          icon: "calendar-clear-outline",
          to: role === "teacher" ? "/izinlerim" : "/izin",
        },
        {
          title: "Telefon takvimine ekle",
          subtitle: "Nöbetler ve sınavlar takviminize",
          icon: "calendar-outline",
          to: "/takvime-ekle",
        },
      ],
    });
  }

  if (role === "editor" || role === "teacher") {
    sections.push({
      title: "Okul",
      items: [
        // Rehber öğretmen (öğretmen kaydı olmayan): Gözlem
        ...(role === "editor" &&
        !isTeacher &&
        (can("conduct.counsel") || can("conduct.manage"))
          ? [
              {
                title: "Gözlem",
                subtitle: "Öğrencilere artı / eksi, öğrenci kartları",
                icon: "clipboard-outline" as IconName,
                to: "/gozlem",
              },
              {
                title: "Rehberlik uyarıları",
                subtitle: "Kısa sürede çok eksi alan öğrenciler",
                icon: "heart-outline" as IconName,
                to: "/rehberlik",
              },
            ]
          : []),
        {
          title: "Tatil takvimi",
          subtitle: "Ara tatil, yarıyıl, bayramlar",
          icon: "sunny-outline",
          to: "/tatiller",
        },
        {
          title: "Sınavlar ve etkinlikler",
          subtitle: "Yaklaşan sınav ve etkinlikler",
          icon: "school-outline",
          to: "/yaklasanlar",
        },
        {
          title: "Bugün doğum günü olanlar",
          subtitle: "Öğrencilerimiz",
          icon: "gift-outline",
          to: "/dogum-gunleri",
        },
      ],
    });
  }

  sections.push({
    title: "Hesabım",
    items: [
      {
        title: "Profil bilgilerim",
        subtitle: "Ad soyad, e-posta",
        icon: "person-outline",
        tone: "muted",
        to: "/hesap/profil",
      },
      {
        title: "Şifre değiştir",
        subtitle: "Diğer cihazlardaki oturumlar kapanır",
        icon: "lock-closed-outline",
        tone: "muted",
        to: "/hesap/sifre",
      },
      {
        title: "Bildirimler",
        subtitle: "Okunanlar dahil geçmiş",
        icon: "notifications-outline",
        tone: "muted",
        to: "/bildirimler",
        right: unread ? (
          <Badge tone="danger">{String(unread)}</Badge>
        ) : undefined,
      },
      ...(Platform.OS !== "web"
        ? [
            {
              title: "Telefon bildirimlerini aç",
              subtitle: push ?? "Onaylar, nöbet hatırlatmaları",
              icon: "phone-portrait-outline" as IconName,
              tone: "muted" as const,
              onPress: () =>
                void registerForPush()
                  .then((r) =>
                    setPush(
                      r === "ok"
                        ? "Açık: bu telefon bildirim alacak."
                        : r === "local"
                          ? "İzin verildi: nöbet hatırlatmaları çalışır. Onay ve acil durum bildirimleri için bildirim hizmeti henüz kurulmadı."
                          : r === "denied"
                            ? "İzin verilmedi: telefon ayarlarından Okul Yayın için bildirimleri açın."
                            : "Bu cihazda kullanılamıyor.",
                    ),
                  )
                  .catch(() =>
                    setPush(
                      "Kaydedilemedi: internet bağlantınızı kontrol edip yeniden deneyin.",
                    ),
                  ),
            },
          ]
        : []),
    ],
  });

  const schoolChoices = role === "platform" ? [] : (me?.schools ?? []);

  // Rolün ilk bölümü renkli kutular hâlinde (en sık kullanılanlar; tek kalan kutu tam genişlikte), geri kalanı liste
  const [featured, ...rest] = sections;

  return (
    <Screen title="Menü" back={role !== "teacher"}>
      <ProfileTile
        name={me?.user.fullName ?? ""}
        email={me?.user.email ?? ""}
        school={role !== "platform" ? school?.name : null}
        badges={[
          ROLE_LABEL[role],
          ...(isTeacher && role !== "teacher" && role !== "platform"
            ? ["Öğretmen"]
            : []),
          ...(school?.support && role !== "platform" ? ["Destek erişimi"] : []),
        ]}
      />

      {schoolChoices.length > 1 && (
        <>
          <SectionTitle>Okul</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {schoolChoices.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={s.id === school?.id}
                onPress={() => void selectSchool(s.id)}
              />
            ))}
          </View>
        </>
      )}

      {featured && featured !== sections[sections.length - 1] && (
        <View style={{ gap: 10 }}>
          <SectionTitle>{featured.title}</SectionTitle>
          {Array.from(
            { length: Math.ceil(featured.items.length / 2) },
            (_, r) => featured.items.slice(r * 2, r * 2 + 2),
          ).map((row, r) => (
            <BentoRow key={r}>
              {row.map((it, j) => (
                <MenuTile
                  key={it.title}
                  item={it}
                  tone={TILE_CYCLE[(r * 2 + j) % TILE_CYCLE.length]}
                />
              ))}
            </BentoRow>
          ))}
        </View>
      )}

      {(featured === sections[sections.length - 1] ? sections : rest).map(
        (s) => (
          <View key={s.title} style={{ gap: 6 }}>
            <SectionTitle>{s.title}</SectionTitle>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {s.items.map((it, i) => (
                <ListRow
                  key={it.title}
                  icon={it.icon}
                  iconTone={it.tone ?? "primary"}
                  title={it.title}
                  subtitle={it.subtitle}
                  right={it.right}
                  onPress={
                    it.onPress ??
                    (it.to ? () => router.push(it.to as never) : undefined)
                  }
                  last={i === s.items.length - 1}
                />
              ))}
            </Card>
          </View>
        ),
      )}

      {role === "platform" && (
        <T size={12} color={colors.muted} style={{ textAlign: "center" }}>
          Kendi okulunuzda her şey açık. Diğer okullara yalnızca müdürün
          onayladığı süreli destek erişimiyle girersiniz.
        </T>
      )}

      <View style={{ gap: 10 }}>
        <SectionTitle>Görünüm</SectionTitle>
        <Segmented
          value={theme.mode}
          onChange={theme.setMode}
          options={[
            { value: "system", label: "Sistem" },
            { value: "light", label: "Açık" },
            { value: "dark", label: "Koyu" },
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 54,
          borderRadius: radius.pill,
          backgroundColor: pressed ? colors.dangerBorder : colors.dangerSoft,
          marginTop: 4,
        })}
      >
        <Icon name="log-out-outline" size={20} color={colors.danger} />
        <Text
          style={{ fontSize: 15.5, fontWeight: "800", color: colors.danger }}
        >
          Çıkış yap
        </Text>
      </Pressable>
    </Screen>
  );
}
