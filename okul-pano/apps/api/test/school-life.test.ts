import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discoverFeedUrl, parseFeedTitles, tidyNewsTitle } from '../src/lib/rss.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let editor: ReturnType<typeof client>;
let kantin: { id: string; token: string };
let hol: { id: string; token: string };
const path = (p: string) => `/api/schools/${schoolId}/${p}`;
const state = (token: string) =>
  t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', {
    name: 'Akış Okulu',
    slug: 'akis-okulu',
    ownerEmail: 'mudur@akis.local',
    ownerName: 'Müdür',
    ownerPassword: 'MudurAK123!',
  });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@akis.local', 'MudurAK123!')).token);
  expectStatus(
    await owner.post(path('members'), { email: 'ogretmen@akis.local', fullName: 'Öğretmen', password: 'Ogretmen123!', role: 'editor', permissions: ['announcements.manage'] }),
    201,
  );
  editor = client(t.app, (await login(t.app, 'ogretmen@akis.local', 'Ogretmen123!')).token);
  for (const name of ['Kantin', 'Hol']) {
    const r = (await owner.post(path('screens'), { name })).json() as { screen: { id: string }; token: string };
    if (name === 'Kantin') kantin = { id: r.screen.id, token: r.token };
    else hol = { id: r.screen.id, token: r.token };
  }
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const titles = async (token: string) => ((await state(token)).announcements as { title: string }[]).map((a) => a.title);

describe('panoya özel yayın akışı', () => {
  it('yalnızca seçilen panoda ve zamanlamasıyla gider', async () => {
    const res = await owner.post(path('announcements'), {
      kind: 'text',
      title: 'Kantin fiyatları',
      screenIds: [kantin.id],
      schedule: { days: [1, 2, 3, 4, 5], from: null, to: null, phase: 'break' },
    });
    expectStatus(res, 201);
    expect(await titles(kantin.token)).toContain('Kantin fiyatları');
    expect(await titles(hol.token)).not.toContain('Kantin fiyatları');
    const ann = ((await state(kantin.token)).announcements as { title: string; schedule: unknown }[]).find((a) => a.title === 'Kantin fiyatları');
    expect(ann?.schedule).toEqual({ days: [1, 2, 3, 4, 5], from: null, to: null, phase: 'break' });
  });

  it('başka okulun panosu seçilemez, saat aralığı tutarlı olmalı', async () => {
    expect((await owner.post(path('announcements'), { kind: 'text', title: 'X', screenIds: ['00000000-0000-4000-8000-000000000000'] })).statusCode).toBe(400);
    expect((await owner.post(path('announcements'), { kind: 'text', title: 'X', schedule: { days: [], from: '13:00', to: '12:00', phase: 'any' } })).statusCode).toBe(400);
  });
});

describe('onay akışı', () => {
  it('kapalıyken editörün duyurusu doğrudan yayında', async () => {
    expectStatus(await editor.post(path('announcements'), { kind: 'text', title: 'Kulüp toplantısı' }), 201);
    expect(await titles(hol.token)).toContain('Kulüp toplantısı');
  });

  it('açıkken editörün duyurusu onay bekler; onaylanınca yayına çıkar, reddedilince çıkmaz', async () => {
    expectStatus(await owner.patch(`/api/schools/${schoolId}`, { settings: { requireApproval: true } }), 200);
    const a = (await editor.post(path('announcements'), { kind: 'text', title: 'Gezi duyurusu' })).json() as { id: string; approvalStatus: string };
    expect(a.approvalStatus).toBe('pending');
    expect(await titles(hol.token)).not.toContain('Gezi duyurusu');

    // Editör onaylayamaz
    expect((await editor.post(path(`announcements/${a.id}/approve`), {})).statusCode).toBe(403);
    expectStatus(await owner.post(path(`announcements/${a.id}/approve`), {}), 200);
    expect(await titles(hol.token)).toContain('Gezi duyurusu');

    // Bildirim: onay yetkilisine bekleyen duyuru, duyuruyu girene onay
    const ownerNotes = (await owner.get(path('notifications'))).json() as { kind: string; to: string }[];
    expect(ownerNotes.some((n) => n.kind === 'approval')).toBe(false);
    const editorNotes = (await editor.get(path('notifications'))).json() as { kind: string; body: string }[];
    expect(editorNotes.find((n) => n.kind === 'approved')?.body).toContain('Gezi duyurusu');

    const b = (await editor.post(path('announcements'), { kind: 'text', title: 'Yanlış duyuru' })).json() as { id: string };
    const pendingNote = ((await owner.get(path('notifications'))).json() as { kind: string; to: string }[]).find((n) => n.kind === 'approval');
    expect(pendingNote?.to).toBe(`/duyurular?incele=${b.id}`);
    // Düzeltmeye gönderirken neden zorunlu
    expect((await owner.post(path(`announcements/${b.id}/reject`), {})).statusCode).toBe(400);
    const rejected = (await owner.post(path(`announcements/${b.id}/reject`), { note: 'Tarih hatalı' })).json() as { approvalStatus: string; reviewNote: string };
    expect(rejected).toMatchObject({ approvalStatus: 'rejected', reviewNote: 'Tarih hatalı' });
    expect(await titles(hol.token)).not.toContain('Yanlış duyuru');
    const returned = ((await editor.get(path('notifications'))).json() as { kind: string; body: string; to: string }[]).find((n) => n.kind === 'returned');
    expect(returned).toMatchObject({ body: '“Yanlış duyuru”: Tarih hatalı', to: `/duyurular?duzenle=${b.id}` });
    // Öğretmen düzeltip kaydedince yeniden onaya düşer
    const fixed = (await editor.put(path(`announcements/${b.id}`), { kind: 'text', title: 'Doğru duyuru' })).json() as { approvalStatus: string };
    expect(fixed.approvalStatus).toBe('pending');

    // Yöneticinin duyurusu onaysız yayında
    expectStatus(await owner.post(path('announcements'), { kind: 'text', title: 'Müdür duyurusu' }), 201);
    expect(await titles(hol.token)).toContain('Müdür duyurusu');
  });
});

describe('okul hayatı kartları', () => {
  it('başarılar, etkinlikler ve haftanın kitabı panoya gider', async () => {
    expectStatus(await owner.post(path('achievements'), { kind: 'month', name: 'Elif Yılmaz', className: '11-B', title: 'Ekim ayının öğrencisi' }), 201);
    const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    const far = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    expectStatus(await owner.post(path('events'), { title: 'Satranç turnuvası', organizer: 'Satranç Kulübü', date: soon, time: '14:00', place: 'Kütüphane' }), 201);
    expectStatus(await owner.post(path('events'), { title: 'Uzak etkinlik', date: far }), 201);
    expectStatus(await owner.post(path('books'), { title: 'Çalıkuşu', author: 'Reşat Nuri Güntekin' }), 201);
    expect((await editor.post(path('books'), { title: 'X', author: 'Y' })).statusCode).toBe(403);

    const s = await state(hol.token);
    expect(s.achievements[0]).toMatchObject({ kind: 'month', name: 'Elif Yılmaz' });
    expect(s.events.map((e: { title: string }) => e.title)).toEqual(['Satranç turnuvası']);
    expect(s.books[0]).toMatchObject({ title: 'Çalıkuşu', author: 'Reşat Nuri Güntekin' });
  });
});

describe('RSS başlıkları', () => {
  it('RSS ve Atom başlıklarını çözer', () => {
    const rss = `<rss><channel><title>MEB</title><item><title><![CDATA[2026-2027 takvimi &amp; tatiller]]></title></item><item><title>Öğretmen atama sonuçları</title></item></channel></rss>`;
    expect(parseFeedTitles(rss)).toEqual(['2026-2027 takvimi & tatiller', 'Öğretmen atama sonuçları']);
    const atom = `<feed><entry><title type="html">Yeni &#304;l duyurusu</title></entry></feed>`;
    expect(parseFeedTitles(atom)).toEqual(['Yeni İl duyurusu']);
    // Web sayfası verilirse sayfadaki RSS bağlantısı bulunur; Google Haberler'de kaynak eki atılır
    expect(discoverFeedUrl('<head><link rel="alternate" type="application/rss+xml" href="/rss/haber.xml"></head>', 'https://il.meb.gov.tr/duyurular')).toBe('https://il.meb.gov.tr/rss/haber.xml');
    expect(tidyNewsTitle('Yeni dönem takvimi açıklandı - T.C. Millî Eğitim Bakanlığı', 'https://news.google.com/rss/search?q=x')).toBe('Yeni dönem takvimi açıklandı');
  });
});
