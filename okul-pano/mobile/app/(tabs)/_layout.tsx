import { Tabs } from "expo-router";
import { useEffect, useState, type ComponentProps, type ReactElement } from "react";
import { useDutyReminders, useExamReminders } from "../../src/reminders.ts";
import { SpecialDayPopup } from "../../src/specialDay.tsx";
import { centeredText, Text } from "../../src/text.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type AppRole } from "../../src/auth.tsx";
import { visibleTabs, type TabName } from "../../src/tabs.ts";
import { useControlCenter, useInbox } from "../../src/data.ts";
import { colors, dark } from "../../src/theme.ts";
import { Keyboard, Platform, Pressable, View } from "react-native";
import { Icon, TabBarInset, type IconName } from "../../src/ui.tsx";

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

const BAR_HEIGHT = 60;

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
 * Yüzer alt menü (tasarım B): ortada kapsül; seçili sekme hap içinde simge ve adıyla, diğerleri yalnızca simge.
 * Kapsül temanın renginde ve yarı saydam (açık temada beyaz, koyu temada koyu; web sürümünde arkası bulanık), ince
 * çerçeve ve gölgeyle sayfadan ayrışır. Simgeye uzun basınca adı kısa süre görünür. Klavye açıkken gizlenir.
 */
function FloatingTabBar({ state, descriptors, emitter, navigateToTab, bottom }: TabBarProps & { bottom: number }) {
  const [keyboard, setKeyboard] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const b = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 1600);
    return () => clearTimeout(t);
  }, [hint]);
  if (keyboard) return null;
  const items = state.routes
    .map((route, index) => ({ route, index, options: descriptors[route.key]!.options }))
    // Rolde olmayan sekmeler (tabBarButton gizli) çizilmez
    .filter((x) => typeof x.options.tabBarButton !== "function");
  const web = Platform.OS === "web";
  // Yarı saydam zemin: web'de arkası gerçekten bulanır; Android'de bulanıklık yok, biraz daha az saydam
  const glass = dark ? `rgba(43,39,35,${web ? 0.7 : 0.86})` : `rgba(255,255,255,${web ? 0.7 : 0.86})`;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center" }}>
      {hint && (
        <View style={{ marginBottom: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.elevatedBorder }}>
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.ink }}>{hint}</Text>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          height: BAR_HEIGHT,
          paddingHorizontal: 7,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: glass,
          borderWidth: 1,
          borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(28,25,23,0.08)",
          ...(web ? ({ backdropFilter: "blur(18px) saturate(160%)", WebkitBackdropFilter: "blur(18px) saturate(160%)" } as object) : {}),
          shadowColor: "#000",
          shadowOpacity: dark ? 0.5 : 0.14,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {items.map(({ route, index, options }) => {
          const focused = state.index === index;
          const label = typeof options.title === "string" ? options.title : route.name;
          const badge = options.tabBarBadge;
          const color = focused ? colors.onPrimary : colors.muted;
          const onPress = () => {
            const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${label}, ${badge}` : label}
              onPress={onPress}
              onLongPress={() => setHint(label)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                height: 46,
                minWidth: 50,
                justifyContent: "center",
                paddingHorizontal: focused ? 16 : 12,
                borderRadius: 23,
                backgroundColor: focused ? colors.primary : "transparent",
              }}
            >
              <View>
                {options.tabBarIcon?.({ focused, color, size: 22 })}
                {badge != null && badge !== "" && (
                  <View style={{ position: "absolute", top: -6, right: -9, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ ...centeredText(10), fontWeight: "800", color: "#fff" }}>{String(badge)}</Text>
                  </View>
                )}
              </View>
              {focused && <Text style={{ fontSize: 14, fontWeight: "800", color: colors.onPrimary }}>{label}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { role, can, isManager, isTeacher } = useAuth();
  // Nöbet hatırlatmaları: öğretmen kaydı olan herkesin telefonunda kurulur
  useDutyReminders(isTeacher);
  useExamReminders(isTeacher);
  // Telefonun alt sistem çubuğu (üç düğmeli gezinme) menünün üstüne binmesin
  const insets = useSafeAreaInsets();
  // Yüzer alt menü: kenarlardan boşluklu, yuvarlak köşeli, yarı saydam kart. Sayfalar menünün altından akar;
  // son satırlar menünün arkasında kalmasın diye Screen alta bu kadar boşluk bırakır (TabBarInset)
  const barBottom = Math.max(insets.bottom, 8) + 10;
  const barInset = BAR_HEIGHT + barBottom + 12;
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
      // Seçili sekmede simge dolu, diğerlerinde ince çizgili (zemin ve renk FloatingTabBar'da)
      return <Icon name={focused ? active : name} size={22} color={typeof color === "string" ? color : colors.subtle} />;
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
      <TabBarInset.Provider value={barInset}>
      <Tabs
        backBehavior="history"
        safeAreaInsets={{ bottom: 0 }}
        tabBar={(props) => <FloatingTabBar {...props} bottom={barBottom} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          // Sekme değişince yeni sayfa seçilen sekmenin yönünden hafifçe kayarak gelir
          animation: 'shift',
          transitionSpec: { animation: 'timing', config: { duration: 240 } },
        }}
      >
        {order.map((n) => screens[n])}
      </Tabs>
      </TabBarInset.Provider>
      {role !== "platform" && <SpecialDayPopup />}
    </>
  );
}
