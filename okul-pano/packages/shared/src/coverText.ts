/*
 * İzinli öğretmen bandının cümlesi (web Genel Bakış ve mobil ana sayfa aynı metni kullanır). Devrik cümle yok:
 * "Bugün: Ayşe Yılmaz izinli." + "2 dersi ve 1 nöbet yeri boş."
 */

/** "A", "A ve B", "A, B ve C"; üçten fazlası "A, B ve 3 kişi daha" */
export function trNameList(names: readonly string[]): string {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length <= 3) return `${list.slice(0, -1).join(', ')} ve ${list[list.length - 1]}`;
  return `${list.slice(0, 2).join(', ')} ve ${list.length - 2} kişi daha`;
}

/** Bant: başlık "Bugün: X izinli." ve ayrıntı "2 dersi ve 1 nöbet yeri boş." (yalnız biri varsa yalnız o) */
export function coverBandText(absentNames: readonly string[], openLessons: number, openDuties: number, dayWord = 'Bugün'): { title: string; detail: string } {
  const names = trNameList(absentNames);
  const parts = [openLessons ? `${openLessons} dersi` : '', openDuties ? `${openDuties} nöbet yeri` : ''].filter(Boolean);
  return {
    title: names ? `${dayWord}: ${names} izinli.` : `${dayWord}:`,
    detail: parts.length ? `${parts.join(' ve ')} boş.` : 'Boş ders ve nöbet yeri yok.',
  };
}

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;

/** Gösterilen günün adı: "Bugün", "Yarın" ya da (hafta sonu, tatil sonrası) gün adı, ör. "Pazartesi" */
export function relativeDayWord(date: string, today: string): string {
  if (date === today) return 'Bugün';
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000);
  if (diff === 1) return 'Yarın';
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
}
