import { dutySchema, WEEKDAY_NAMES } from '@okulpano/shared';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { Field, Input, Segmented, Select } from '../components/ui.tsx';
import { nameMap, useList, type Duty, type Teacher } from '../lib/data.ts';

type Form = { weekday: number; area: string; teacherId: string; sortOrder: number };

const todayWeekday = () => ((new Date().getDay() + 6) % 7) + 1;

export function Duties() {
  const [day, setDay] = useState(() => Math.min(todayWeekday(), 5));
  const teachers = useList<Teacher>('teachers');
  const duties = useList<Duty>('duties');
  const names = nameMap(teachers.data, (t) => t.fullName);
  const areas = [...new Set((duties.data ?? []).map((d) => d.area))].sort((a, b) => a.localeCompare(b, 'tr'));
  const counts = (duties.data ?? []).reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.weekday]: (acc[d.weekday] ?? 0) + 1 }), {});

  return (
    <CrudPage<Duty, Form>
      resource="duties"
      label="Nöbet"
      title="Nöbet Çizelgesi"
      description="Her gün için nöbet yeri ve nöbetçi öğretmen. Pano bugünün nöbetçilerini kendiliğinden gösterir."
      permission="duties.manage"
      icon={<ShieldCheck className="size-6" />}
      emptyTitle={`${WEEKDAY_NAMES[day]} için nöbet girilmemiş`}
      emptyText="Nöbet yerlerini (Zemin Kat, Bahçe, Kantin…) ve öğretmenleri ekleyin."
      addLabel="Nöbet ekle"
      reorderable
      schema={dutySchema}
      toolbar={
        <Segmented
          value={day}
          onChange={setDay}
          options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
            value: d,
            label: (
              <span>
                {WEEKDAY_NAMES[d]}
                {counts[d] ? <span className="ml-1.5 text-xs text-slate-400">{counts[d]}</span> : null}
              </span>
            ),
          }))}
        />
      }
      select={(rows) => rows.filter((r) => r.weekday === day)}
      columns={[
        { header: 'Nöbet yeri', cell: (r) => <span className="font-medium text-slate-600">{r.area}</span> },
        { header: 'Öğretmen', cell: (r) => <span className="font-semibold text-slate-900">{names.get(r.teacherId) ?? '—'}</span> },
      ]}
      emptyForm={() => ({ weekday: day, area: '', teacherId: '', sortOrder: (counts[day] ?? 0) + 1 })}
      toForm={(r) => ({ weekday: r.weekday, area: r.area, teacherId: r.teacherId, sortOrder: r.sortOrder })}
      toPayload={(f) => f}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Field label="Gün" error={errors.weekday}>
            {(id) => (
              <Select id={id} value={v.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_NAMES[d]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Nöbet yeri" error={errors.area}>
            {(id) => (
              <>
                <Input id={id} list="duty-areas" value={v.area} onChange={(e) => set('area', e.target.value)} placeholder="ör. 1. Kat" invalid={Boolean(errors.area)} />
                <datalist id="duty-areas">
                  {areas.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Öğretmen" error={errors.teacherId ? 'Bir öğretmen seçin' : undefined} help={teachers.data?.length === 0 ? 'Önce Öğretmenler bölümünden öğretmen ekleyin.' : undefined}>
            {(id) => (
              <Select id={id} value={v.teacherId} onChange={(e) => set('teacherId', e.target.value)} invalid={Boolean(errors.teacherId)}>
                <option value="">Seçin…</option>
                {(teachers.data ?? [])
                  .filter((t) => t.isActive || t.id === v.teacherId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                      {t.branch ? ` · ${t.branch}` : ''}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </>
      )}
    />
  );
}
