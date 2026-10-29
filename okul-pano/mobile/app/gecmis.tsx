import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import type { AuditRow } from '../src/data.ts';
import { clock, fullDate, localIso } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Card, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

const ACTION: Record<string, string> = { create: 'ekledi', update: 'değiştirdi', delete: 'sildi', approve: 'onayladı', reject: 'düzeltmeye gönderdi' };

/** Etkinlik geçmişi: kim, ne zaman, neyi değiştirdi (son 100 işlem, günlere göre) */
export default function Gecmis() {
  const { school, can } = useAuth();
  const path = useSchoolPath('audit');
  const q = useQuery({ queryKey: [school?.id, 'audit'], queryFn: () => api<AuditRow[]>(path), enabled: Boolean(school) && can('users.manage') });
  const days = new Map<string, AuditRow[]>();
  for (const r of q.data ?? []) {
    // Telefonun saatine göre gün (gece yarısına yakın işlemler doğru güne düşsün)
    const d = localIso(new Date(r.createdAt));
    days.set(d, [...(days.get(d) ?? []), r]);
  }
  return (
    <Screen back title="Etkinlik geçmişi" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : !days.size ? (
        <Card>
          <Empty icon="time-outline" title="Henüz kayıt yok" />
        </Card>
      ) : (
        [...days].map(([d, rows]) => (
          <View key={d} style={{ gap: 6 }}>
            <SectionTitle>{fullDate(d)}</SectionTitle>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {rows.map((r, i) => (
                <View key={r.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                  <T size={13} color={colors.muted} style={{ width: 44, fontVariant: ['tabular-nums'] }}>
                    {clock(r.createdAt)}
                  </T>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T size={14} weight="600">
                      {r.userName ?? 'Sistem'} · {r.entity} {ACTION[r.action] ?? r.action}
                    </T>
                    {r.summary ? (
                      <T size={13} color={colors.muted} lines={2}>
                        {r.summary}
                      </T>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}
