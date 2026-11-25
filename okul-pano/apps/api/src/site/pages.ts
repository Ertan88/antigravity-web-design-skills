import type { Env } from '../env.ts';

/*
 * Tanıtım sitesi (kök adres): sunucuda düz HTML olarak üretilir; derleme adımı ve satır içi betik yoktur.
 * Satıcı ve iletişim bilgileri ortam değişkenlerinden gelir; boşsa sayfada sarı yer tutucu görünür.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Fiyatlar (KDV dahil, eğitim yılı başına). Tek yerde tutulur. */
export const PRICES = {
  board: { amount: '1.990 ₺', screens: 2 },
  school: { amount: '4.490 ₺', screens: 3, extraScreen: '490 ₺' },
  founding: { schools: 50, percent: 40 },
};

const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="15" fill="#0E5E66"/><rect x="9" y="16" width="46" height="30" rx="7" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="15" y="22" width="7" height="18" rx="2" fill="#fff"/><rect x="25" y="22" width="24" height="18" rx="2.5" fill="#fff"/><path d="M34 26.5 L41.5 31 L34 35.5 Z" fill="#0E5E66"/><circle cx="52" cy="15" r="5.5" fill="#F5B83D" stroke="#0E5E66" stroke-width="3"/><rect x="25" y="50" width="14" height="3.5" rx="1.75" fill="#fff"/></svg>`;

const brand = (href = '/') => `<a class="brand" href="${href}" aria-label="Okul Yayın ana sayfa">${MARK}<span>okul<b>yayın</b></span></a>`;

/** Ortam değişkeni ya da yer tutucu */
const val = (v: string | undefined, placeholder: string) => (v ? esc(v) : `<span class="ph">${esc(placeholder)}</span>`);

export interface SiteInfo {
  sellerName?: string;
  sellerAddress?: string;
  sellerTaxOffice?: string;
  sellerTaxNo?: string;
  email?: string;
  phone?: string;
  publicUrl: string;
  signupOpen: boolean;
  trialDays: number;
  dataRegion: string;
}

export const siteInfo = (env: Env): SiteInfo => ({
  sellerName: env.SELLER_NAME,
  sellerAddress: env.SELLER_ADDRESS,
  sellerTaxOffice: env.SELLER_TAX_OFFICE,
  sellerTaxNo: env.SELLER_TAX_NO,
  email: env.CONTACT_EMAIL,
  phone: env.CONTACT_PHONE,
  publicUrl: env.PUBLIC_URL.replace(/\/$/, ''),
  signupOpen: env.SIGNUP_MODE !== 'closed',
  trialDays: env.TRIAL_DAYS,
  dataRegion: env.DATA_REGION,
});

/** "Ücretsiz dene" düğmesi: kayıt kapalıysa tanıtım isteğine gider */
const trialHref = (i: SiteInfo) => (i.signupOpen ? '/admin/kayit' : '/iletisim?konu=demo');
const trialText = (i: SiteInfo, long = false) => (i.signupOpen ? (long ? `${i.trialDays} gün ücretsiz dene` : 'Ücretsiz dene') : 'Tanıtım iste');

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const waHref = (p: string) => {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  return `https://wa.me/${d}`;
};

interface PageOpts {
  path: string;
  title: string;
  description: string;
  body: string;
  nav?: 'home' | 'contact' | 'legal';
}

function layout(i: SiteInfo, o: PageOpts): string {
  const url = `${i.publicUrl}${o.path}`;
  const link = (href: string, text: string, current = false) => `<a href="${href}"${current ? ' aria-current="page"' : ''}>${text}</a>`;
  const home = o.nav === 'home' ? '' : '/';
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="tr_TR">
<meta property="og:site_name" content="Okul Yayın">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(i.publicUrl)}/site/img/pano-ders.webp">
<meta name="theme-color" content="#0E5E66">
<link rel="icon" href="/site/logo.svg" type="image/svg+xml">
<link rel="preload" href="/site/fonts/jakarta-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site/site.css">
<script src="/site/site.js" defer></script>
</head>
<body>
<a class="skip" href="#icerik">İçeriğe geç</a>
<header class="top">
  <div class="wrap nav">
    ${brand()}
    <div class="grow"></div>
    <nav class="nav-links" id="menu" aria-label="Ana menü">
      ${link(`${home}#ozellikler`, 'Özellikler')}
      ${link(`${home}#fiyatlar`, 'Fiyatlar')}
      ${link(`${home}#sss`, 'SSS')}
      ${link('/iletisim', 'İletişim', o.nav === 'contact')}
      <a class="only-sm" href="/admin/">Giriş yap</a>
    </nav>
    <a class="btn btn-line hide-sm" href="/admin/">Giriş yap</a>
    <a class="btn btn-brand" href="${trialHref(i)}">${trialText(i)}</a>
    <button class="menu-btn" type="button" aria-controls="menu" aria-expanded="false" aria-label="Menüyü aç">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
</header>
<main id="icerik">
${o.body}
</main>
${footer(i)}
</body>
</html>`;
}

function footer(i: SiteInfo): string {
  const tax = i.sellerTaxOffice || i.sellerTaxNo ? `${esc(i.sellerTaxOffice ?? '')} ${esc(i.sellerTaxNo ?? '')}`.trim() : '<span class="ph">Vergi dairesi / VKN</span>';
  return `<footer class="foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>${brand('/')}<p>Okullar için dijital pano ve okul yönetimi.</p></div>
      <div><h4>Ürün</h4><ul><li><a href="/#ozellikler">Özellikler</a></li><li><a href="/#fiyatlar">Fiyatlar</a></li><li><a href="/#sss">SSS</a></li><li><a href="/admin/">Giriş yap</a></li></ul></div>
      <div><h4>Yasal</h4><ul><li><a href="/kvkk">KVKK Aydınlatma Metni</a></li><li><a href="/gizlilik">Gizlilik ve Çerezler</a></li><li><a href="/kullanim-kosullari">Kullanım Koşulları</a></li><li><a href="/mesafeli-satis">Mesafeli Satış Sözleşmesi</a></li><li><a href="/on-bilgilendirme">Ön Bilgilendirme Formu</a></li></ul></div>
      <div><h4>İletişim</h4><ul><li><a href="/iletisim">İletişim formu</a></li><li>${i.email ? `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : '<span><span class="ph">E-posta</span></span>'}</li><li>${i.phone ? `<a href="${telHref(i.phone)}">${esc(i.phone)}</a>` : '<span><span class="ph">Telefon</span></span>'}</li></ul></div>
    </div>
    <div class="foot-legal"><span>© ${new Date().getFullYear()} Okul Yayın</span><span>·</span><span>Satıcı: ${val(i.sellerName, 'Ad Soyad')}</span><span>·</span><span>${val(i.sellerAddress, 'Adres')}</span><span>·</span><span>${tax}</span></div>
  </div>
</footer>`;
}

/* ---------------- Ana sayfa ---------------- */

const SLIDES: { img: string; w: number; h: number; tall?: boolean; kicker: string; title: string; alt: string }[] = [
  { img: 'pano-ders', w: 1600, h: 900, kicker: 'Koridor panosu', title: 'Zil, şu an derste, nöbetçiler ve duyurular tek ekranda', alt: 'Koridor panosu: zil sayacı, şu an derste olan sınıflar, nöbetçi öğretmenler ve duyuru' },
  { img: 'panel-gorevlendirme', w: 1440, h: 900, kicker: 'Ders görevlendirme', title: 'İzinli öğretmenin boş dersleri ve önerilen öğretmenler', alt: 'Yönetim panelinde ders görevlendirme sayfası' },
  { img: 'mobil-gorevlendirme', w: 600, h: 1222, tall: true, kicker: 'Telefondan', title: 'Görevlendirme telefondan da birkaç dokunuşla yapılır', alt: 'Mobil uygulamada ders görevlendirme ekranı' },
  { img: 'panel-zil', w: 1440, h: 900, kicker: 'Zil saatleri', title: 'Günün ders sayısına göre kendiliğinden seçilen zil', alt: 'Yönetim panelinde zil saatleri sayfası' },
  { img: 'mobil-merkez', w: 600, h: 1222, tall: true, kicker: 'Merkez', title: 'O anki ders, izinliler, nöbet ve panolar bir bakışta', alt: 'Mobil uygulamanın Merkez ekranı' },
  { img: 'panel-nobet', w: 1440, h: 900, kicker: 'Nöbet çizelgesi', title: 'Excel’den yüklenen nöbet çizelgesi, taşımalı ve öğle nöbeti', alt: 'Yönetim panelinde nöbet çizelgesi' },
];

const img = (name: string, w: number, h: number, alt: string, cls = 'shot', lazy = true) =>
  `<img class="${cls}" src="/site/img/${name}.webp" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}>`;

function homeBody(i: SiteInfo): string {
  const P = PRICES;
  const check = (items: string[]) => `<ul class="check">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const feat = (kicker: string, title: string, items: string[], media: string, rev = false) =>
    `<div class="feat${rev ? ' rev' : ''}"><div><div class="kick">${kicker}</div><h2>${title}</h2>${check(items)}</div><div>${media}</div></div>`;

  const hero = `<section class="hero"><div class="wrap">
  <div class="hero-head">
    <div><span class="pill">Okul müdürleri ve müdür yardımcıları için</span><h1>Sabah ilk iş: bugün kim izinli, hangi ders boş?</h1></div>
    <div>
      <p class="lead">Okul Yayın; nöbeti, izni, ders görevlendirmeyi ve koridordaki panoyu tek yerde toplar. Pano, yönetim paneli ve telefon uygulaması birlikte çalışır.</p>
      <div class="cta-row"><a class="btn btn-brand" href="${trialHref(i)}">${trialText(i, true)}</a><a class="btn btn-line" href="/iletisim?konu=demo">Tanıtım iste</a></div>
      <p class="small" style="margin-top:12px">Kurulum 10 dakika · Kredi kartı gerekmez</p>
    </div>
  </div>
  <div class="hero-shots">${img('pano-ders', 1600, 900, 'Koridor panosu: zil sayacı, şu an derste, nöbetçiler ve duyurular', 'shot', false)}${img('mobil-merkez', 600, 1222, 'Mobil uygulamanın Merkez ekranı', 'phone', false)}</div>
</div></section>`;

  const tour = `<section class="sec white" aria-labelledby="tur-baslik"><div class="wrap">
  <div class="center"><div class="kick">Ürün turu</div><h2 id="tur-baslik" style="margin-top:8px">Okul Yayın’a yakından bakın</h2></div>
  <div class="tour" data-tour role="region" aria-roledescription="slayt gösterisi" aria-label="Ürün turu">
    <div class="tour-stage">
      ${SLIDES.map((s, k) => `<div class="tour-slide${s.tall ? ' tall' : ''}${k === 0 ? ' on' : ''}" data-kicker="${esc(s.kicker)}" data-title="${esc(s.title)}" aria-hidden="${k === 0 ? 'false' : 'true'}">${img(s.img, s.w, s.h, s.alt, '', k !== 0)}</div>`).join('')}
      <button class="tour-arrow prev" type="button" aria-label="Önceki slayt">‹</button>
      <button class="tour-arrow next" type="button" aria-label="Sonraki slayt">›</button>
    </div>
    <div class="tour-cap" aria-live="polite"><span class="n">1 / ${SLIDES.length} · ${esc(SLIDES[0]!.kicker)}</span><span class="t">${esc(SLIDES[0]!.title)}</span></div>
    <div class="tour-bar">${SLIDES.map((s, k) => `<button class="seg${k === 0 ? ' on' : ''}" type="button" aria-label="${k + 1}. slayt: ${esc(s.kicker)}"></button>`).join('')}<button class="tour-pause" type="button">❚❚ Durdur</button></div>
  </div>
  <p class="small center tour-note">Görüntülerdeki okul, öğretmen ve öğrenci bilgileri örnektir.</p>
</div></section>`;

  const day = `<section class="sec"><div class="wrap">
  <div class="kick">Okulda bir gün</div><h2 style="margin-top:8px">Her saat başı bir iş daha az</h2>
  <div class="grid4">${[
    ['07:45', 'İzinli öğretmen', 'Boş dersler ve nöbet yeri listelenir, uygun öğretmen önerilir.'],
    ['08:30', 'Zil ve pano', 'Koridordaki ekran zili, şu anki dersi ve nöbetçiyi kendiliğinden gösterir.'],
    ['11:00', 'Duyuru', 'Telefondan hazırlanır, onaylanınca bütün panolarda yayınlanır.'],
    ['15:30', 'Rapor', 'Görevlendirme istatistiği ve işletmede devam çizelgesi PDF olarak hazır.'],
  ]
    .map(([t, h, p]) => `<div class="card day"><div class="time">${t}</div><h3>${h}</h3><p>${p}</p></div>`)
    .join('')}</div>
</div></section>`;

  const features = `<section class="sec white" id="ozellikler"><div class="wrap">
  <h2 class="center">Pano yalnızca gösterir; asıl iş arka planda</h2>
  ${feat('Koridor panosu', 'Okulun canlı yüzü', ['Zil vakti ve “Şu an derste”: hangi sınıfta hangi ders, hangi öğretmen', 'Nöbetçi öğretmenler, sınav sayacı, doğum günleri', 'Görselli ve videolu duyurular, kayan yazı', 'Acil durumda tek dokunuşla bütün panolarda uyarı ekranı'], img('pano-ders', 1600, 900, 'Koridor panosu'))}
  ${feat('Ders görevlendirme', 'İzinli öğretmenin dersi boş kalmasın', ['Boş dersler ve nöbet yeri kendiliğinden listelenir', 'Nöbetçi ve o saatte boş olan öğretmen önerilir', 'Görevlendirme istatistiği ve sınıf geçmişi'], img('panel-gorevlendirme', 1440, 900, 'Ders görevlendirme sayfası'), true)}
  ${feat('Mobil uygulama', 'Okul cebinizde', ['Merkez: o anki ders, izinliler, nöbet, panolar', 'Öğretmen için ders programı, nöbet ve hatırlatmalar', 'İzin bildirimi ve onay', 'Panolara uzaktan komut'], img('mobil-merkez', 600, 1222, 'Mobil uygulamanın Merkez ekranı', 'phone'))}
  ${feat('Zil ve ders düzeni', 'Okulunuzun gerçek işleyişine uyar', ['Günün ders sayısına göre zil', 'İkili öğretim, sınıfa özel zil, arife ve tatiller', 'e-Okul ders programını PDF’ten içe aktarma', 'MEB çalışma takvimi kendiliğinden gelir'], img('panel-zil', 1440, 900, 'Zil saatleri sayfası'), true)}
</div></section>`;

  const mods = `<section class="sec mods"><div class="wrap">
  <h2>Bütün modüller</h2><p class="lead" style="margin-top:10px">Okulunuza gerekeni açın; gerekmeyen menüde görünmez.</p>
  <div class="grid4">${[
    ['📺', 'Koridor panosu', 'Yatay ya da dikey; tam pano, yalnızca duyurular ya da tam ekran saat'],
    ['🛡️', 'Nöbet çizelgesi', 'Excel’den yükleme, taşımalı ve öğle nöbeti'],
    ['👥', 'İzin ve görevlendirme', 'Boş ders ve nöbet yeri, öneri, istatistik'],
    ['🔔', 'Zil saatleri', 'Ders sayısına göre, ikili öğretim, arife'],
    ['📣', 'Duyuru ve onay', 'Sihirbaz, onay akışı, zamanlama'],
    ['📝', 'Sınav takvimi', 'Yazılı tarihleri panoda ve telefonda'],
    ['🏭', 'Mesleki eğitim', 'İşletmede devam, rehberlik formları (PDF)'],
    ['🚨', 'Acil durum', 'Tek dokunuşla bütün panolarda uyarı'],
  ]
    .map(([e, h, p]) => `<div class="card"><div class="ico" aria-hidden="true">${e}</div><h3>${h}</h3><p>${p}</p></div>`)
    .join('')}</div>
</div></section>`;

  const steps = `<section class="sec white steps"><div class="wrap">
  <h2 class="center">Üç adımda yayında</h2>
  <div class="grid3">${[
    ['Kayıt olun', `Okul bilgileri ve e-posta yeterli; ${i.trialDays} gün ücretsiz, kredi kartı gerekmez.`],
    ['Bilgileri yükleyin', 'Öğretmen kadrosu, nöbet ve ders programı Excel’den ya da e-Okul PDF’inden yüklenir.'],
    ['TV’yi eşleştirin', 'TV’de görünen kodu panele girin ya da QR kodu telefonla okutun.'],
  ]
    .map(([h, p], k) => `<div class="card"><div class="num">${k + 1}</div><h3>${h}</h3><p>${p}</p></div>`)
    .join('')}</div>
</div></section>`;

  const kvkk = `<section class="sec"><div class="wrap">
  ${feat('Güvenlik ve KVKK', 'Okulun verisi okulda kalır', ['Panoda kişisel veri yok: devamsızlık, telefon ve not gösterilmez', 'Öğretmen yalnızca kendi işini görür; yetkiler göreve göre verilir', 'Destek ekibi okul verisini ancak müdürün verdiği süreli izinle görür', 'Saklama süreleri tanımlı; eski kayıtlar kendiliğinden silinir', 'Şifreler özetlenerek saklanır, bağlantılar yalnızca HTTPS ile kurulur'], img('panel-nobet', 1440, 900, 'Nöbet çizelgesi sayfası'))}
</div></section>`;

  const priceCard = (o: { name: string; tag?: string; amount: string; unit: string; desc: string; items: string[]; best?: boolean; href: string; cta: string }) =>
    `<div class="card price${o.best ? ' best' : ''}"><div class="head"><div class="name">${o.name}</div>${o.tag ? `<span class="tag">${o.tag}</span>` : ''}</div><div class="amount">${o.amount}</div><div class="unit">${o.unit}</div><p class="desc">${o.desc}</p>${check(o.items)}<div class="spacer"></div><a class="btn ${o.best ? 'btn-brand' : 'btn-line'} btn-block" href="${o.href}">${o.cta}</a></div>`;
  const pricing = `<section class="sec" id="fiyatlar"><div class="wrap">
  <div class="center"><div class="kick">Fiyatlar</div><h2 style="margin-top:8px">Okul başına, eğitim yılı boyunca</h2><p class="lead" style="margin-top:10px">Fiyatlara KDV dahildir. Yıl ortasında başlayan okul kalan aylar kadar öder.</p></div>
  <div class="grid3">
    ${priceCard({ name: 'Pano', amount: P.board.amount, unit: `yıllık · ${P.board.screens} pano`, desc: 'Yalnızca koridor panosu isteyen okullar için.', items: ['Zil, şu an derste, nöbetçiler', 'Duyuru ve kayan yazı', 'Sınav sayacı, özel gün temaları', 'Mobil uzaktan kumanda'], href: trialHref(i), cta: trialText(i, true) })}
    ${priceCard({ name: 'Okul', tag: 'En kapsamlı', amount: P.school.amount, unit: `yıllık · ${P.school.screens} pano dahil`, desc: 'Panonun yanında okul yönetiminin tamamı.', items: ['Pano paketindeki her şey', 'İzin ve ders görevlendirme', 'Nöbet çizelgesi, zil düzenleri', 'Mobil uygulama (bütün öğretmenler)', 'Mesleki eğitim, sınav takvimi', `Ek pano: yıllık ${P.school.extraScreen}`], best: true, href: trialHref(i), cta: trialText(i, true) })}
    ${priceCard({ name: 'Kurum', amount: 'Teklif', unit: 'birden çok okul', desc: 'Kampüs, kolej ve okul grupları için.', items: ['Okul paketindeki her şey', 'Okullar arası tek giriş', 'Toplu kurulum ve eğitim', 'Fatura tek yerden'], href: '/iletisim?konu=quote', cta: 'Teklif iste' })}
  </div>
  <div class="card note"><div class="ico" aria-hidden="true">🎓</div><div><b>Kurucu okul indirimi</b><p class="sub" style="font-size:14px;font-weight:600">İlk ${P.founding.schools} okul, ilk yıl %${P.founding.percent} indirimle başlar. Görüş ve önerileriyle ürünü birlikte geliştiririz.</p></div></div>
</div></section>`;

  const faqs: [string, string][] = [
    ['Hangi TV gerekir?', 'İnternete bağlanan her TV ya da bilgisayar yeterlidir. Android TV kutularında kendi uygulamamız açılışta kendiliğinden başlar.'],
    ['İnternet kesilirse ne olur?', 'Pano son aldığı bilgiyle çalışmaya devam eder; zil ve saat aksamaz. Bağlantı gelince kendini günceller.'],
    ['Kurulum ne kadar sürer?', 'Kayıt ve TV eşleştirme yaklaşık 10 dakika sürer. Öğretmen ve nöbet listeleri Excel ile birkaç dakikada yüklenir.'],
    ['Fatura kesiliyor mu?', 'Evet, her ödeme için fatura kesilir. Ödeme havale ya da EFT ile yapılır.'],
    ['Deneme bitince ne olur?', 'Ödeme yapmazsanız hesap askıya alınır. Verilerinizi istediğiniz zaman dışa aktarabilir ya da sildirebilirsiniz.'],
    ['Verilerimiz güvende mi?', `Okulun verisi yalnızca okulun yetkililerine görünür. Veriler ${esc(i.dataRegion)} konumundaki sunucularda saklanır. Ayrıntılar KVKK aydınlatma metnindedir.`],
  ];
  const faq = `<section class="sec white faq" id="sss"><div class="wrap">
  <h2>Sık sorulan sorular</h2>
  <div class="grid2">${faqs.map(([q, a]) => `<div class="card"><h3>${q}</h3><p>${a}</p></div>`).join('')}</div>
</div></section>`;

  const final = `<section class="sec"><div class="wrap"><div class="final">
  ${MARK}<h2>Okulunuzda ${i.trialDays} gün ücretsiz deneyin</h2><p>Kredi kartı gerekmez.</p>
  <div class="cta-row"><a class="btn btn-gold" href="${trialHref(i)}">${i.signupOpen ? 'Hemen başla →' : 'Tanıtım iste →'}</a><a class="btn btn-line" href="/iletisim">Bize yazın</a></div>
</div></div></section>`;

  return hero + tour + day + features + mods + steps + kvkk + pricing + faq + final;
}

export function homePage(i: SiteInfo): string {
  return layout(i, {
    path: '/',
    nav: 'home',
    title: 'Okul Yayın · Okullar için dijital pano ve okul yönetimi',
    description: 'Koridordaki pano, yönetim paneli ve öğretmen uygulaması bir arada: zil, şu an derste, nöbet, izin ve ders görevlendirme, duyurular. 30 gün ücretsiz deneyin.',
    body: homeBody(i),
  });
}

/* ---------------- İletişim ---------------- */

export function contactPage(i: SiteInfo): string {
  const topics: [string, string, string, string][] = [
    ['demo', '🖥️', 'Tanıtım iste', '20 dakikalık görüntülü tanıtım'],
    ['quote', '🧾', 'Fiyat teklifi', 'Birden çok okul ya da ek pano'],
    ['question', '❓', 'Soru sor', 'Satın almadan önce merak ettikleriniz'],
  ];
  const times = ['Hafta içi sabah', 'Hafta içi öğleden sonra', 'Hafta içi akşam', 'Fark etmez'];
  const roles = ['Müdür', 'Müdür yardımcısı', 'Öğretmen', 'Kurum yöneticisi', 'Diğer'];
  const alt: string[] = [];
  alt.push(i.email ? `E-posta: <a href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : 'E-posta: <span class="ph">iletişim e-postası</span>');
  alt.push(i.phone ? `Telefon ve WhatsApp: <a href="${telHref(i.phone)}">${esc(i.phone)}</a> · <a href="${waHref(i.phone)}" rel="noopener">WhatsApp’tan yaz</a>` : 'Telefon ve WhatsApp: <span class="ph">telefon</span>');
  const body = `<div class="wrap contact">
  <div class="center"><div class="kick">İletişim</div><h1 style="margin-top:10px;font-size:clamp(32px,4.4vw,46px)">Bize yazın</h1><p class="lead" style="margin-top:10px">Konuyu seçin, gerisini birlikte halledelim. Okul günlerinde en geç bir iş günü içinde dönüyoruz.</p></div>
  <form data-contact novalidate>
    <fieldset class="topics"><legend>Konu</legend>
      ${topics.map(([v, e, h, s], k) => `<label class="topic"><input type="radio" name="topic" value="${v}"${k === 0 ? ' checked' : ''}><span class="card"><span class="ico" aria-hidden="true">${e}</span><b>${h}</b><span class="s">${s}</span></span></label>`).join('')}
    </fieldset>
    <div class="card form">
      <div class="fields">
        <div class="field"><label for="f-name">Ad soyad</label><input id="f-name" name="name" required maxlength="120" autocomplete="name"></div>
        <div class="field"><label for="f-role">Göreviniz</label><select id="f-role" name="role" required><option value="">Seçin</option>${roles.map((r) => `<option>${r}</option>`).join('')}</select></div>
        <div class="field"><label for="f-school">Okul ya da kurum adı</label><input id="f-school" name="school" required maxlength="200" autocomplete="organization"></div>
        <div class="field"><label for="f-city">İl / ilçe</label><input id="f-city" name="city" required maxlength="120" placeholder="Ör. Ankara / Çankaya"></div>
        <div class="field"><label for="f-email">E-posta</label><input id="f-email" name="email" type="email" required maxlength="200" autocomplete="email" inputmode="email"></div>
        <div class="field"><label for="f-phone">Telefon <span class="opt">(isteğe bağlı)</span></label><input id="f-phone" name="phone" type="tel" maxlength="30" autocomplete="tel" inputmode="tel"></div>
        <fieldset class="times wide"><legend>Size uygun zaman <span class="opt">(isteğe bağlı)</span></legend>${times.map((t) => `<label><input type="radio" name="time" value="${t}"><span>${t}</span></label>`).join('')}</fieldset>
        <div class="field wide"><label for="f-message">Mesajınız</label><textarea id="f-message" name="message" required maxlength="3000" placeholder="Okulunuzda kaç pano olacak, neye ihtiyacınız var?"></textarea></div>
      </div>
      <label class="hp" aria-hidden="true">Web sitesi <input name="website" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input type="checkbox" name="consent" required><span><a href="/kvkk" target="_blank" rel="noopener">Aydınlatma metnini</a> okudum. Bilgilerimin yalnızca bu talebe yanıt vermek için işlenmesini kabul ediyorum.</span></label>
      <div class="form-msg" role="status" tabindex="-1" hidden></div>
      <button class="btn btn-brand" type="submit" style="margin-top:18px">Gönder</button>
    </div>
  </form>
  <p class="small contact-alt">Zaten müşteri misiniz? Destek talebinizi paneldeki “Platforma yaz” bölümünden açın; okulunuz kendiliğinden tanınır.</p>
  <p class="small contact-alt">${alt.join(' · ')}</p>
</div>`;
  return layout(i, { path: '/iletisim', nav: 'contact', title: 'İletişim · Okul Yayın', description: 'Okul Yayın için tanıtım isteyin, fiyat teklifi alın ya da sorunuzu sorun.', body });
}

/* ---------------- Yasal sayfalar ---------------- */

const DRAFT = '<div class="draft">Bu metin taslaktır. Yayına almadan önce satıcı bilgileri doldurulmalı ve bir hukukçuya kontrol ettirilmelidir.</div>';

function seller(i: SiteInfo): string {
  return `<ul>
<li>Ad soyad: ${val(i.sellerName, 'Ad Soyad')}</li>
<li>Adres: ${val(i.sellerAddress, 'Adres')}</li>
<li>Vergi dairesi ve numarası: ${val(i.sellerTaxOffice, 'Vergi dairesi')} ${val(i.sellerTaxNo, 'VKN / TCKN')}</li>
<li>E-posta: ${val(i.email, 'E-posta')}</li>
<li>Telefon: ${val(i.phone, 'Telefon')}</li>
</ul>`;
}

function legal(i: SiteInfo, path: string, title: string, description: string, content: string): string {
  return layout(i, { path, nav: 'legal', title: `${title} · Okul Yayın`, description, body: `<article class="wrap legal"><h1>${title}</h1>${DRAFT}${content}</article>` });
}

export const legalPages: Record<string, (i: SiteInfo) => string> = {
  '/kvkk': (i) =>
    legal(
      i,
      '/kvkk',
      'KVKK Aydınlatma Metni',
      'Okul Yayın tanıtım sitesi, iletişim formu, kayıt ve abonelik süreçlerinde işlenen kişisel veriler hakkında aydınlatma metni.',
      `<p>Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında Okul Yayın’ın satıcısı olarak tarafımızca işlenen kişisel veriler hakkında sizi bilgilendirmek için hazırlanmıştır.</p>
<h2>Veri sorumlusu</h2>${seller(i)}
<h2>Kapsam</h2>
<p>Bu metin; tanıtım sitesini ziyaret edenlerin, iletişim formunu dolduranların, kayıt olan okul yöneticilerinin ve abonelik süreçlerindeki kişilerin verilerini kapsar.</p>
<p>Okulların sisteme girdiği öğretmen, öğrenci ve personel verilerinde veri sorumlusu ilgili okuldur; Okul Yayın bu verileri okul adına işleyen “veri işleyen” konumundadır. Bu veriler için her okulun kendi aydınlatma metni geçerlidir (panelde Ayarlar bölümünde şablonu bulunur).</p>
<h2>İşlenen veriler</h2>
<ul>
<li>İletişim formu: ad soyad, görev, okul ya da kurum adı, il ve ilçe, e-posta, isteğe bağlı telefon, uygun zaman ve mesaj</li>
<li>Kayıt ve abonelik: okul bilgileri, yetkili kişinin adı, e-posta adresi, telefon numarası, fatura bilgileri</li>
<li>Güvenlik kayıtları: giriş denemeleri ve IP adresi (kötüye kullanımı önlemek için)</li>
<li>Deneme süresi kaydı: kurum kodu, yetkili telefon numarası ve pano TV’sinin cihaz kimliği. Bunların kendisi değil, geri çevrilemeyen özetleri saklanır; özetten numara ya da kimlik elde edilemez.</li>
</ul>
<h2>Amaçlar ve hukuki sebepler</h2>
<ul>
<li>Talebinize yanıt vermek, tanıtım ve teklif sunmak: sözleşmenin kurulmasıyla doğrudan ilgili olması (KVKK m. 5/2-c)</li>
<li>Hesabın açılması, deneme süresi ve aboneliğin yürütülmesi: sözleşmenin ifası (m. 5/2-c)</li>
<li>Fatura ve muhasebe kayıtları: hukuki yükümlülük (m. 5/2-ç)</li>
<li>Bilgi güvenliği: meşru menfaat (m. 5/2-f)</li>
<li>Ücretsiz deneme süresinin kötüye kullanımını önlemek (aynı okulun, kişinin ya da TV’nin tekrar tekrar deneme açmasının fark edilmesi): meşru menfaat (m. 5/2-f). Bu durumda kayıt engellenmez, onaya alınır.</li>
<li>Kampanya ve yenilik e-postaları: yalnızca açık rızanız varsa (m. 5/1); rızanızı her e-postadaki bağlantıyla geri alabilirsiniz</li>
</ul>
<h2>Saklama süreleri</h2>
<ul>
<li>İletişim talepleri: yanıtlananlar 1 yıl, yanıtlanmayanlar 2 yıl sonra kendiliğinden silinir</li>
<li>Doğrulanmamış kayıt başvuruları: 48 saatlik süre dolunca geçersiz olur</li>
<li>Deneme süresi kaydı (özetler): okul hesabı silinse de 2 yıl saklanır, sonra kendiliğinden silinir</li>
<li>Fatura kayıtları: vergi mevzuatının öngördüğü süre boyunca</li>
</ul>
<h2>Aktarım</h2>
<p>Veriler ${esc(i.dataRegion)} konumundaki sunucularda saklanır. E-posta gönderimi için e-posta hizmet sağlayıcısından yararlanılır. Yurt dışına aktarım söz konusuysa KVKK m. 9’daki şartlara uyulur. Veriler reklam amacıyla üçüncü kişilerle paylaşılmaz ve satılmaz.</p>
<h2>Haklarınız</h2>
<p>KVKK m. 11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini ya da silinmesini isteme, itiraz etme ve zararın giderilmesini isteme haklarına sahipsiniz. Başvurularınızı ${val(i.email, 'iletişim e-postası')} adresine iletebilirsiniz; en geç 30 gün içinde yanıtlanır.</p>`,
    ),
  '/gizlilik': (i) =>
    legal(
      i,
      '/gizlilik',
      'Gizlilik ve Çerezler',
      'Okul Yayın tanıtım sitesinde çerez ve ölçüm kullanımı.',
      `<h2>Çerezler</h2>
<p>Bu tanıtım sitesi reklam ya da ziyaretçi takibi amacıyla çerez kullanmaz ve üçüncü taraf ölçüm aracı içermez.</p>
<p>Yönetim paneli ve mobil uygulamanın web sürümü, oturumunuzu açık tutmak için tarayıcınızın yerel deposunu kullanır. Bu bilgi yalnızca giriş için gereklidir; başka amaçla kullanılmaz.</p>
<h2>Sunucu kayıtları</h2>
<p>Güvenlik ve hata ayıklama için sunucu, isteklerin zamanını ve IP adresini kısa süre tutar. Bu kayıtlar kötüye kullanımı (ör. art arda hatalı giriş) önlemek dışında kullanılmaz.</p>
<h2>İletişim</h2>
<p>Sorularınız için: ${val(i.email, 'iletişim e-postası')}. Kişisel verilerle ilgili ayrıntılar <a href="/kvkk">KVKK Aydınlatma Metni</a>’ndedir.</p>`,
    ),
  '/kullanim-kosullari': (i) =>
    legal(
      i,
      '/kullanim-kosullari',
      'Kullanım Koşulları',
      'Okul Yayın hizmetinin kullanım koşulları.',
      `<h2>Taraflar ve hizmet</h2>
<p>Okul Yayın; okullar için dijital pano, yönetim paneli ve mobil uygulamadan oluşan, internet üzerinden sunulan bir yazılım hizmetidir. Hizmet, aşağıda bilgileri yer alan satıcı tarafından sunulur:</p>${seller(i)}
<h2>Hesap ve yetkiler</h2>
<ul>
<li>Okul hesabını açan kişi, okul adına hareket etmeye yetkili olduğunu kabul eder.</li>
<li>Okul, sisteme girdiği verilerin doğruluğundan ve bu verilerin işlenmesi için gerekli hukuki dayanağın varlığından sorumludur.</li>
<li>Şifrelerin gizliliği kullanıcıların sorumluluğundadır.</li>
</ul>
<h2>Deneme ve abonelik</h2>
<p>Yeni okullar ${i.trialDays} günlük ücretsiz deneme süresiyle başlar. Deneme sonunda ödeme yapılmazsa hesap askıya alınır. Abonelik eğitim yılı esasına göredir; fiyatlar sitede yazdığı gibidir.</p>
<h2>Kabul edilemez kullanım</h2>
<p>Hizmet; hukuka aykırı içerik yayınlamak, başkalarının haklarını ihlal etmek ya da sisteme zarar vermek için kullanılamaz. Bu durumda hesap askıya alınabilir.</p>
<h2>Hizmetin sürekliliği</h2>
<p>Hizmetin kesintisiz çalışması için makul çaba gösterilir. Bakım ve beklenmeyen arızalar sırasında pano son aldığı bilgiyle çalışmaya devam eder.</p>
<h2>Sona erme ve verilerin iadesi</h2>
<p>Okul, aboneliği istediği zaman sonlandırabilir. Okul verileri panelden dışa aktarılabilir; hesabın silinmesi istendiğinde veriler kalıcı olarak silinir.</p>`,
    ),
  '/mesafeli-satis': (i) =>
    legal(
      i,
      '/mesafeli-satis',
      'Mesafeli Satış Sözleşmesi',
      'Okul Yayın aboneliği için mesafeli satış sözleşmesi taslağı.',
      `<h2>1. Taraflar</h2><p><b>Satıcı</b></p>${seller(i)}<p><b>Alıcı:</b> Sipariş sırasında bilgileri alınan okul, kurum ya da kişi.</p>
<h2>2. Konu</h2><p>Bu sözleşmenin konusu, alıcının elektronik ortamda sipariş verdiği Okul Yayın yazılım hizmeti aboneliğinin satışı ve ifasına ilişkin hak ve yükümlülüklerdir.</p>
<h2>3. Hizmet bilgileri</h2><ul><li>Hizmet: Okul Yayın aboneliği (seçilen paket: Pano, Okul ya da Kurum)</li><li>Süre: Bir eğitim yılı; yıl ortasında başlayan abonelikte kalan aylar</li><li>Fiyat: Sitede yazan, KDV dahil tutar; ödeme havale ya da EFT ile yapılır</li></ul>
<h2>4. İfa</h2><p>Hizmet, ödemenin alınmasından sonra en geç 1 iş günü içinde alıcının hesabında kullanıma açılır.</p>
<h2>5. Cayma hakkı</h2><p>Alıcı tüketiciyse, 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca 14 gün içinde cayma hakkına sahiptir. Elektronik ortamda anında ifa edilen hizmetlerde, alıcının onayıyla ifaya başlanmışsa cayma hakkı kullanılamaz (Yönetmelik m. 15). Cayma bildirimi ${val(i.email, 'iletişim e-postası')} adresine yapılır.</p>
<h2>6. Uyuşmazlık</h2><p>Uyuşmazlıklarda, tüketici işlemlerinde Ticaret Bakanlığınca ilan edilen parasal sınırlar içinde tüketici hakem heyetleri, aşan durumlarda tüketici mahkemeleri yetkilidir.</p>`,
    ),
  '/on-bilgilendirme': (i) =>
    legal(
      i,
      '/on-bilgilendirme',
      'Ön Bilgilendirme Formu',
      'Okul Yayın aboneliği için ön bilgilendirme formu taslağı.',
      `<h2>Satıcı bilgileri</h2>${seller(i)}
<h2>Hizmetin temel nitelikleri</h2><p>Okullar için dijital pano, yönetim paneli ve mobil uygulamadan oluşan, internet üzerinden sunulan yazılım hizmeti. Paketlerin içeriği <a href="/#fiyatlar">Fiyatlar</a> bölümünde yazılıdır.</p>
<h2>Fiyat ve ödeme</h2><p>Fiyatlar KDV dahildir. Ödeme havale ya da EFT ile yapılır; her ödeme için fatura kesilir.</p>
<h2>İfa</h2><p>Hizmet, ödemenin alınmasından sonra en geç 1 iş günü içinde kullanıma açılır.</p>
<h2>Cayma hakkı</h2><p>Alıcı tüketiciyse 14 gün içinde cayma hakkına sahiptir. Alıcının onayıyla ifasına başlanan elektronik hizmetlerde cayma hakkı kullanılamaz.</p>
<h2>Şikâyet ve başvuru</h2><p>Şikâyetlerinizi ${val(i.email, 'iletişim e-postası')} adresine iletebilirsiniz.</p>`,
    ),
};
