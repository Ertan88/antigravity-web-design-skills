/**
 * Telefonda kart görünümündeki tabloların (.rt-cards) hücrelerine başlık etiketini ve görevini yazar:
 * check (seçim kutusu), primary (satırın adı), actions (düğmeler). Satırlar sonradan değişebildiği için
 * sayfadaki değişiklikler izlenir. Masaüstünde bu öznitelikler hiçbir şeyi değiştirmez.
 */
function label(table: HTMLTableElement) {
  const heads = [...table.querySelectorAll(':scope > thead > tr:first-child > th')].map((th) => th.textContent?.trim() ?? '');
  for (const tr of table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr')) {
    let col = 0;
    let primary = false;
    for (const td of [...tr.children] as HTMLTableCellElement[]) {
      const head = heads[col] ?? '';
      col += td.colSpan || 1;
      const empty = !td.textContent?.trim() && !td.querySelector('input, button, a, select, img, svg');
      const checkOnly = td.querySelector('input[type=checkbox]') && !td.textContent?.trim();
      const hasButtons = td.querySelector('button, a') && !head;
      // Okul numarası gibi kısa ilk sütun satırın adı sayılmaz
      const role = empty ? 'empty' : checkOnly ? 'check' : (!primary && head !== 'No') || td.colSpan > 1 ? 'primary' : hasButtons ? 'actions' : '';
      if (role === 'primary') primary = true;
      if (td.dataset.label !== head) td.dataset.label = head;
      if ((td.dataset.cell ?? '') !== role) {
        if (role) td.dataset.cell = role;
        else delete td.dataset.cell;
      }
    }
  }
}

export function startResponsiveTables() {
  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll<HTMLTableElement>('table.rt-cards').forEach(label);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();
}
