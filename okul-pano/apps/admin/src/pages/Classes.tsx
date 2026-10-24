import { classGroupSchema } from '@okulpano/shared';
import { BookOpenCheck } from 'lucide-react';
import { CrudPage } from '../components/CrudPage.tsx';
import { Field, Input } from '../components/ui.tsx';
import type { ClassGroup } from '../lib/data.ts';

type Form = { name: string; sortOrder: number };

export function Classes() {
  return (
    <CrudPage<ClassGroup, Form>
      resource="classes"
      label="Sınıf"
      title="Sınıflar"
      description="Ders programı ve doğum günlerinde kullanılan şubeler. Panodaki sıralama buradaki sıraya göredir."
      permission="directory.manage"
      icon={<BookOpenCheck className="size-6" />}
      emptyTitle="Sınıf eklenmemiş"
      emptyText="9-A, 9-B gibi şubeleri ekleyin."
      addLabel="Yeni sınıf"
      reorderable
      schema={classGroupSchema}
      columns={[{ header: 'Sınıf', cell: (r) => <span className="font-semibold text-slate-900">{r.name}</span> }]}
      emptyForm={() => ({ name: '', sortOrder: 0 })}
      toForm={(r) => ({ name: r.name, sortOrder: r.sortOrder })}
      toPayload={(f) => ({ name: f.name.trim().toLocaleUpperCase('tr-TR'), sortOrder: f.sortOrder })}
      renderForm={({ values: v, set, errors }) => (
        <Field label="Sınıf adı" error={errors.name} help="ör. 9-A, 10-B, Anasınıfı">
          {(id) => <Input id={id} value={v.name} maxLength={20} onChange={(e) => set('name', e.target.value)} invalid={Boolean(errors.name)} />}
        </Field>
      )}
    />
  );
}
