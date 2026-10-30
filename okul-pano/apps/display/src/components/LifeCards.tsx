import { type DisplayState } from '@okulpano/shared/client';
import { useEffect, useState } from 'react';
import { AutoPager } from './AutoPager.tsx';
import { useLabel } from './Labels.tsx';
import { CalendarIcon, LibraryIcon, TrophyIcon } from './Icons.tsx';

/** Birden fazla kayıt varsa sırayla döner (her biri büyük ve okunaklı görünsün diye tek tek) */
function useRotate(count: number, ms = 9000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setI((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return count ? i % count : 0;
}

/** Başarılar ve ayın öğrencisi: fotoğraf (varsa), ad, sınıf ve derece */
export function AchievementsCard({ items }: { items: NonNullable<DisplayState['achievements']> }) {
  const i = useRotate(items.length);
  const a = items[i]!;
  const label = a.kind === 'month' ? 'Ayın Öğrencisi' : 'Başarılarımız';
  return (
    <section className="card achievements-card">
      <div className="card-label">
        <TrophyIcon size={22} /> {label}
        {items.length > 1 && (
          <span className="card-label-aside">
            {i + 1}/{items.length}
          </span>
        )}
      </div>
      <div className="achievement" key={a.id}>
        <div className="achievement-photo">{a.photoUrl ? <img src={a.photoUrl} alt="" /> : <TrophyIcon size={40} />}</div>
        <div className="achievement-text">
          <div className="achievement-name">
            {a.name}
            {a.className && <span className="achievement-class">{a.className}</span>}
          </div>
          <div className="achievement-title">{a.title}</div>
          {a.description && <div className="achievement-desc">{a.description}</div>}
        </div>
      </div>
    </section>
  );
}

const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', timeZone: 'UTC' });
// Ay adı kısaltılmaz (KASIM, AĞUSTOS)
const monFmt = new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' });
const wdFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' });

/** Kulüp ve etkinlik takvimi: önümüzdeki günler, tarih rozetiyle */
export function EventsCard({ items, todayIso }: { items: NonNullable<DisplayState['events']>; todayIso: string }) {
  return (
    <section className="card list-card events-card">
      <div className="card-label">
        <CalendarIcon size={22} /> {useLabel('events')}
      </div>
      <AutoPager
        items={items}
        rowHeight={104}
        keyOf={(e) => e.id}
        render={(e) => {
          const d = new Date(`${e.date}T00:00:00Z`);
          const meta = [e.date === todayIso ? 'Bugün' : wdFmt.format(d), e.time, e.place, e.organizer].filter(Boolean).join(' · ');
          return (
            <div className="event-row">
              <div className={`event-date ${e.date === todayIso ? 'is-today' : ''}`}>
                <strong>{dayFmt.format(d)}</strong>
                <span>{monFmt.format(d)}</span>
              </div>
              <div className="event-text">
                {/* Uzun ad küçülür; yine de sığmazsa iki satırdan sonra "…" */}
                <div className={`event-title${e.title.length > 70 ? ' is-longer' : e.title.length > 34 ? ' is-long' : ''}`}>{e.title}</div>
                <div className="event-meta">{meta}</div>
              </div>
            </div>
          );
        }}
      />
    </section>
  );
}

/** Kütüphane: haftanın kitabı, kapak görseliyle */
export function BookCard({ book }: { book: NonNullable<DisplayState['books']>[number] }) {
  return (
    <section className="card book-card">
      <div className="card-label">
        <LibraryIcon size={22} /> {useLabel('book')}
      </div>
      <div className="book">
        <div className="book-cover">{book.coverUrl ? <img src={book.coverUrl} alt="" /> : <LibraryIcon size={44} />}</div>
        <div className="book-text">
          <div className="book-title">{book.title}</div>
          <div className="book-author">{book.author}</div>
          {book.note && <div className="book-note">{book.note}</div>}
        </div>
      </div>
    </section>
  );
}
