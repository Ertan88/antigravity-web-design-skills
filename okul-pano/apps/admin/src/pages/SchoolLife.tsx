import { achievementSchema, bookSchema, schoolEventSchema } from '@okulpano/shared';
import { CalendarDays, Library, Trophy } from 'lucide-react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ImageUpload } from '../components/ImageUpload.tsx';
import { Badge, Field, Input, Segmented, Textarea, Toggle } from '../components/ui.tsx';
import type { Achievement, Book, SchoolEvent } from '../lib/data.ts';
import { isoToLocalInput, localInputToIso } from '../lib/format.ts';
import { PublishCell } from './Announcements.tsx';

/* ---------- Başarılar ve ayın öğrencisi ---------- */

type AchievementForm = {
  kind: 'month' | 'achievement';
  name: string;
  className: string;
  title: string;
  description: string;
  photoUrl: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export function Achievements() {
  return (
    <CrudPage<Achievement, AchievementForm>
      resource="achievements"
      label="Başarı"
      title="Başarılar ve Ayın Öğrencisi"
      description="Panodaki “Başarılarımız” kartında sırayla dönen dereceler ve ayın öğrencisi. Kartı panoya Panolar › Pano düzeni'nden ekleyin."
      permission="highlights.manage"
      icon={<Trophy className="size-6" />}
      emptyTitle="Henüz başarı eklenmemiş"
      emptyText="İl birinciliği, turnuva derecesi ya da ayın öğrencisi: fotoğrafla birlikte ekleyin."
      addLabel="Yeni başarı"
      activeToggle
      reorderable
      modalSize="lg"
      schema={achievementSchema}
      columns={[
        {
          header: 'Öğrenci / takım',
          cell: (r) => (
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                {r.photoUrl ? <img src={r.photoUrl} alt="" className="size-full object-cover" /> : <Trophy className="size-4" />}
              </div>
              <div>
                <div className="font-semibold text-ink">
                  {r.name} {r.className && <span className="text-slate-500">· {r.className}</span>}
                </div>
                <div className="text-slate-500">{r.title}</div>
              </div>
            </div>
          ),
        },
        { header: 'Tür', cell: (r) => <Badge tone={r.kind === 'month' ? 'amber' : 'blue'}>{r.kind === 'month' ? 'Ayın öğrencisi' : 'Başarı'}</Badge> },
        { header: 'Durum', cell: (r) => <PublishCell row={r} /> },
      ]}
      emptyForm={() => ({ kind: 'achievement', name: '', className: '', title: '', description: '', photoUrl: null, startsAt: '', endsAt: '', isActive: true })}
      toForm={(r) => ({
        kind: r.kind,
        name: r.name,
        className: r.className ?? '',
        title: r.title,
        description: r.description ?? '',
        photoUrl: r.photoUrl,
        startsAt: isoToLocalInput(r.startsAt),
        endsAt: isoToLocalInput(r.endsAt),
        isActive: r.isActive,
      })}
      toPayload={(f) => ({
        kind: f.kind,
        name: f.name,
        className: f.className || null,
        title: f.title,
        description: f.description || null,
        photoUrl: f.photoUrl,
        startsAt: localInputToIso(f.startsAt),
        endsAt: localInputToIso(f.endsAt),
        isActive: f.isActive,
      })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Segmented
            value={v.kind}
            onChange={(k) => set('kind', k)}
            options={[
              { value: 'achievement', label: 'Başarı / derece' },
              { value: 'month', label: 'Ayın öğrencisi' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Öğrenci ya da takım" error={errors.name}>
              {(id) => <Input id={id} value={v.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="ör. Elif Yılmaz" invalid={Boolean(errors.name)} />}
            </Field>
            <Field label="Sınıf">
              {(id) => <Input id={id} value={v.className} maxLength={30} onChange={(e) => set('className', e.target.value)} placeholder="11-B" />}
            </Field>
          </div>
          <Field label={v.kind === 'month' ? 'Başlık' : 'Derece'} error={errors.title}>
            {(id) => (
              <Input
                id={id}
                value={v.title}
                maxLength={100}
                onChange={(e) => set('title', e.target.value)}
                placeholder={v.kind === 'month' ? 'Ekim ayının öğrencisi' : 'TÜBİTAK 4006 · İl birincisi'}
                invalid={Boolean(errors.title)}
              />
            )}
          </Field>
          <Field label="Açıklama (isteğe bağlı)">
            {(id) => <Textarea id={id} rows={2} maxLength={200} value={v.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <Field label="Fotoğraf (isteğe bağlı)" help="Velinin izni alınmış fotoğraf kullanın (KVKK).">
            {() => <ImageUpload value={v.photoUrl} onChange={(url) => set('photoUrl', url)} aspect="aspect-square max-w-40" hint="Kare fotoğraf · en fazla 10 MB" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yayın başlangıcı">{(id) => <Input id={id} type="datetime-local" value={v.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}</Field>
            <Field label="Yayın bitişi" error={errors.endsAt}>
              {(id) => <Input id={id} type="datetime-local" value={v.endsAt} onChange={(e) => set('endsAt', e.target.value)} invalid={Boolean(errors.endsAt)} />}
            </Field>
          </div>
          <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Panoda göster" />
        </>
      )}
    />
  );
}

/* ---------- Kulüp ve etkinlik takvimi ---------- */

type EventForm = { title: string; organizer: string; date: string; time: string; place: string; isActive: boolean };
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });

export function Events() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <CrudPage<SchoolEvent, EventForm>
      resource="events"
      label="Etkinlik"
      title="Etkinlik Takvimi"
      description="Kulüp toplantıları, turnuvalar, geziler ve törenler. Panodaki “Etkinlik Takvimi” kartı önümüzdeki 30 günü gösterir."
      permission="highlights.manage"
      icon={<CalendarDays className="size-6" />}
      emptyTitle="Etkinlik eklenmemiş"
      emptyText="Satranç turnuvası, kulüp toplantısı, veli semineri…"
      addLabel="Yeni etkinlik"
      activeToggle
      schema={schoolEventSchema}
      columns={[
        {
          header: 'Tarih',
          cell: (r) => (
            <span className={r.date < today ? 'text-slate-400' : 'whitespace-nowrap font-medium text-ink'}>
              {dateFmt.format(new Date(`${r.date}T00:00:00Z`))}
              {r.time && <span className="text-slate-500"> · {r.time}</span>}
            </span>
          ),
        },
        {
          header: 'Etkinlik',
          cell: (r) => (
            <div>
              <div className="font-semibold text-ink">{r.title}</div>
              <div className="text-slate-500">{[r.organizer, r.place].filter(Boolean).join(' · ')}</div>
            </div>
          ),
        },
      ]}
      emptyForm={() => ({ title: '', organizer: '', date: '', time: '', place: '', isActive: true })}
      toForm={(r) => ({ title: r.title, organizer: r.organizer ?? '', date: r.date, time: r.time ?? '', place: r.place ?? '', isActive: r.isActive })}
      toPayload={(f) => ({ title: f.title, organizer: f.organizer || null, date: f.date, time: f.time || null, place: f.place || null, isActive: f.isActive })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <Field label="Etkinlik" error={errors.title}>
            {(id) => <Input id={id} value={v.title} maxLength={100} onChange={(e) => set('title', e.target.value)} placeholder="ör. Okullar arası satranç turnuvası" invalid={Boolean(errors.title)} />}
          </Field>
          <Field label="Düzenleyen kulüp / birim (isteğe bağlı)">
            {(id) => <Input id={id} value={v.organizer} maxLength={60} onChange={(e) => set('organizer', e.target.value)} placeholder="Satranç Kulübü" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tarih" error={errors.date}>
              {(id) => <Input id={id} type="date" value={v.date} onChange={(e) => set('date', e.target.value)} invalid={Boolean(errors.date)} />}
            </Field>
            <Field label="Saat">{(id) => <Input id={id} value={v.time} maxLength={20} onChange={(e) => set('time', e.target.value)} placeholder="14:00" />}</Field>
            <Field label="Yer">{(id) => <Input id={id} value={v.place} maxLength={60} onChange={(e) => set('place', e.target.value)} placeholder="Kütüphane" />}</Field>
          </div>
          <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Panoda göster" />
        </>
      )}
    />
  );
}

/* ---------- Kütüphane: haftanın kitabı ---------- */

type BookForm = { title: string; author: string; coverUrl: string | null; note: string; startsAt: string; endsAt: string; isActive: boolean };

export function Books() {
  return (
    <CrudPage<Book, BookForm>
      resource="books"
      label="Kitap"
      title="Haftanın Kitabı"
      description="Kütüphanenin önerisi: panodaki “Haftanın Kitabı” kartında kapağıyla gösterilir. Yayın tarihi verirseniz her hafta kendiliğinden değişir."
      permission="highlights.manage"
      icon={<Library className="size-6" />}
      emptyTitle="Kitap eklenmemiş"
      emptyText="Bu haftanın kitabını kapak görseliyle ekleyin."
      addLabel="Yeni kitap"
      activeToggle
      reorderable
      modalSize="lg"
      schema={bookSchema}
      columns={[
        {
          header: 'Kitap',
          cell: (r) => (
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                {r.coverUrl ? <img src={r.coverUrl} alt="" className="size-full object-cover" /> : <Library className="size-4" />}
              </div>
              <div>
                <div className="font-semibold text-ink">{r.title}</div>
                <div className="text-slate-500">{r.author}</div>
              </div>
            </div>
          ),
        },
        { header: 'Durum', cell: (r) => <PublishCell row={r} /> },
      ]}
      emptyForm={() => ({ title: '', author: '', coverUrl: null, note: '', startsAt: '', endsAt: '', isActive: true })}
      toForm={(r) => ({
        title: r.title,
        author: r.author,
        coverUrl: r.coverUrl,
        note: r.note ?? '',
        startsAt: isoToLocalInput(r.startsAt),
        endsAt: isoToLocalInput(r.endsAt),
        isActive: r.isActive,
      })}
      toPayload={(f) => ({
        title: f.title,
        author: f.author,
        coverUrl: f.coverUrl,
        note: f.note || null,
        startsAt: localInputToIso(f.startsAt),
        endsAt: localInputToIso(f.endsAt),
        isActive: f.isActive,
      })}
      renderForm={({ values: v, set, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kitap adı" error={errors.title}>
              {(id) => <Input id={id} value={v.title} maxLength={100} onChange={(e) => set('title', e.target.value)} placeholder="Çalıkuşu" invalid={Boolean(errors.title)} />}
            </Field>
            <Field label="Yazar" error={errors.author}>
              {(id) => <Input id={id} value={v.author} maxLength={80} onChange={(e) => set('author', e.target.value)} placeholder="Reşat Nuri Güntekin" invalid={Boolean(errors.author)} />}
            </Field>
          </div>
          <Field label="Kısa not (isteğe bağlı)">
            {(id) => <Textarea id={id} rows={2} maxLength={200} value={v.note} onChange={(e) => set('note', e.target.value)} placeholder="Kütüphanemizde 3 adet var." />}
          </Field>
          <Field label="Kapak görseli (isteğe bağlı)">
            {() => <ImageUpload value={v.coverUrl} onChange={(url) => set('coverUrl', url)} aspect="aspect-[2/3] max-w-36" hint="Dikey kapak · en fazla 10 MB" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yayın başlangıcı">{(id) => <Input id={id} type="datetime-local" value={v.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}</Field>
            <Field label="Yayın bitişi" error={errors.endsAt}>
              {(id) => <Input id={id} type="datetime-local" value={v.endsAt} onChange={(e) => set('endsAt', e.target.value)} invalid={Boolean(errors.endsAt)} />}
            </Field>
          </div>
          <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Panoda göster" />
        </>
      )}
    />
  );
}
