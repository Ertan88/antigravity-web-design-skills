import { layoutModules, leaveSchema, resolveLayout } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Button, Field, Input, Select, Toggle } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchool, useSchoolPath, type Leave, type Teacher } from '../lib/data.ts';
import { formatDate, todayIso } from '../lib/format.ts';

type Form = { teacherId: string; startDate: string; endDate: string; note: string };

export function Leaves() {
  const [showPast, setShowPast] = useState(false);
  const teachers = useList<Teacher>('teachers');
  const school = useSchool();
  const names = nameMap(teachers.data, (t) => t.fullName);
  const today = todayIso();
  const layout = school.data ? resolveLayout(school.data.settings) : null;
  const hidden = layout && !layoutModules(layout).includes('leaves');
  const { schoolId } = useAuth();
  const path = useSchoolPath('leaves');
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // Öğretmenin mobil uygulamadan bildirdiği izin: onaylanınca panoda görünür
  const review = async (row: Leave, status: 'approve' | 'reject') => {
    setBusy(row.id);
    try {
      await api(`${path}/${row.id}/${status}`, { method: 'POST', body: {} });
      await qc.invalidateQueries({ queryKey: [schoolId, 'leaves'] });
      toast.success(status === 'approve' ? `${names.get(row.teacherId) ?? 'İzin'} onaylandı, panoda görünüyor` : 'İzin talebi reddedildi');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
    }
  };

  return (
    <CrudPage<Leave, Form>
      resource="leaves"
      label="İzin"
      title="İzinli Öğretmenler"
      description={
        <>
          İzin tarihleri içinde öğretmenin adı panonun sol sütununda görünür. İzin nedeni yalnızca panelde saklanır, panoda gösterilmez.
          Öğretmenlerin mobil uygulamadan bildirdiği izinler onaylanınca panoya çıkar.
          {hidden && <span className="mt-1 block font-medium text-amber-700">Bu alan şu an pano düzeninde yok (Panolar › Pano düzeni).</span>}
        </>
      }
      permission="leaves.manage"
      icon={<UserMinus className="size-6" />}
      emptyTitle="Kayıtlı izin yok"
      emptyText="Raporlu ya da izinli öğretmenleri tarih aralığıyla ekleyin."
      addLabel="İzin ekle"
      schema={leaveSchema}
      toolbar={<Toggle checked={showPast} onChange={setShowPast} label="Geçmiş izinleri de göster" />}
      select={(rows) => (showPast ? rows : rows.filter((r) => r.endDate >= today))}
      columns={[
        { header: 'Öğretmen', cell: (r) => <span className="font-semibold text-ink">{names.get(r.teacherId) ?? '—'}</span> },
        {
          header: 'Tarih',
          cell: (r) => (
            <span className="whitespace-nowrap text-slate-600">
              {r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
            </span>
          ),
        },
        {
          header: 'Durum',
          cell: (r) =>
            r.approvalStatus === 'pending' ? (
              <Badge tone="amber">Onay bekliyor</Badge>
            ) : r.approvalStatus === 'rejected' ? (
              <Badge tone="red">Reddedildi</Badge>
            ) : r.startDate <= today && r.endDate >= today ? (
              <Badge tone="amber" dot>
                Bugün izinli
              </Badge>
            ) : r.startDate > today ? (
              <Badge tone="blue">Yaklaşan</Badge>
            ) : (
              <Badge>Geçmiş</Badge>
            ),
        },
        { header: 'Not', cell: (r) => <span className="text-slate-500">{r.note ?? ''}</span> },
      ]}
      rowActions={(r) =>
        r.approvalStatus === 'pending' ? (
          <span className="flex gap-1.5">
            <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => review(r, 'reject')}>
              <X className="size-4" /> Reddet
            </Button>
            <Button size="sm" disabled={busy === r.id} onClick={() => review(r, 'approve')}>
              <Check className="size-4" /> Onayla
            </Button>
          </span>
        ) : null
      }
      rowState={(r) => ({ dim: r.approvalStatus === 'rejected' })}
      emptyForm={() => ({ teacherId: '', startDate: today, endDate: today, note: '' })}
      toForm={(r) => ({ teacherId: r.teacherId, startDate: r.startDate, endDate: r.endDate, note: r.note ?? '' })}
      toPayload={(f) => ({ ...f, note: f.note || null })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Field label="Öğretmen" error={errors.teacherId ? 'Bir öğretmen seçin' : undefined}>
            {(id) => (
              <Select id={id} value={v.teacherId} onChange={(e) => set('teacherId', e.target.value)} invalid={Boolean(errors.teacherId)}>
                <option value="">Seçin…</option>
                {(teachers.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Başlangıç" error={errors.startDate}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={v.startDate}
                  onChange={(e) => {
                    set('startDate', e.target.value);
                    if (v.endDate < e.target.value) set('endDate', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Bitiş (dahil)" error={errors.endDate}>
              {(id) => <Input id={id} type="date" value={v.endDate} min={v.startDate} onChange={(e) => set('endDate', e.target.value)} invalid={Boolean(errors.endDate)} />}
            </Field>
          </div>
          <Field label="Not (yalnızca panelde görünür)" error={errors.note}>
            {(id) => <Input id={id} value={v.note} maxLength={120} onChange={(e) => set('note', e.target.value)} placeholder="ör. Sağlık raporu" />}
          </Field>
        </>
      )}
    />
  );
}
