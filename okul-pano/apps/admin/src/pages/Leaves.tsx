import { leaveSchema, resolveLayout } from '@okulpano/shared';
import { UserMinus } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { Badge, Field, Input, Select, Toggle } from '../components/ui.tsx';
import { nameMap, useList, useSchool, type Leave, type Teacher } from '../lib/data.ts';
import { formatDate, todayIso } from '../lib/format.ts';

type Form = { teacherId: string; startDate: string; endDate: string; note: string };

export function Leaves() {
  const [showPast, setShowPast] = useState(false);
  const teachers = useList<Teacher>('teachers');
  const school = useSchool();
  const names = nameMap(teachers.data, (t) => t.fullName);
  const today = todayIso();
  const layout = school.data ? resolveLayout(school.data.settings) : null;
  const hidden = layout && ![...layout.left, ...layout.right].includes('leaves');

  return (
    <CrudPage<Leave, Form>
      resource="leaves"
      label="İzin"
      title="İzinli Öğretmenler"
      description={
        <>
          İzin tarihleri içinde öğretmenin adı panonun sol sütununda görünür. İzin nedeni yalnızca panelde saklanır, panoda gösterilmez.
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
            r.startDate <= today && r.endDate >= today ? (
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
