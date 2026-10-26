import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useAnnouncements, useLeaves, useTeachers, type Announcement, type Leave } from '../../src/data.ts';
import { dayTitle, timeAgo } from '../../src/day.ts';
import { AnnouncementPreview } from '../../src/preview.tsx';
import { colors } from '../../src/theme.ts';
import { Button, Card, Empty, Field, Loading, Screen, SectionTitle, T } from '../../src/ui.tsx';

/** Onay kutusu (tasarım 4): onaya düşen duyurular ve öğretmenlerin bildirdiği izinler */
export default function Onaylar() {
  const { can, school } = useAuth();
  const qc = useQueryClient();
  const canAnn = can('announcements.approve');
  const canLeave = can('leaves.manage');
  const ann = useAnnouncements();
  const leaves = useLeaves(canLeave);
  const teachers = useTeachers(canLeave);
  const pendingAnn = canAnn ? (ann.data ?? []).filter((a) => a.approvalStatus === 'pending') : [];
  const pendingLeaves = canLeave ? (leaves.data ?? []).filter((l) => l.approvalStatus === 'pending') : [];
  const names = new Map((teachers.data ?? []).map((t) => [t.id, t.fullName]));
  const total = pendingAnn.length + pendingLeaves.length;
  const refresh = () =>
    Promise.all(['announcements', 'leaves', 'control-center', 'notifications'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));

  return (
    <Screen
      title="Onay bekleyenler"
      subtitle={total ? `${total} içerik onayınızı bekliyor` : 'Bekleyen içerik yok'}
      refreshing={ann.isRefetching}
      onRefresh={() => void refresh()}
    >
      {ann.isLoading ? (
        <Loading />
      ) : !total ? (
        <Card>
          <Empty icon="checkmark-done-outline" title="Hepsi tamam" text="Öğretmenlerin gönderdiği duyurular ve izin bildirimleri burada görünür." />
        </Card>
      ) : (
        <>
          {pendingAnn.map((a) => (
            <AnnouncementReview key={a.id} a={a} onDone={refresh} />
          ))}
          {pendingLeaves.length > 0 && <SectionTitle>İzin bildirimleri</SectionTitle>}
          {pendingLeaves.map((l) => (
            <LeaveReview key={l.id} l={l} name={names.get(l.teacherId) ?? 'Öğretmen'} onDone={refresh} />
          ))}
        </>
      )}
    </Screen>
  );
}

function useReview(resource: 'announcements' | 'leaves', id: string, onDone: () => Promise<unknown>) {
  const path = useSchoolPath(`${resource}/${id}`);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: 'approve' | 'reject', note?: string) => {
    setBusy(action);
    setError(null);
    try {
      await api(`${path}/${action}`, { method: 'POST', body: note ? { note } : {} });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

function AnnouncementReview({ a, onDone }: { a: Announcement; onDone: () => Promise<unknown> }) {
  const { busy, error, run } = useReview('announcements', a.id, onDone);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <AnnouncementPreview kind={a.kind} title={a.title} body={a.body} imageUrl={a.imageUrl} design={a.design} />
      <View style={{ padding: 14, gap: 10 }}>
        <T weight="700" size={16}>
          {a.title}
        </T>
        <T size={13} color={colors.muted}>
          {a.createdByName ?? 'Bir kullanıcı'} gönderdi · {timeAgo(a.updatedAt)}
          {a.screenIds?.length ? ` · ${a.screenIds.length} pano` : ' · tüm panolar'}
          {a.schedule?.phase === 'break' ? ' · teneffüslerde' : ''}
        </T>
        {rejecting && (
          <Field label="Düzeltme nedeni (öğretmen görür)" value={note} onChangeText={setNote} placeholder="ör. Tarih yanlış yazılmış" multiline maxLength={200} />
        )}
        {error && <T color={colors.danger}>{error}</T>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {rejecting ? (
            <>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => setRejecting(false)}>
                Vazgeç
              </Button>
              <Button variant="danger" style={{ flex: 1 }} disabled={note.trim().length < 3} loading={busy === 'reject'} onPress={() => void run('reject', note.trim())}>
                Geri gönder
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => setRejecting(true)}>
                Geri gönder
              </Button>
              <Button variant="success" style={{ flex: 1 }} loading={busy === 'approve'} onPress={() => void run('approve')}>
                Onayla
              </Button>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

function LeaveReview({ l, name, onDone }: { l: Leave; name: string; onDone: () => Promise<unknown> }) {
  const { busy, error, run } = useReview('leaves', l.id, onDone);
  const range = l.startDate === l.endDate ? dayTitle(l.startDate) : `${dayTitle(l.startDate, { day: 'numeric', month: 'long' })} – ${dayTitle(l.endDate)}`;
  return (
    <Card style={{ gap: 10 }}>
      <T weight="700" size={16}>
        {name}
      </T>
      <T size={13} color={colors.muted}>
        {range}
        {l.note ? ` · ${l.note}` : ''}
      </T>
      <T size={12} color={colors.muted}>
        Onaylanınca panoda izinli görünür; nöbeti varsa boş nöbet olarak size hatırlatılır.
      </T>
      {error && <T color={colors.danger}>{error}</T>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant="secondary" style={{ flex: 1 }} loading={busy === 'reject'} onPress={() => void run('reject')}>
          Reddet
        </Button>
        <Button variant="success" style={{ flex: 1 }} loading={busy === 'approve'} onPress={() => void run('approve')}>
          Onayla
        </Button>
      </View>
    </Card>
  );
}
