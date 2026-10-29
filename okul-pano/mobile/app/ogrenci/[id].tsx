import { CONDUCT_GROUPS } from "@okulpano/shared/conduct";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../src/api.ts";
import { useSchoolPath } from "../../src/auth.tsx";
import { useConductStudent } from "../../src/data.ts";
import { clock } from "../../src/day.ts";
import { Text } from "../../src/text.tsx";
import { colors } from "../../src/theme.ts";
import {
  BentoRow,
  Card,
  confirm,
  Empty,
  ErrorNote,
  Icon,
  Loading,
  Screen,
  SectionTitle,
  T,
  Tile,
} from "../../src/ui.tsx";

const shortStamp = (iso: string) =>
  `${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(iso))} ${clock(iso)}`;

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shift = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(y, mo - 1 + by, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, mo - 1, 15));
};

/** Öğrenci kartı: ayın dengesi, kriter dağılımı, kimin ne zaman ne verdiği (öğretmenler, rehber ve idare görür) */
export default function StudentCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [month, setMonth] = useState(thisMonth());
  const card = useConductStudent(id, month);
  const path = useSchoolPath("conduct");
  const qc = useQueryClient();
  const d = card.data;
  const top = d
    ? Math.max(1, ...d.byCriterion.map((c) => Math.abs(c.points)))
    : 1;

  const remove = async (entryId: string) => {
    if (
      !(await confirm("Kayıt silinsin mi?", "Bu gözlem kaydı silinir.", "Sil"))
    )
      return;
    await api(`${path}/entries/${entryId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    void qc.invalidateQueries({
      predicate: (q) => String(q.queryKey[1] ?? "").startsWith("conduct/"),
    });
  };

  return (
    <Screen
      title={d?.student.fullName ?? "Öğrenci"}
      subtitle={
        d
          ? `${d.student.className ?? "Sınıfsız"} · No ${d.student.schoolNo}`
          : undefined
      }
      back
      refreshing={card.isRefetching}
      onRefresh={() => void card.refetch()}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki ay"
          onPress={() => setMonth(shift(month, -1))}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.ink }}>
          {monthLabel(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki ay"
          disabled={month >= thisMonth()}
          onPress={() => setMonth(shift(month, 1))}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: month >= thisMonth() ? 0.4 : 1,
          }}
        >
          <Icon name="chevron-forward" size={18} />
        </Pressable>
      </View>
      <ErrorNote error={card.error} />
      {!d ? (
        <Loading />
      ) : (
        <>
          <BentoRow>
            <Tile
              tone="ink"
              icon="analytics-outline"
              label="Bu ay net"
              value={signed(d.totals.net)}
              caption={`${d.totals.teachers} öğretmenden`}
              style={{ flex: 1.2 }}
              big
            >
              <View style={{ marginTop: 12, gap: 8 }}>
                {d.byCriterion.slice(0, 4).map((c) => (
                  <View key={`${c.label}${c.points}`}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 11.5,
                          fontWeight: "600",
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 11.5,
                          fontWeight: "800",
                        }}
                      >
                        {signed(c.points)}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: "rgba(255,255,255,0.15)",
                        marginTop: 3,
                      }}
                    >
                      <View
                        style={{
                          width: `${(Math.abs(c.points) / top) * 100}%`,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: c.points > 0 ? "#fde68a" : "#fb7185",
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </Tile>
            <View style={{ flex: 1, gap: 10 }}>
              <Tile
                tone="mint"
                icon="add-circle-outline"
                label="Artı"
                value={d.totals.plus}
                caption={`kayıt · +${d.totals.plusPoints}`}
                style={{ flex: 1 }}
              />
              <Tile
                tone="rose"
                icon="remove-circle-outline"
                label="Eksi"
                value={d.totals.minus}
                caption={`kayıt · −${d.totals.minusPoints}`}
                style={{ flex: 1 }}
              />
            </View>
          </BentoRow>
          <SectionTitle>Kayıtlar</SectionTitle>
          {d.entries.length ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {d.entries.map((e, i) => {
                const good = e.points > 0;
                return (
                  <View
                    key={e.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 12,
                      borderBottomWidth: i === d.entries.length - 1 ? 0 : 1,
                      borderBottomColor: colors.divider,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: good
                          ? colors.successSoft
                          : colors.dangerSoft,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 13,
                          color: good ? colors.success : colors.danger,
                        }}
                      >
                        {signed(e.points)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: colors.ink,
                        }}
                      >
                        {e.label}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: colors.faint }}
                        numberOfLines={2}
                      >
                        {e.mine ? "Siz" : (e.userName ?? "Bir öğretmen")} ·{" "}
                        {CONDUCT_GROUPS[e.group]}
                        {e.note ? ` · “${e.note}”` : ""}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.subtle,
                        fontWeight: "600",
                      }}
                    >
                      {shortStamp(e.createdAt)}
                    </Text>
                    {e.mine && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Kaydı sil"
                        hitSlop={8}
                        onPress={() => void remove(e.id)}
                      >
                        <Icon
                          name="trash-outline"
                          size={17}
                          color={colors.faint}
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </Card>
          ) : (
            <Empty icon="clipboard-outline" title="Bu ay kayıt yok" />
          )}
          <T size={12} color={colors.faint} style={{ textAlign: "center" }}>
            Bu bilgileri yalnızca öğretmenler, rehber öğretmenler ve okul
            idaresi görür; veliler ve pano görmez.
          </T>
        </>
      )}
    </Screen>
  );
}
