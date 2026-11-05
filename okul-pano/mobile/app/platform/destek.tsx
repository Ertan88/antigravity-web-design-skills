import type { SupportTicket } from '@okulpano/shared/issues';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { TicketRow } from '../../src/support.tsx';
import { Empty, ErrorNote, Loading, Screen, Segmented } from '../../src/ui.tsx';

/** Platform yöneticisi: okullardan gelen destek talepleri */
export default function PlatformDestek() {
  const { me } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const q = useQuery({ queryKey: ['platform-support'], queryFn: () => api<SupportTicket[]>('/api/platform/support'), enabled: Boolean(me?.user.isSuperAdmin), refetchInterval: 60_000 });
  useEffect(() => {
    if (id) router.push(`/talep/${id}?p=1`);
  }, [id]);
  const all = q.data ?? [];
  const rows = all.filter((t) => (tab === 'open' ? t.status !== 'resolved' : t.status === 'resolved'));
  const waiting = all.filter((t) => t.status === 'new').length;
  return (
    <Screen back title="Destek talepleri" subtitle={waiting ? `${waiting} talep yanıt bekliyor` : 'Okul müdürü ve yöneticilerinden'} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: `Açık (${all.length - all.filter((t) => t.status === 'resolved').length})` },
          { value: 'resolved', label: 'Çözüldü' },
        ]}
      />
      {q.isLoading ? <Loading /> : rows.length ? rows.map((t) => <TicketRow key={t.id} t={t} platform />) : <Empty icon="lifebuoy" title="Bu sekmede talep yok" />}
    </Screen>
  );
}
