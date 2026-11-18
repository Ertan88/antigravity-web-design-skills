import { monthName } from '../core/dates';
import { clampedDate } from '../core/finance/billingCycle';
import { cardLedger } from '../core/ledger';
import { AppState } from '../core/model';
import { formatTL } from '../core/money';
import { planReminders, ReminderOffset, ReminderSettings } from '../core/reminders';
import { flowEvents } from '../store/timeline';

/**
 * Bildirim planı: hangi bildirim, ne zaman, hangi metinle. Saf fonksiyon —
 * işletim sistemine kurma işi NotificationsProvider'da. iOS en fazla 64 bekleyen
 * bildirime izin verir; en yakın `max` tanesini kurarız, uygulama her açıldığında plan yenilenir.
 */
export type ReminderKind = 'bill' | 'card' | 'statement';

export interface PlannedNotification {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
  category: 'bill-reminder' | 'card-reminder' | 'info';
  data: { kind: ReminderKind; refId: string; period?: string };
}

const dayLabel = (d: Date) => `${d.getDate()} ${monthName(d)}`;

function titleFor(name: string, offset: ReminderOffset) {
  if (offset === 'D0') return `${name}: bugün son gün`;
  if (offset === 'D-1') return `${name}: yarın son gün`;
  return `${name}: 3 gün kaldı`;
}

export function buildNotificationPlan(s: AppState, now: Date, opts: { horizonDays?: number; max?: number } = {}): PlannedNotification[] {
  const horizonDays = opts.horizonDays ?? 45;
  const max = opts.max ?? 60;
  const out: PlannedNotification[] = [];

  for (const e of flowEvents(s, now, horizonDays)) {
    if (e.kind === 'salary' || !e.refId) continue;
    const isCard = e.kind === 'card';
    const owner = isCard ? s.cards.find((c) => c.id === e.refId) : s.bills.find((b) => b.id === e.refId);
    if (!owner) continue;
    const settings: ReminderSettings = owner.reminders;
    const amount = formatTL(-e.amount);

    for (const r of planReminders(e.date, settings, now)) {
      const name = isCard ? `${(owner as { name: string }).name} ekstresi` : e.title;
      let body: string;
      if (isCard) {
        const min = e.minimum ? ` · asgari ${formatTL(e.minimum)}` : '';
        body = `${e.projected ? '≈ ' : 'Kalan '}${amount}${min} · son ödeme ${dayLabel(e.date)}`;
      } else {
        body = `${e.projected ? '≈ ' : ''}${amount} · son ödeme ${dayLabel(e.date)}${r.offset === 'D0' ? '. Gecikme faizi işlemeden öde.' : ''}`;
      }
      out.push({
        id: `${e.key}:${r.offset}`,
        fireAt: r.fireAt,
        title: titleFor(name, r.offset),
        body,
        category: isCard ? 'card-reminder' : 'bill-reminder',
        data: { kind: isCard ? 'card' : 'bill', refId: e.refId, period: e.period },
      });
    }
  }

  // Ekstre kesim bildirimi: açık dönemin kesildiği gün, kartın hatırlatma saatinde.
  for (const c of s.cards) {
    if (c.reminders.offsets.length === 0) continue;
    const ledger = cardLedger(c, s.expenses, s.cardPayments, now);
    const open = ledger.find((x) => !x.closed);
    if (!open || open.result.total <= 0) continue;
    const at = clampedDate(open.cut.getFullYear(), open.cut.getMonth(), open.cut.getDate());
    at.setHours(c.reminders.hour, c.reminders.minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    out.push({
      id: `statement:${c.id}:${open.cut.getTime()}`,
      fireAt: at,
      title: `${c.name}: ${monthName(open.cut)} ekstren kesildi`,
      body: `≈ ${formatTL(open.result.total)} · son ödeme ${dayLabel(open.due)}`,
      category: 'info',
      data: { kind: 'statement', refId: c.id },
    });
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, max);
}

/** Plan değişmediyse işletim sistemindeki bildirimleri yeniden kurmamak için imza. */
export const planSignature = (plan: PlannedNotification[]) =>
  plan.map((p) => `${p.id}|${p.fireAt.getTime()}|${p.title}|${p.body}`).join('\n');
