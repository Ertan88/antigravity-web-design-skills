import type { SupportTicket } from '@okulpano/shared/issues';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { TicketRow } from '../src/support.tsx';
import { colors } from '../src/theme.ts';
import { Button, Empty, ErrorNote, Loading, Screen, T } from '../src/ui.tsx';

/** Platforma yaz: okul müdürü ve yöneticiler Okul Yayın ekibine sorun, öneri ya da soru iletir */
export default function PlatformaYaz() {
  const { school, role } = useAuth();
  const allowed = role === 'owner' || role === 'admin';
  const path = useSchoolPath('support');
  const { id } = useLocalSearchParams<{ id?: string }>();
  const q = useQuery({ queryKey: [school?.id, 'support'], queryFn: () => api<SupportTicket[]>(path), enabled: Boolean(school) && allowed, refetchInterval: 60_000 });
  useEffect(() => {
    if (id) router.push(`/talep/${id}`);
  }, [id]);
  if (!allowed) {
    return (
      <Screen back title="Platforma yaz">
        <Empty icon="lock-closed-outline" title="Yalnızca okul müdürü ve yöneticiler" text="Bir sorun görürseniz okul idarenize “Sorun bildir” ile iletin." />
      </Screen>
    );
  }
  return (
    <Screen
      back
      title="Platforma yaz"
      subtitle="Sorun, öneri ve sorularınız Okul Yayın ekibine"
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={
        <Button icon="add" onPress={() => router.push('/talep/yeni')}>
          Yeni talep
        </Button>
      }
    >
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : q.data?.length ? (
        q.data.map((t) => <TicketRow key={t.id} t={t} />)
      ) : (
        <Empty icon="lifebuoy" title="Henüz talebiniz yok" text="Yanıt geldiğinde telefonunuza ve bildirim kutunuza düşer." />
      )}
      <T size={12} color={colors.faint}>
        Talepler okulunuzun bütün yöneticilerine görünür.
      </T>
    </Screen>
  );
}
