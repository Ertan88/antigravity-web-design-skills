import { compareClassNames, errorText, trCompare } from "@okulpano/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { api } from "./api.ts";
import { useAuth, useSchoolPath } from "./auth.tsx";
import { useSchoolQuery } from "./data.ts";
import { VISIT_DAYS } from "./internshipForms.tsx";
import { Sheet, SheetScroll } from "./sheet.tsx";
import { Text, TextInput } from "./text.tsx";
import { colors, radius } from "./theme.ts";
import {
  Badge,
  Button,
  Chip,
  Empty,
  ErrorNote,
  Icon,
  Loading,
  T,
} from "./ui.tsx";

/*
 * İşletmede eğitim gören öğrenciler (İşletmeler ekranının "Öğrenciler" sekmesi) ve "Öğrenci ekle":
 * 1. adım öğrenciler (ders programında işletme dersi olan 12. sınıflar; Mesleki Eğitim Merkezinde bütün sınıflar),
 * 2. adım işletme. Koordinatör öğretmen yalnızca kendi işletmelerine ekler; başka işletmedeki öğrenciyi alamaz.
 * Öğrenci başka işletmeden geliyorsa geçiş tarihi sorulur: eski işletmenin çizelgesi bir gün öncesinde kapanır.
 */

export interface Intern {
  id: string;
  fullName: string;
  schoolNo: string;
  classId: string | null;
  className: string | null;
  businessId: string;
  businessName: string;
  editable: boolean;
  unexcused: number;
  excused: number;
}

interface Candidate {
  id: string;
  fullName: string;
  schoolNo: string;
  listNo: number | null;
  classId: string | null;
  className: string | null;
  /** 'other': başka (görülmeyen) işletmede */
  businessId: string | null;
  businessName: string | null;
}

interface BusinessLite {
  id: string;
  name: string;
  students: number;
  visitWeekday: number | null;
  coordinatorName: string | null;
  canEdit: boolean;
}

const days = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
const lower = (s: string) => s.toLocaleLowerCase("tr-TR");

/** "1042 · 12-A  Ali Demir" ve altında işyeri */
export function InternName({
  no,
  className,
  name,
  sub,
  subColor,
}: {
  no: string;
  className: string | null;
  name: string;
  sub?: string | null;
  subColor?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text
        numberOfLines={1}
        style={{ fontSize: 14.5, fontWeight: "800", color: colors.ink }}
      >
        <Text
          style={{ fontSize: 12.5, fontWeight: "800", color: colors.faint }}
        >
          {no}
          {className ? ` · ${className}` : ""}
          {"  "}
        </Text>
        {name}
      </Text>
      {sub ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12.5,
            fontWeight: "600",
            color: subColor ?? colors.faint,
            marginTop: 1,
          }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        height: 42,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.card,
      }}
    >
      <Icon name="search" size={17} color={colors.subtle} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: "600",
          color: colors.ink,
          paddingVertical: 0,
        }}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Aramayı temizle"
          onPress={() => onChange("")}
          hitSlop={8}
        >
          <Icon name="close" size={16} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Öğrenciler sekmesi: ada dokununca öğrenci sayfası açılır */
export function StudentsTab({
  data,
  error,
}: {
  data: { students: Intern[] } | undefined;
  error: unknown;
}) {
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const list = data?.students ?? [];
  const classes = useMemo(
    () =>
      [
        ...new Map(
          list
            .filter((x) => x.classId)
            .map((x) => [x.classId!, x.className ?? ""]),
        ).entries(),
      ].sort((a, b) => compareClassNames(a[1], b[1])),
    [list],
  );
  const needle = lower(q.trim());
  const shown = list.filter(
    (x) =>
      (!classId || x.classId === classId) &&
      (!needle ||
        lower(`${x.fullName} ${x.schoolNo} ${x.businessName}`).includes(
          needle,
        )),
  );
  return (
    <View style={{ gap: 10 }}>
      <ErrorNote error={error} />
      {!data ? (
        <Loading />
      ) : !list.length ? (
        <Empty
          icon="people-outline"
          title="Öğrenci yok"
          text="İşletmelerinizde öğrenci yok. Aşağıdaki “Öğrenci ekle” ile ekleyebilirsiniz."
        />
      ) : (
        <>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Ad, numara ya da işletme ara"
          />
          {classes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              <Chip
                label="Bütün sınıflar"
                selected={!classId}
                onPress={() => setClassId("")}
              />
              {classes.map(([id, name]) => (
                <Chip
                  key={id}
                  label={name}
                  selected={classId === id}
                  onPress={() => setClassId(id)}
                />
              ))}
            </ScrollView>
          )}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
            }}
          >
            {!shown.length ? (
              <T
                size={13.5}
                color={colors.muted}
                style={{ paddingVertical: 14 }}
              >
                Aramaya uyan öğrenci yok.
              </T>
            ) : (
              shown.map((x, i) => (
                <Pressable
                  key={x.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${x.fullName}, ${x.businessName}`}
                  onPress={() => router.push(`/stajyer/${x.id}`)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 11,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.divider,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <InternName
                    no={x.schoolNo}
                    className={x.className}
                    name={x.fullName}
                    sub={x.businessName}
                  />
                  {x.unexcused > 0 && (
                    <Badge tone="danger">{`${days(x.unexcused)} D`}</Badge>
                  )}
                  <Icon
                    name="chevron-forward"
                    size={17}
                    color={colors.subtle}
                  />
                </Pressable>
              ))
            )}
          </View>
          <T size={12} color={colors.faint}>
            {shown.length} öğrenci. “D” bu öğretim yılındaki özürsüz
            devamsızlıktır (gün).
          </T>
        </>
      )}
    </View>
  );
}

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000)
    .toISOString()
    .slice(0, 10);
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));

/** Öğrenci ekle: 1. öğrenciler, 2. işletme (ve öğrenci başka işletmeden geliyorsa geçiş tarihi) */
export function AddStudentsSheet({
  onClose,
  presetBusinessId,
}: {
  onClose: () => void;
  presetBusinessId?: string;
}) {
  const { school } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath("internship/students/assign");
  const cand = useSchoolQuery<{
    students: Candidate[];
    classes: { id: string; name: string }[];
    fallback: boolean;
    mesem: boolean;
  }>("internship/students");
  const biz = useSchoolQuery<BusinessLite[]>("internship/businesses");
  const [step, setStep] = useState<1 | 2>(1);
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [businessId, setBusinessId] = useState<string | null>(
    presetBusinessId ?? null,
  );
  const [from, setFrom] = useState(isoToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editableBiz = useMemo(
    () => new Set((biz.data ?? []).filter((b) => b.canEdit).map((b) => b.id)),
    [biz.data],
  );
  const targets = (biz.data ?? [])
    .filter((b) => b.canEdit)
    .sort((a, b) => trCompare(a.name, b.name));
  const classes = cand.data?.classes ?? [];
  const activeClass = classId || classes[0]?.id || "";
  const needle = lower(q.trim());
  const all = cand.data?.students ?? [];
  // Arama bütün sınıflarda yapılır; aranmıyorsa seçili sınıf gösterilir
  const shown = all.filter((s) =>
    needle
      ? lower(`${s.fullName} ${s.schoolNo}`).includes(needle)
      : s.classId === activeClass,
  );
  const chosen = all.filter((s) => picked.has(s.id));
  const moving = chosen.filter(
    (s) => s.businessId && s.businessId !== businessId,
  );
  const blocked = (s: Candidate) =>
    s.businessId === "other" ||
    Boolean(s.businessId && !editableBiz.has(s.businessId));

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      await api(path, {
        method: "POST",
        body: { studentIds: [...picked], businessId, from },
      });
      void qc.invalidateQueries({
        predicate: (x) =>
          x.queryKey[0] === school?.id &&
          String(x.queryKey[1] ?? "").startsWith("internship"),
      });
      onClose();
    } catch (e) {
      setError(errorText(e, "Öğrenciler eklenemedi"));
    } finally {
      setBusy(false);
    }
  };

  const names = chosen.map((s) => s.fullName);
  const namesText =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 2).join(", ")} ve ${names.length - 2} öğrenci daha`;

  return (
    <Sheet open onClose={onClose}>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "800",
            color: step === 1 ? colors.ink : colors.faint,
          }}
        >
          1 Öğrenciler
        </Text>
        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.faint }}>
          ›
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "800",
            color: step === 2 ? colors.ink : colors.faint,
          }}
        >
          2 İşletme
        </Text>
      </View>
      {step === 1 ? (
        <>
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }}>
            Öğrenci ekle
          </Text>
          <T
            size={12.5}
            color={colors.faint}
            style={{ marginTop: 2, marginBottom: 10 }}
          >
            {cand.data?.mesem
              ? "Mesleki Eğitim Merkezi: bütün sınıflar listelenir."
              : "Ders programında işletmelerde mesleki (ya da beceri) eğitim dersi olan 12. sınıflar listelenir."}
          </T>
          {cand.data?.fallback && (
            <T
              size={12.5}
              weight="700"
              color={colors.warning}
              style={{ marginBottom: 8 }}
            >
              Ders programında işletme dersi bulunamadı; 12. sınıflar
              listelendi. Ders programı yüklenince yalnızca bu dersi olan
              sınıflar gelir.
            </T>
          )}
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Ad ya da numara ara"
          />
          {!needle && classes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
              style={{ marginTop: 8, flexGrow: 0 }}
            >
              {classes.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={activeClass === c.id}
                  onPress={() => setClassId(c.id)}
                />
              ))}
            </ScrollView>
          )}
          <SheetScroll style={{ maxHeight: 360, marginTop: 8 }}>
            <ErrorNote error={cand.error} />
            {!cand.data ? (
              <Loading />
            ) : !shown.length ? (
              <T
                size={13.5}
                color={colors.muted}
                style={{ paddingVertical: 12 }}
              >
                {needle
                  ? "Aramaya uyan öğrenci yok."
                  : "Bu sınıfta öğrenci yok."}
              </T>
            ) : (
              shown.map((s, i) => {
                const on = picked.has(s.id);
                const off = blocked(s);
                const sub =
                  s.businessId === "other"
                    ? "Başka işletmede · koordinatör müdür yardımcısı değiştirebilir"
                    : s.businessId
                      ? `${s.businessName ?? "İşletmede"}${off ? " · koordinatör müdür yardımcısı değiştirebilir" : ""}`
                      : "İşletmesi yok";
                return (
                  <Pressable
                    key={s.id}
                    disabled={off}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: off }}
                    onPress={() => toggle(s.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 10,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: colors.divider,
                      opacity: off ? 0.45 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        borderWidth: 1.5,
                        borderColor: on ? colors.primary : colors.borderStrong,
                        backgroundColor: on ? colors.primary : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {on && (
                        <Icon
                          name="checkmark"
                          size={15}
                          color={colors.onPrimary}
                          strokeWidth={3}
                        />
                      )}
                    </View>
                    <InternName
                      no={s.schoolNo}
                      className={s.className}
                      name={s.fullName}
                      sub={sub}
                      subColor={
                        s.businessId && !off ? colors.warning : undefined
                      }
                    />
                  </Pressable>
                );
              })
            )}
          </SheetScroll>
          <View style={{ marginTop: 12 }}>
            <Button disabled={!picked.size} onPress={() => setStep(2)}>
              {picked.size ? `Devam · ${picked.size} öğrenci` : "Öğrenci seçin"}
            </Button>
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }}>
            Hangi işletmeye?
          </Text>
          <T
            size={12.5}
            color={colors.faint}
            style={{ marginTop: 2, marginBottom: 10 }}
          >
            {namesText} eklenecek.
          </T>
          <SheetScroll
            style={{ maxHeight: 300 }}
            contentContainerStyle={{ gap: 8 }}
          >
            <ErrorNote error={biz.error} />
            {!biz.data ? (
              <Loading />
            ) : !targets.length ? (
              <T size={13.5} color={colors.muted}>
                Öğrenci ekleyebileceğiniz işletme yok. Önce İşletmeler
                sekmesinden işletme ekleyin.
              </T>
            ) : (
              targets.map((b) => {
                const on = businessId === b.id;
                return (
                  <Pressable
                    key={b.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setBusinessId(b.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: on ? 1.5 : 1,
                      borderColor: on ? colors.primary : colors.borderStrong,
                      backgroundColor: colors.card,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 1.5,
                        borderColor: on ? colors.primary : colors.borderStrong,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {on && (
                        <View
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 6,
                            backgroundColor: colors.primary,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 15,
                          fontWeight: "800",
                          color: colors.ink,
                        }}
                      >
                        {b.name}
                      </Text>
                      <T size={12.5} color={colors.faint}>
                        {b.students ? `${b.students} öğrenci` : "Öğrenci yok"} ·{" "}
                        {b.visitWeekday
                          ? `Görev günü: ${VISIT_DAYS[b.visitWeekday - 1]}`
                          : "Görev günü seçilmedi"}
                      </T>
                    </View>
                  </Pressable>
                );
              })
            )}
            {businessId && moving.length > 0 && (
              <View
                style={{
                  gap: 6,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: colors.warningTint,
                  borderWidth: 1,
                  borderColor: colors.warningBorder,
                }}
              >
                <T size={13} weight="700" color={colors.ink}>
                  {moving.length === 1
                    ? `${moving[0]!.fullName} başka bir işletmeden geliyor.`
                    : `${moving.length} öğrenci başka bir işletmeden geliyor.`}{" "}
                  Yeni işletmede ilk gün:
                </T>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="chevron-back"
                    accessibilityLabel="Önceki gün"
                    onPress={() => setFrom(addDays(from, -1))}
                  />
                  <Text
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: 14,
                      fontWeight: "800",
                      color: colors.ink,
                    }}
                  >
                    {longDate(from)}
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="chevron-forward"
                    accessibilityLabel="Sonraki gün"
                    onPress={() => setFrom(addDays(from, 1))}
                  />
                </View>
                <T size={12} color={colors.muted}>
                  Eski işletmenin devam çizelgesi bir gün öncesinde (
                  {longDate(addDays(from, -1))}) kapanır; iki işletmenin
                  çizelgesi ayrı basılır.
                </T>
              </View>
            )}
          </SheetScroll>
          {error && (
            <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
              {error}
            </T>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" onPress={() => setStep(1)}>
                Geri
              </Button>
            </View>
            <View style={{ flex: 2 }}>
              <Button
                loading={busy}
                disabled={!businessId}
                onPress={() => void save()}
              >
                Ekle
              </Button>
            </View>
          </View>
        </>
      )}
    </Sheet>
  );
}
