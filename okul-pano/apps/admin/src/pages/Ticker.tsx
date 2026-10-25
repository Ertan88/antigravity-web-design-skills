import { tickerSchema } from '@okulpano/shared';
import { TextCursorInput } from 'lucide-react';
import { CrudPage } from '../components/CrudPage.tsx';
import { Field, Input, Toggle } from '../components/ui.tsx';
import type { TickerItem } from '../lib/data.ts';
import { expiredRowState, isoToLocalInput, localInputToIso, sortByPublish } from '../lib/format.ts';
import { PublishCell } from './Announcements.tsx';
import { TickerSources } from './TickerSources.tsx';

type Form = { text: string; startsAt: string; endsAt: string; isActive: boolean };

export function Ticker() {
  return (
    <CrudPage<TickerItem, Form>
      resource="ticker"
      label="Kayan yazı"
      title="Kayan Yazı"
      description="Panonun alt bandında sırayla akan kısa bilgiler. Tek cümlelik, 200 karakteri aşmayan metinler en iyi okunur."
      permission="ticker.manage"
      icon={<TextCursorInput className="size-6" />}
      emptyTitle="Kayan yazı eklenmemiş"
      emptyText="Bant boşken panoda okul adı ve iyi dilek mesajı akar."
      addLabel="Yeni kayan yazı"
      activeToggle
      reorderable
      tabs={<TickerSources />}
      select={(rows) => sortByPublish(rows)}
      rowState={expiredRowState}
      schema={tickerSchema}
      columns={[
        { header: 'Metin', cell: (r) => <span className="font-medium text-ink">{r.text}</span> },
        { header: 'Durum', cell: (r) => <PublishCell row={r} /> },
      ]}
      emptyForm={() => ({ text: '', startsAt: '', endsAt: '', isActive: true })}
      toForm={(r) => ({ text: r.text, startsAt: isoToLocalInput(r.startsAt), endsAt: isoToLocalInput(r.endsAt), isActive: r.isActive })}
      toPayload={(f) => ({ text: f.text, startsAt: localInputToIso(f.startsAt), endsAt: localInputToIso(f.endsAt), isActive: f.isActive })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Field label="Metin" error={errors.text} help={`${v.text.length}/200`}>
            {(id) => (
              <Input id={id} value={v.text} maxLength={200} onChange={(e) => set('text', e.target.value)} placeholder="ör. Okul servisleri 15:40'ta hareket eder." invalid={Boolean(errors.text)} />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yayın başlangıcı" error={errors.startsAt}>
              {(id) => <Input id={id} type="datetime-local" value={v.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}
            </Field>
            <Field label="Yayın bitişi" error={errors.endsAt}>
              {(id) => <Input id={id} type="datetime-local" value={v.endsAt} onChange={(e) => set('endsAt', e.target.value)} />}
            </Field>
          </div>
          <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Yayında" />
        </>
      )}
    />
  );
}
