import { Tabs } from "expo-router";
import type { ReactElement } from "react";
import { useDutyReminders, useExamReminders } from "../../src/reminders.ts";
import { SpecialDayPopup } from "../../src/specialDay.tsx";
import { fontFor, Text } from "../../src/text.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type AppRole } from "../../src/auth.tsx";
import { visibleTabs, type TabName } from "../../src/tabs.ts";
import { useControlCenter, useInbox } from "../../src/data.ts";
import { colors } from "../../src/theme.ts";
import { Icon, type IconName } from "../../src/ui.tsx";

// Sekme ekranlarında beklenmeyen bir hata olursa uygulama kapanmaz, "Yeniden dene" görünür
export { ErrorBoundary } from "../../src/errorBoundary.tsx";

const HOME_TITLE: Record<AppRole, string> = {
  platform: "Platform",
  owner: "Merkez",
  admin: "Merkez",
  editor: "İçerik",
  teacher: "Bugün",
};
const HOME_ICON: Record<AppRole, [IconName, IconName]> = {
  platform: ["grid-outline", "grid"],
  owner: ["grid-outline", "grid"],
  admin: ["grid-outline", "grid"],
  editor: ["create-outline", "create"],
  teacher: ["home-outline", "home"],
};

export default function TabsLayout() {
  const { role, can, isManager, isTeacher } = useAuth();
  // Nöbet hatırlatmaları: öğretmen kaydı olan herkesin telefonunda kurulur
  useDutyReminders(isTeacher);
  useExamReminders(isTeacher);
  // Telefonun alt sistem çubuğu (üç düğmeli gezinme) menünün üstüne binmesin
  const insets = useSafeAreaInsets();
  const center = useControlCenter(isManager && role !== "platform");
  const inbox = useInbox("unread");
  const pending =
    (center.data?.pending.announcements ?? 0) +
    (center.data?.pending.leaves ?? 0);
  const visible = visibleTabs(role, can, isTeacher);
  const shown = new Set(visible);
  // Rolde olmayan sekmenin yalnızca düğmesi gizlenir (href: null rotayı da kapatır; bildirimden ya da Menü'den açılamaz)
  const hide = (name: TabName) =>
    shown.has(name)
      ? {}
      : {
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" as const },
        };
  const icon = (name: IconName, active: IconName) =>
    function TabIcon({ focused, color }: { focused: boolean; color: unknown }) {
      // Seçili sekmede simge dolu ve koyu, diğerlerinde ince çizgili ve soluk
      return (
        <Icon
          name={focused ? active : name}
          size={24}
          color={typeof color === "string" ? color : colors.subtle}
        />
      );
    };
  // Sekmeler alt menüde rolün sırasıyla dizilir (önce görünenler, sonra gizli rotalar)
  const screens: Record<TabName, ReactElement> = {
    index: (
      <Tabs.Screen
        key="index"
        name="index"
        options={{
          // Kadroda olmayan, görevi de olmayan kişinin ana sayfası "Bugün" değil
          title:
            role === "teacher" && !isTeacher ? "Ana sayfa" : HOME_TITLE[role],
          tabBarIcon: icon(...HOME_ICON[role]),
        }}
      />
    ),
    okullar: (
      <Tabs.Screen
        key="okullar"
        name="okullar"
        options={{
          title: "Abonelikler",
          ...hide("okullar"),
          tabBarIcon: icon("business-outline", "business"),
        }}
      />
    ),
    takvim: (
      <Tabs.Screen
        key="takvim"
        name="takvim"
        options={{
          title: "Takvim",
          ...hide("takvim"),
          tabBarIcon: icon("calendar-outline", "calendar"),
        }}
      />
    ),
    onaylar: (
      <Tabs.Screen
        key="onaylar"
        name="onaylar"
        options={{
          title: "Onaylar",
          ...hide("onaylar"),
          tabBarIcon: icon("checkmark-done-outline", "checkmark-done"),
          tabBarBadge: pending || undefined,
        }}
      />
    ),
    duyurular: (
      <Tabs.Screen
        key="duyurular"
        name="duyurular"
        options={{
          title: "Duyurular",
          ...hide("duyurular"),
          tabBarIcon: icon("megaphone-outline", "megaphone"),
        }}
      />
    ),
    gorevlendirme: (
      <Tabs.Screen
        key="gorevlendirme"
        name="gorevlendirme"
        options={{
          title: "Görevlendirme",
          ...hide("gorevlendirme"),
          tabBarIcon: icon("people-outline", "people"),
        }}
      />
    ),
    gozlem: (
      <Tabs.Screen
        key="gozlem"
        name="gozlem"
        options={{
          title: "Gözlem",
          ...hide("gozlem"),
          tabBarIcon: icon("clipboard-outline", "clipboard"),
        }}
      />
    ),
    panolar: (
      <Tabs.Screen
        key="panolar"
        name="panolar"
        options={{
          title: "Panolar",
          ...hide("panolar"),
          tabBarIcon: icon("tv-outline", "tv"),
        }}
      />
    ),
    nobet: (
      <Tabs.Screen
        key="nobet"
        name="nobet"
        options={{
          title: role === "teacher" ? "Nöbetim" : "Nöbet",
          ...hide("nobet"),
          tabBarIcon: icon("shield-checkmark-outline", "shield-checkmark"),
        }}
      />
    ),
    program: (
      <Tabs.Screen
        key="program"
        name="program"
        options={{
          title: "Program",
          ...hide("program"),
          tabBarIcon: icon("time-outline", "time"),
        }}
      />
    ),
    izinlerim: (
      <Tabs.Screen
        key="izinlerim"
        name="izinlerim"
        options={{
          title: "İzin",
          ...hide("izinlerim"),
          tabBarIcon: icon("calendar-clear-outline", "calendar-clear"),
        }}
      />
    ),
    acil: (
      <Tabs.Screen
        key="acil"
        name="acil"
        options={{
          title: "Acil",
          ...hide("acil"),
          // Acil sekmesi her zaman kırmızı (diğer sekmelerin rengini değiştirmeden)
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? "warning" : "warning-outline"}
              size={24}
              color={colors.danger}
            />
          ),
          tabBarLabel: () => (
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: colors.danger,
                marginTop: 3,
              }}
            >
              Acil
            </Text>
          ),
        }}
      />
    ),
    kutu: (
      <Tabs.Screen
        key="kutu"
        name="kutu"
        options={{
          title: "Bildirimler",
          ...hide("kutu"),
          tabBarIcon: icon("notifications-outline", "notifications"),
          tabBarBadge: inbox.data?.unread || undefined,
        }}
      />
    ),
    profil: (
      <Tabs.Screen
        key="profil"
        name="profil"
        options={{
          // Herkeste son sekme Menü (profil, şifre, çıkış ve rolün diğer ekranları)
          title: "Menü",
          ...hide("profil"),
          tabBarIcon: icon("reorder-three-outline", "reorder-three-outline"),
        }}
      />
    ),
  };
  const order = [
    ...visible,
    ...(Object.keys(screens) as TabName[]).filter((n) => !shown.has(n)),
  ];
  return (
    <>
      {/* Geri hareketi bir önceki sekmeye döner (ör. Menü → İzinlerim → geri: Menü); varsayılan ana sayfaya atıyordu */}
      <Tabs
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.subtle,
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: fontFor("700"),
            marginTop: 3,
          },
          tabBarBadgeStyle: {
            backgroundColor: colors.danger,
            fontSize: 10,
            fontFamily: fontFor("800"),
          },
          tabBarStyle: {
            height: 74 + insets.bottom,
            paddingTop: 8,
            paddingBottom: 8 + insets.bottom,
            borderTopColor: colors.border,
            backgroundColor: colors.card,
          },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        {order.map((n) => screens[n])}
      </Tabs>
      {role !== "platform" && <SpecialDayPopup />}
    </>
  );
}
