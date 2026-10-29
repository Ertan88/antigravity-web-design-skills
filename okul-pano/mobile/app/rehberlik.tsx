import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useSchoolPath } from '../src/auth.tsx';
import { useConductAlerts, type ConductAlert } from '../src/data.ts';
import { clock } from '../src/day.ts';
import { Sheet } from '../src/sheet.tsx';
import { Text, TextInput } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Avatar, Button, Card, Empty, ErrorNote, Loading, Screen, Segmented, T } from '../src/ui.tsx';

const stamp = (iso: string) => `${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(iso))} ${clock(iso)}`;

/**
 * Rehberlik uyarıları: kısa sürede okulun belirlediği sayıda eksi alan öğrenciler. Yalnızca rehber öğretmen ve idare
 * görür; öğrenci, veli ve öğretmenlere gösterilmez. "Görüşüldü" ile kapanır, isteğe bağlı görüşme notu bırakılır.
 */
export default function Rehberlik() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const list = useConductAlerts(status);
  const path = useSchoolPath('conduct');
  const qc = useQueryClient();
  const [resolving, setResolving] = useState<ConductAlert | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = list.data;

  const resolve = async () => {
    if (!resolving) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${path}/alerts/${resolving.id}/resolve`, {
        method: 'POST',
        body: { note: note.trim() || null },
      });
      setResolving(null);
      void qc.invalidateQueries({
        predicate: (q) => String(q.queryKey[1] ?? '').startsWith('conduct/alerts'),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Rehberlik Uyarıları" subtitle="Yalnızca rehber öğretmen ve idare görür" back refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: `Bekleyen${d?.open ? ` · ${d.open}` : ''}` },
          { value: 'resolved', label: 'Görüşüldü' },
        ]}
      />
      <ErrorNote error={list.error} />
      {!d ? (
        <Loading />
      ) : !d.alerts.length ? (
        <Empty
          icon="heart-outline"
          title={status === 'open' ? 'Bekleyen uyarı yok' : 'Henüz görüşülen yok'}
          text={status === 'open' ? 'Eşiği aşan öğrenci olunca burada görünür ve bildirim gelir.' : undefined}
        />
      ) : (
        d.alerts.map((a) => (
          <Card key={a.id} style={{ gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/ogrenci/${a.student.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={a.student.fullName} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 15.5,
                    fontWeight: '800',
                    color: colors.ink,
                  }}
                  numberOfLines={1}
                >
                  {a.student.fullName}
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    color: colors.faint,
                    fontWeight: '600',
                  }}
                >
                  {a.student.className ?? 'Sınıfsız'} · No {a.student.schoolNo} · {stamp(a.createdAt)}
                </Text>
              </View>
            </Pressable>
            <View
              style={{
                backgroundColor: colors.dangerSoft,
                borderRadius: radius.md,
                padding: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 13.5,
                  fontWeight: '800',
                  color: colors.danger,
                }}
              >
                Son {a.windowDays} günde {a.minusCount} eksi
              </Text>
              <Text style={{ fontSize: 13, color: colors.ink, marginTop: 2 }}>{a.summary}</Text>
            </View>
            {a.resolvedAt ? (
              <T size={12.5} color={colors.muted}>
                Görüşüldü · {a.resolvedByName ?? 'Kullanıcı'} · {stamp(a.resolvedAt)}
                {a.note ? `\n“${a.note}”` : ''}
              </T>
            ) : (
              <Button
                variant="secondary"
                onPress={() => {
                  setNote('');
                  setError(null);
                  setResolving(a);
                }}
              >
                Görüşüldü
              </Button>
            )}
          </Card>
        ))
      )}
      <Sheet open={Boolean(resolving)} onClose={() => setResolving(null)}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{resolving?.student.fullName} · görüşüldü</Text>
        <T size={12.5} color={colors.faint} style={{ marginTop: 4 }}>
          Görüşme notu isteğe bağlıdır; yalnızca rehber öğretmen ve idare görür.
        </T>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ör. Öğrenciyle görüşüldü, veli bilgilendirildi."
          placeholderTextColor={colors.faint}
          multiline
          maxLength={300}
          style={{
            marginTop: 12,
            minHeight: 90,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bg,
            padding: 12,
            fontSize: 15,
            color: colors.ink,
            textAlignVertical: 'top',
          }}
        />
        {error && (
          <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
            {error}
          </T>
        )}
        <View style={{ marginTop: 12 }}>
          <Button loading={busy} onPress={() => void resolve()}>
            Kaydet
          </Button>
        </View>
      </Sheet>
    </Screen>
  );
}
