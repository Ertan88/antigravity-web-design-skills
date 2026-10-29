import {
  CONDUCT_BANDS,
  CONDUCT_HIGH_SHARE,
  CONDUCT_MIN_TEACHERS,
} from "@okulpano/shared/conduct";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  useConductClasses,
  useConductReport,
  type ConductBand,
} from "../src/data.ts";
import { Text } from "../src/text.tsx";
import { colors, radius, tiles } from "../src/theme.ts";
import {
  Avatar,
  BentoRow,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Screen,
  Segmented,
  T,
  Tile,
} from "../src/ui.tsx";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(
    new Date(`${iso}T12:00:00`),
  );
const dayBefore = (iso: string) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) - 86400_000)
    .toISOString()
    .slice(0, 10);

function BandPill({ band }: { band: ConductBand }) {
  const t = band === "high" ? tiles.mint : band === "low" ? tiles.peach : null;
  return (
    <View
      style={{
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: t
          ? t.bg
          : band === "mid"
            ? colors.primarySoft
            : "transparent",
        borderWidth: band === "none" ? 1 : 0,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 11.5,
          fontWeight: "800",
          color: t ? t.fg : band === "mid" ? colors.ink : colors.faint,
        }}
      >
        {CONDUCT_BANDS[band]}
      </Text>
    </View>
  );
}

/**
 * Dönem göstergesi: dönem sonu performans notunu verirken yardımcı. Not önermez; öğrencinin dönemdeki gözlemlerini
 * üç banda ayırır. "Yalnızca benim": öğretmenin kendi kayıtları (kendi dersinin notu için).
 */
export default function Donem() {
  const classes = useConductClasses();
  const [classId, setClassId] = useState<string | null>(null);
  const [term, setTerm] = useState<1 | 2 | null>(null);
  const [mine, setMine] = useState(false);
  const active =
    classId ?? classes.data?.find((c) => c.students > 0)?.id ?? null;
  const report = useConductReport(active, term, mine);
  const r = report.data;
  const shownTerm = term ?? r?.term ?? 1;

  return (
    <Screen
      title="Dönem Göstergesi"
      subtitle={
        r
          ? `${r.class.name} · ${dayLabel(r.range.from)} – ${dayLabel(dayBefore(r.range.to))}`
          : undefined
      }
      back
      refreshing={report.isRefetching}
      onRefresh={() => void report.refetch()}
    >
      <ErrorNote error={classes.error ?? report.error} />
      <Segmented
        value={String(shownTerm) as "1" | "2"}
        onChange={(v) => setTerm(Number(v) as 1 | 2)}
        options={[
          { value: "1", label: "1. Dönem" },
          { value: "2", label: "2. Dönem" },
        ]}
      />
      <Segmented
        value={mine ? "mine" : "all"}
        onChange={(v) => setMine(v === "mine")}
        options={[
          { value: "all", label: "Tüm öğretmenler" },
          { value: "mine", label: "Yalnızca benim" },
        ]}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {(classes.data ?? []).map((c) => {
          const on = c.id === active;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setClassId(c.id)}
              style={{
                height: 38,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                justifyContent: "center",
                backgroundColor: on ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13.5,
                  fontWeight: "800",
                  color: on ? colors.onPrimary : colors.ink,
                }}
              >
                {c.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {classes.isLoading || (active && !r) ? (
        <Loading />
      ) : !r ? (
        <Empty
          icon="school-outline"
          title="Sınıf yok"
          text="Okul yönetimi öğrencileri sınıflarıyla eklediğinde burada görünür."
        />
      ) : (
        <>
          <BentoRow>
            <Tile
              tone="mint"
              label="Yüksek"
              value={r.class.counts.high}
              caption="öğrenci"
              style={{ flex: 0.85, minHeight: 112 }}
            />
            <Tile
              tone="paper"
              label="Orta"
              value={r.class.counts.mid}
              caption="öğrenci"
              style={{ flex: 0.85, minHeight: 112 }}
            />
            <Tile
              tone="peach"
              label="Gelişime açık"
              value={r.class.counts.low}
              caption="öğrenci"
              style={{ flex: 1.3, minHeight: 112 }}
            />
          </BentoRow>
          {r.class.students.length ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {r.class.students.map((s, i) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/ogrenci/${s.id}`)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    opacity: pressed ? 0.7 : 1,
                    borderBottomWidth:
                      i === r.class.students.length - 1 ? 0 : 1,
                    borderBottomColor: colors.divider,
                  })}
                >
                  <Avatar name={s.fullName} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontWeight: "800",
                        color: colors.ink,
                      }}
                      numberOfLines={1}
                    >
                      {s.fullName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.faint,
                        fontWeight: "600",
                      }}
                      numberOfLines={1}
                    >
                      No {s.schoolNo} ·{" "}
                      <Text
                        style={{ color: colors.success, fontWeight: "800" }}
                      >
                        +{s.plus}
                      </Text>{" "}
                      /{" "}
                      <Text style={{ color: colors.danger, fontWeight: "800" }}>
                        −{s.minus}
                      </Text>
                      {s.topPlus ? ` · ${s.topPlus}` : ""}
                      {s.topMinus ? ` · gelişim: ${s.topMinus}` : ""}
                    </Text>
                  </View>
                  <BandPill band={s.band} />
                </Pressable>
              ))}
            </Card>
          ) : (
            <Empty icon="people-outline" title="Bu sınıfta öğrenci yok" />
          )}
          <Card>
            <T size={12.5} color={colors.muted}>
              Not önerisi değildir. Eksisi artısından fazla olan gelişime açık;
              artıları en az {CONDUCT_MIN_TEACHERS} öğretmenden gelen ve sınıfın
              üst %{Math.round(CONDUCT_HIGH_SHARE * 100)}'unda olan yüksek;
              diğerleri orta. Excel dosyasını panelden indirebilirsiniz.
            </T>
          </Card>
        </>
      )}
    </Screen>
  );
}
