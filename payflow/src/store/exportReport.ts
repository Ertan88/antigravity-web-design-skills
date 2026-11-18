import { monthName } from '../core/dates';
import { formatTL, Kurus } from '../core/money';
import { HealthReport, MonthReport } from './analytics';

/** Excel (Türkçe bölge ayarı) için CSV: ';' ayraç, virgüllü ondalık, UTF-8 BOM. */
export function monthCsv(r: MonthReport): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const num = (k: Kurus) => (k / 100).toFixed(2).replace('.', ',');
  const date = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = [
    ['Tarih', 'Açıklama', 'Kategori', 'Kaynak', 'Tutar (TL)'],
    ...r.transactions.map((t) => [date(t.date), t.title, t.category, t.source, num(t.amount)]),
    [],
    ['', 'Toplam', '', '', num(r.total)],
  ];
  return '﻿' + rows.map((row) => row.map((c) => esc(String(c))).join(';')).join('\r\n') + '\r\n';
}

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** PDF'e basılacak aylık rapor (expo-print HTML → PDF). */
export function monthHtml(r: MonthReport, h: HealthReport): string {
  const title = `${monthName(r.month)} ${r.month.getFullYear()}`;
  const change =
    r.change === null ? '' : `<span class="${r.change > 0 ? 'up' : 'down'}">${r.change > 0 ? '▲' : '▼'} %${Math.abs(Math.round(r.change * 100))} geçen aya göre</span>`;
  const max = r.byCategory[0]?.amount || 1;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>PayFlow ${html(title)}</title>
<style>
body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0B1220;margin:32px}
h1{font-size:22px;margin:0 0 4px} .muted{color:#55617A;font-size:12px}
.total{font-size:30px;font-weight:700;margin:16px 0 4px} .up{color:#C03434} .down{color:#0A7A59}
.grid{display:flex;gap:12px;margin:16px 0} .box{flex:1;border:1px solid #D8DFEA;border-radius:12px;padding:12px}
.box b{display:block;font-size:18px;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px} th,td{padding:6px 4px;border-bottom:1px solid #E9EEF5;text-align:left}
td.r,th.r{text-align:right} .bar{height:6px;background:#0A7A59;border-radius:3px}
h2{font-size:15px;margin:24px 0 4px}
</style></head><body>
<h1>PayFlow · ${html(title)} raporu</h1>
<div class="muted">Oluşturma: ${new Date().toLocaleString('tr-TR')} · Faiz tutarları tahminidir.</div>
<div class="total">${formatTL(r.total)}</div>${change}
<div class="grid">
<div class="box">Harcamalar<b>${formatTL(r.spending)}</b></div>
<div class="box">Faturalar<b>${formatTL(r.bills)}</b></div>
<div class="box">Faiz ve vergiler<b class="${r.interest ? 'up' : ''}">${formatTL(r.interest)}</b></div>
<div class="box">Ödeme sağlığı<b>${h.score} / 100</b></div>
</div>
<h2>Kategoriler</h2>
<table><tr><th>Kategori</th><th></th><th class="r">Tutar</th></tr>
${r.byCategory.map((c) => `<tr><td>${html(c.category.name)}</td><td style="width:45%"><div class="bar" style="width:${Math.max(2, Math.round((c.amount / max) * 100))}%"></div></td><td class="r">${formatTL(c.amount)}</td></tr>`).join('')}
</table>
<h2>İşlemler</h2>
<table><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Kaynak</th><th class="r">Tutar</th></tr>
${r.transactions.map((t) => `<tr><td>${t.date.toLocaleDateString('tr-TR')}</td><td>${html(t.title)}</td><td>${html(t.category)}</td><td>${html(t.source)}</td><td class="r">${formatTL(t.amount)}</td></tr>`).join('')}
</table>
</body></html>`;
}
