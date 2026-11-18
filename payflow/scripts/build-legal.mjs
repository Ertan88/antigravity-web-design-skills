// Yasal metinlerin web sürümlerini üretir: payflow/legal/*.json → docs/payflow/*.html (GitHub Pages).
// Kullanım: npm run legal
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '..', 'docs', 'payflow');
const controller = JSON.parse(readFileSync(join(root, 'legal', 'controller.json'), 'utf8'));
const docs = JSON.parse(readFileSync(join(root, 'legal', 'documents.json'), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => controller[k] ?? `{{${k}}}`);
const t = (s) => esc(fill(s));
const draft = Object.values(controller).some((v) => typeof v === 'string' && /^\[.*\]$/.test(v));

const nav = Object.values(docs).map((d) => `<a href="${d.slug}.html">${esc(d.title)}</a>`).join(' · ');

const page = (title, body) => `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(controller.appName)}</title>
<style>
:root{--bg:#F3F5FA;--surface:#FFFFFF;--text:#0B1220;--muted:#55617A;--accent:#0A7A59;--line:#D8DFEA;--warn:#995300;--warnbg:#FFF1D6}
@media (prefers-color-scheme: dark){:root{--bg:#0B1220;--surface:#131C2E;--text:#EAF0FA;--muted:#9AA6BF;--accent:#3EE6B0;--line:#283652;--warn:#FFB547;--warnbg:#2A2414}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.logo{width:40px;height:40px;border-radius:12px;background:#3EE6B0;display:grid;place-items:center}
h1{font-size:28px;line-height:1.2;margin:16px 0 8px}
h2{font-size:19px;margin:28px 0 8px;scroll-margin-top:16px}
p,li{color:var(--muted)} a{color:var(--accent)}
nav{font-size:14px;color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:18px 0}
.draft{background:var(--warnbg);color:var(--warn);border-radius:12px;padding:10px 14px;font-size:14px}
:target{outline:2px solid var(--accent);outline-offset:6px;border-radius:6px}
footer{margin-top:40px;font-size:13px;color:var(--muted)}
</style>
</head>
<body><main>
<header><span class="logo" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B1220" stroke-width="2.4" stroke-linecap="round"><path d="M3 9c3-5 6-5 9 0s6 5 9 0M3 16c3-5 6-5 9 0s6 5 9 0"/></svg></span><strong>${esc(controller.appName)}</strong></header>
<nav>${nav}</nav>
${draft ? '<p class="draft">Taslak: geliştirici bilgileri henüz doldurulmadı.</p>' : ''}
${body}
<footer>${esc(controller.appName)} · ${t('{{developerName}}')} · <a href="mailto:${t('{{contactEmail}}')}">${t('{{contactEmail}}')}</a></footer>
</main></body></html>
`;

mkdirSync(out, { recursive: true });
for (const d of Object.values(docs)) {
  const body =
    `<h1>${t(d.title)}</h1><p>${t(d.intro)}</p>` +
    d.sections
      .map(
        (s) =>
          `<section id="${s.id}"${s.id === 'ozet' ? ' class="card"' : ''}><h2>${t(s.heading)}</h2>` +
          s.blocks.map((b) => ('p' in b ? `<p>${t(b.p)}</p>` : `<ul>${b.ul.map((li) => `<li>${t(li)}</li>`).join('')}</ul>`)).join('') +
          `</section>`,
      )
      .join('\n');
  writeFileSync(join(out, `${d.slug}.html`), page(fill(d.title), body));
  console.log(`docs/payflow/${d.slug}.html`);
}

writeFileSync(join(out, 'index.html'), page('Yasal metinler', `<h1>${esc(controller.appName)} — yasal metinler</h1><ul>${Object.values(docs).map((d) => `<li><a href="${d.slug}.html">${esc(d.title)}</a></li>`).join('')}</ul>`));
console.log('docs/payflow/index.html');
