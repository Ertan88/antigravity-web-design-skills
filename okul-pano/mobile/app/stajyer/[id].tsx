import { errorText } from "@okulpano/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { api } from "../../src/api.ts";
import { useAuth, useSchoolPath } from "../../src/auth.tsx";
import { useSchoolQuery } from "../../src/data.ts";
import { VISIT_DAYS } from "../../src/internshipForms.tsx";
import { Text } from "../../src/text.tsx";
import { colors, radius, tiles, type TileTone } from "../../src/theme.ts";
import {
  Button,
  Card,
  confirm,
  Empty,
  ErrorNote,
  Loading,
  Screen,
  SectionTitle,
  T,
} from "../../src/ui.tsx";

/*
 * Öğrenci sayfası (işletmede eğitim): şu anki işletme, bu öğretim yılının toplamları ve ay ay devamsızlıklar. Öğrenci
 * işletme değiştirdiyse dönemler ayrı ayrı gösterilir; yeni koordinatör eski işletmedeki devamsızlıkları da görür.
 */

interface Totals {
  excused: number;
  unexcused: number;
  permitted: number;
  report: number;
  referred: number;
  business: number;
  closed: number;
  unchecked: number;
}
interface Period {
  businessId: string;
  businessName: string;
  coordinatorName: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  totals: Totals;
}
interface Event {
  date: string;
  half: "am" | "pm";
  code: string;
  userName: string;
  sent: boolean;
  businessId: string | null;
}
interface Record {
  student: {
    id: string;
    fullName: string;
    schoolNo: string;
    className: string | null;
  };
  business: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    contactName: string | null;
    trainerName: string | null;
    visitWeekday: number | null;
    coordinatorName: string | null;
    areaName: string | null;
  } | null;
  editable: boolean;
  today: string;
  yearStart: string;
  totals: Totals;
  periods: Period[];
  events: Event[];
}

const CODE: { [k: string]: { text: string; tone: TileTone } } = {
  D: { text: "Özürsüz devamsız", tone: "rose" },
  İ: { text: "İzinli", tone: "sky" },
  R: { text: "Raporlu", tone: "peach" },
  H: { text: "Hasta sevkli", tone: "sun" },
  K: { text: "İşletme kapalı", tone: "lilac" },
  T: { text: "Tatil", tone: "paper" },
};

const days = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("tr-TR", { ...opts, timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
const dayText = (iso: string) =>
  fmt(iso, { day: "numeric", month: "long", weekday: "long" });
const shortDate = (iso: string) =>
  fmt(iso, { day: "numeric", month: "long", year: "numeric" });
const monthText = (m: string) =>
  fmt(`${m}-15`, { month: "long", year: "numeric" });
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000)
    .toISOString()
    .slice(0, 10);

function periodText(p: Period, yearStart: string) {
  const from = p.startDate
    ? shortDate(p.startDate)
    : `${shortDate(yearStart)} (öğretim yılı başı)`;
  return p.endDate
    ? `${from} – ${shortDate(p.endDate)}`
    : `${from} – devam ediyor`;
}

/** Aynı gün aynı kodlu iki yarım gün "tam gün" olarak birleşir */
function mergeHalves(events: Event[]) {
  const out: (Event & { full: boolean })[] = [];
  for (const e of events) {
    const twin = out.find(
      (o) => o.date === e.date && o.code === e.code && !o.full,
    );
    if (twin) twin.full = true;
    else out.push({ ...e, full: false });
  }
  return out;
}

function TotalTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: TileTone;
}) {
  const t = tiles[tone];
  return (
    <View
      style={{
        flexBasis: "31%",
        flexGrow: 1,
        borderRadius: radius.md,
        padding: 10,
        backgroundColor: t.bg,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.fg }}>
        {days(value)}
      </Text>
      <Text
        style={{ fontSize: 11.5, fontWeight: "700", color: t.sub }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function Totals({ t }: { t: Totals }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <TotalTile label="İşletmede (gün)" value={t.business} tone="mint" />
      <TotalTile label="Özürsüz" value={t.unexcused} tone="rose" />
      <TotalTile label="Raporlu" value={t.report} tone="peach" />
      <TotalTile label="İzinli" value={t.permitted} tone="sky" />
      <TotalTile label="Hasta sevkli" value={t.referred} tone="sun" />
      <TotalTile label="İşletme kapalı" value={t.closed} tone="lilac" />
    </View>
  );
}

export default function InternRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { school } = useAuth();
  const qc = useQueryClient();
  const rec = useSchoolQuery<Record>(`internship/students/${id}/record`);
  const assignPath = useSchoolPath("internship/students/assign");
  const [error, setError] = useState<string | null>(null);
  const d = rec.data;
  const s = d?.student;
  const b = d?.business;

  const leave = async () => {
    if (!d || !b) return;
    const ok = await confirm({
      title: `${d.student.fullName} işletmeden çıkarılsın mı?`,
      message: `${b.name} için son gün dün (${shortDate(addDays(d.today, -1))}) olur. Geçmiş devam işaretleri silinmez; o işletmenin çizelgesinde kalır.`,
      confirmLabel: "Çıkar",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(assignPath, {
        method: "POST",
        body: { studentIds: [d.student.id], businessId: null, from: d.today },
      });
      void qc.invalidateQueries({
        predicate: (x) =>
          x.queryKey[0] === school?.id &&
          String(x.queryKey[1] ?? "").startsWith("internship"),
      });
      router.back();
    } catch (e) {
      setError(errorText(e, "Çıkarılamadı"));
    }
  };

  const merged = d ? mergeHalves(d.events) : [];
  const byMonth = new Map<string, typeof merged>();
  for (const e of merged)
    byMonth.set(e.date.slice(0, 7), [
      ...(byMonth.get(e.date.slice(0, 7)) ?? []),
      e,
    ]);
  const nameOf = new Map(
    (d?.periods ?? []).map((p) => [p.businessId, p.businessName]),
  );
  const multi = (d?.periods.length ?? 0) > 1;

  return (
    <Screen
      title={s?.fullName ?? "Öğrenci"}
      subtitle={
        s
          ? `No ${s.schoolNo}${s.className ? ` · ${s.className}` : ""}${b?.areaName ? ` · ${b.areaName}` : ""}`
          : undefined
      }
      back
      refreshing={rec.isRefetching}
      onRefresh={() => void rec.refetch()}
    >
      <ErrorNote error={rec.error} />
      {!d ? (
        <Loading />
      ) : (
        <>
          {b ? (
            <Card style={{ gap: 7 }}>
              {(
                [
                  ["İşletme", b.name, null],
                  ["Koordinatör", b.coordinatorName, null],
                  ["İşletme yetkilisi", b.contactName, null],
                  ["Usta öğretici", b.trainerName, null],
                  [
                    "Görev günü",
                    b.visitWeekday
                      ? `Her hafta ${VISIT_DAYS[b.visitWeekday - 1]}`
                      : null,
                    null,
                  ],
                  ["Telefon", b.phone, "tel"],
                ] as [string, string | null, "tel" | null][]
              ).map(([label, v, kind]) => (
                <Pressable
                  key={label}
                  disabled={!v || !kind}
                  onPress={() =>
                    v && void Linking.openURL(`tel:${v.replace(/[^\d+]/g, "")}`)
                  }
                  style={{ flexDirection: "row", gap: 10 }}
                >
                  <Text
                    style={{
                      width: 118,
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.faint,
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      fontWeight: "800",
                      color: !v
                        ? colors.subtle
                        : kind
                          ? colors.info
                          : colors.ink,
                    }}
                  >
                    {v ?? "Girilmemiş"}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : (
            <Card tone="warning">
              <T size={13.5} weight="700">
                {d.periods.some((p) => p.current)
                  ? "Öğrenci şu an başka bir işletmede."
                  : "Öğrenci şu an bir işletmeye bağlı değil."}
              </T>
              <T size={12.5} color={colors.muted}>
                Aşağıda yalnızca sizin işletmenizdeki dönem görünür.
              </T>
            </Card>
          )}

          <SectionTitle>Bu öğretim yılı</SectionTitle>
          <Totals t={d.totals} />
          {d.totals.unchecked > 0 && (
            <T size={12.5} weight="700" color={colors.warning}>
              {days(d.totals.unchecked)} gün henüz kontrol edilmedi (İşletmede
              devam çizelgesinde işaretlenmemiş).
            </T>
          )}

          {multi && (
            <>
              <SectionTitle>İşletmeler</SectionTitle>
              {d.periods.map((p, i) => (
                <Card key={`${p.businessId}-${i}`} style={{ gap: 4 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: "800",
                        color: colors.ink,
                      }}
                      numberOfLines={1}
                    >
                      {p.businessName}
                    </Text>
                    {p.current && (
                      <T size={11.5} weight="800" color={colors.success}>
                        Şu an
                      </T>
                    )}
                  </View>
                  <T size={12.5} color={colors.faint}>
                    {periodText(p, d.yearStart)}
                  </T>
                  <T size={12.5} color={colors.muted}>
                    {p.coordinatorName
                      ? `Koordinatör: ${p.coordinatorName} · `
                      : ""}
                    Özürsüz {days(p.totals.unexcused)} · Özürlü{" "}
                    {days(p.totals.excused)} gün
                  </T>
                </Card>
              ))}
              <T size={12} color={colors.faint}>
                Aylık devam çizelgesi her işletme için ayrı basılır; öğrencinin
                o işletmede olmadığı günler “–” ile kapatılır.
              </T>
            </>
          )}

          <SectionTitle>Devamsızlıklar</SectionTitle>
          {!merged.length ? (
            <Empty
              icon="checkmark-circle-outline"
              title="Devamsızlık yok"
              text="Bu öğretim yılında işaretlenmiş devamsızlık, izin ya da rapor yok."
            />
          ) : (
            [...byMonth.entries()].map(([m, list]) => (
              <Card key={m} style={{ gap: 0 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "800",
                    color: colors.ink,
                    marginBottom: 4,
                    textTransform: "capitalize",
                  }}
                >
                  {monthText(m)}
                </Text>
                {list.map((e, i) => {
                  const c = CODE[e.code] ?? {
                    text: e.code,
                    tone: "paper" as TileTone,
                  };
                  const t = tiles[c.tone];
                  return (
                    <View
                      key={`${e.date}-${e.half}-${e.code}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 9,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: colors.divider,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          backgroundColor: t.bg,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13.5,
                            fontWeight: "800",
                            color: t.fg,
                          }}
                        >
                          {e.code}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13.5, color: colors.ink }}>
                          <Text style={{ fontWeight: "800" }}>
                            {dayText(e.date)}
                          </Text>
                          {` · ${e.full ? "tam gün" : e.half === "am" ? "öğleden önce" : "öğleden sonra"}`}
                        </Text>
                        <T size={12} color={colors.faint}>
                          {c.text} · {e.userName} işaretledi
                          {e.code !== "K" && e.code !== "T"
                            ? e.sent
                              ? " · idareye gönderildi"
                              : " · gönderilmedi"
                            : ""}
                          {multi && e.businessId
                            ? ` · ${nameOf.get(e.businessId) ?? ""}`
                            : ""}
                        </T>
                      </View>
                    </View>
                  );
                })}
              </Card>
            ))
          )}

          {error && (
            <T size={13} color={colors.danger}>
              {error}
            </T>
          )}
          {d.editable && b && (
            <View style={{ alignItems: "flex-start", marginTop: 4 }}>
              <Button
                variant="delete"
                size="sm"
                icon="remove-circle-outline"
                onPress={() => void leave()}
              >
                İşletmeden çıkar
              </Button>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
