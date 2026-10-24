import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Table, Td } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchoolPath } from '../lib/data.ts';
import { formatDateTime } from '../lib/format.ts';

interface Row {
  id: string;
  action: string;
  entity: string;
  summary: string | null;
  userName: string | null;
  createdAt: string;
}

const ACTION: Record<string, { label: string; tone: 'green' | 'blue' | 'red' | 'slate' | 'amber' }> = {
  create: { label: 'Ekleme', tone: 'green' },
  update: { label: 'Güncelleme', tone: 'blue' },
  delete: { label: 'Silme', tone: 'red' },
  publish: { label: 'Yayına alma', tone: 'green' },
  unpublish: { label: 'Yayından kaldırma', tone: 'amber' },
};

export function Audit() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('audit');
  const q = useInfiniteQuery({
    queryKey: [schoolId, 'audit'],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<Row[]>(`${path}${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]!.createdAt : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader title="Etkinlik Geçmişi" description="Panelde kimin, ne zaman, neyi değiştirdiği. Kayıtlar silinemez." />
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : !rows.length ? (
          <EmptyState icon={<History className="size-6" />} title="Henüz kayıt yok" />
        ) : (
          <>
            <Table head={['Zaman', 'Kullanıcı', 'İşlem', 'Bölüm', 'Ayrıntı']}>
              {rows.map((r) => {
                const a = ACTION[r.action] ?? { label: r.action, tone: 'slate' as const };
                return (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-slate-500">{formatDateTime(r.createdAt)}</Td>
                    <Td className="font-medium whitespace-nowrap">{r.userName ?? 'Silinmiş kullanıcı'}</Td>
                    <Td>
                      <Badge tone={a.tone}>{a.label}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{r.entity}</Td>
                    <Td className="max-w-md truncate text-slate-600">{r.summary}</Td>
                  </tr>
                );
              })}
            </Table>
            {q.hasNextPage && (
              <div className="border-t border-slate-100 p-4 text-center">
                <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  Daha eski kayıtlar
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
