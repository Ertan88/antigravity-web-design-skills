import { teacherSchema } from '@okulpano/shared';
import { Search, Users } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { Badge, Field, Input, Toggle } from '../components/ui.tsx';
import type { Teacher } from '../lib/data.ts';

type Form = { fullName: string; branch: string; isActive: boolean };

export function Teachers() {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('tr-TR');

  return (
    <CrudPage<Teacher, Form>
      resource="teachers"
      label="Öğretmen"
      title="Öğretmenler"
      description="Nöbet çizelgesi, izinler ve ders programında seçilen öğretmen listesi."
      permission="directory.manage"
      icon={<Users className="size-6" />}
      emptyTitle="Öğretmen eklenmemiş"
      emptyText="Nöbet ve ders programı girebilmek için önce öğretmenleri ekleyin."
      addLabel="Yeni öğretmen"
      schema={teacherSchema}
      toolbar={
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Öğretmen ara" className="pl-9" aria-label="Öğretmen ara" />
        </div>
      }
      select={(rows) =>
        needle
          ? rows.filter((r) => `${r.fullName} ${r.branch ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle))
          : rows
      }
      columns={[
        { header: 'Ad soyad', cell: (r) => <span className="font-semibold text-slate-900">{r.fullName}</span> },
        { header: 'Branş', cell: (r) => <span className="text-slate-600">{r.branch ?? '—'}</span> },
        { header: 'Durum', cell: (r) => (r.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Ayrıldı</Badge>) },
      ]}
      emptyForm={() => ({ fullName: '', branch: '', isActive: true })}
      toForm={(r) => ({ fullName: r.fullName, branch: r.branch ?? '', isActive: r.isActive })}
      toPayload={(f) => ({ fullName: f.fullName, branch: f.branch || null, isActive: f.isActive })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Field label="Ad soyad" error={errors.fullName}>
            {(id) => <Input id={id} value={v.fullName} onChange={(e) => set('fullName', e.target.value)} invalid={Boolean(errors.fullName)} />}
          </Field>
          <Field label="Branş" error={errors.branch}>
            {(id) => <Input id={id} value={v.branch} onChange={(e) => set('branch', e.target.value)} placeholder="ör. Matematik" />}
          </Field>
          <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Aktif" description="Okuldan ayrılan öğretmeni silmek yerine pasifleştirebilirsiniz." />
        </>
      )}
    />
  );
}
