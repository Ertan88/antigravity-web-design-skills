import { countdown, examSchema } from '@okulpano/shared';
import { GraduationCap } from 'lucide-react';
import { CrudPage } from '../components/CrudPage.tsx';
import { Badge, Field, Input, Toggle } from '../components/ui.tsx';
import type { Exam } from '../lib/data.ts';
import { formatDateTime, isoToLocalInput, localInputToIso } from '../lib/format.ts';

type Form = { title: string; examAt: string; isActive: boolean };

const PRESETS = ['LGS', 'YKS', 'TYT', 'AYT', 'YDT', 'KPSS', '1. Dönem Ortak Sınavı', '2. Dönem Ortak Sınavı'];

export function Exams() {
  return (
    <CrudPage<Exam, Form>
      resource="exams"
      label="Sınav"
      title="Sınav Sayacı"
      description="Panonun sol üstünde geri sayımı gösterilen merkezi ve okul sınavları. En yakın aktif sınav büyük, sonraki iki sınav küçük gösterilir."
      permission="exams.manage"
      icon={<GraduationCap className="size-6" />}
      emptyTitle="Sınav eklenmemiş"
      emptyText="LGS, YKS ya da ortak sınav tarihini ekleyin; pano gün, saat ve dakika olarak geri sayar."
      addLabel="Yeni sınav"
      activeToggle
      schema={examSchema}
      columns={[
        { header: 'Sınav', cell: (r) => <span className="font-semibold text-ink">{r.title}</span> },
        { header: 'Tarih ve saat', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.examAt)}</span> },
        {
          header: 'Kalan',
          cell: (r) => {
            const c = countdown(Date.parse(r.examAt), Date.now());
            return c.done ? <Badge>Geçti</Badge> : <Badge tone="blue">{c.days} gün {c.hours} saat</Badge>;
          },
        },
      ]}
      emptyForm={() => ({ title: '', examAt: '', isActive: true })}
      toForm={(r) => ({ title: r.title, examAt: isoToLocalInput(r.examAt), isActive: r.isActive })}
      toPayload={(f) => ({ title: f.title, examAt: localInputToIso(f.examAt), isActive: f.isActive })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Field label="Sınav adı" error={errors.title}>
            {(id) => (
              <div className="space-y-2">
                <Input id={id} value={v.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="ör. LGS" invalid={Boolean(errors.title)} />
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set('title', p)}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
          <Field label="Sınav tarihi ve saati" error={errors.examAt} help="Resmî tarihleri ÖSYM / MEB duyurularından kontrol edin.">
            {(id) => <Input id={id} type="datetime-local" value={v.examAt} onChange={(e) => set('examAt', e.target.value)} invalid={Boolean(errors.examAt)} />}
          </Field>
          <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Panoda göster" />
        </>
      )}
    />
  );
}
