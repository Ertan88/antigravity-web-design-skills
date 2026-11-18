import { fromISODate, monthName, periodKey } from '../core/dates';
import { clampedDate, startOfDay } from '../core/finance/billingCycle';
import { incomeDates, incomeSources } from '../core/income';
import { cardLedger } from '../core/ledger';
import { billDueForPeriod } from '../store/analytics';
import { AppState } from '../core/model';
import { formatTL } from '../core/money';
import { planReminders, ReminderOffset, ReminderSettings } from '../core/reminders';
import { flowEvents } from '../store/timeline';

/**
 * Bildirim planı: hangi bildirim, ne zaman, hangi metinle. Saf fonksiyon —
 * işletim sistemine kurma işi NotificationsProvider'da. iOS en fazla 64 bekleyen
 * bildirime izin verir; en yakın `max` tanesini kurarız, uygulama her açıldığında plan yenilenir.
 */
export type ReminderKind = 'bill' | 'card' | 'statement' | 'income';

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

  // Değişken gelirler: yattığı gün "yattı mı?" — tutar girilince tahminler güncellenir.
  out.push(...incomePrompts(s, now, new Date(now.getTime() + horizonDays * 86_400_000)).filter((p) => !p.logged && p.fireAt.getTime() > now.getTime()));

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, max);
}

function incomePrompts(s: AppState, from: Date, to: Date): (PlannedNotification & { logged: boolean })[] {
  const { hour, minute } = s.settings.defaultReminders;
  const out: (PlannedNotification & { logged: boolean })[] = [];
  for (const src of incomeSources(s.settings)) {
    if (!src.variable) continue;
    for (const d of incomeDates(src, from, to)) {
      const period = periodKey(d);
      const at = new Date(d);
      at.setHours(hour, minute, 0, 0);
      const logged = s.settings.incomeLog?.[src.id]?.[period] !== undefined;
      out.push({
        id: `income:${src.id}:${period}`,
        fireAt: at,
        title: `${src.name} yattı mı?`,
        body: 'Bu ay yatan net tutarı gir; akışın ve sonraki ayların tahmini güncellensin.',
        category: 'info',
        data: { kind: 'income', refId: src.id, period },
        logged,
      });
    }
  }
  return out;
}

const OFFSET_DAYS: Record<ReminderOffset, number> = { 'D-3': 3, 'D-1': 1, D0: 0 };
const fireTime = (due: Date, offset: ReminderOffset, r: ReminderSettings) => {
  const d = new Date(due.getFullYear(), due.getMonth(), due.getDate() - OFFSET_DAYS[offset]);
  d.setHours(r.hour, r.minute, 0, 0);
  return d;
};

export type InboxStatus = 'paid' | 'pending' | 'overdue' | 'logged';
export interface InboxItem extends PlannedNotification {
  status: InboxStatus;
}

/**
 * Bildirim kutusu: son `days` gün içinde ZAMANI GELMİŞ hatırlatmalar (gönderilmiş olanlar),
 * en yeni en üstte, ilgili ödemenin güncel durumuyla. Gelecekteki hatırlatmalar burada görünmez.
 */
export function buildInbox(s: AppState, now: Date, days = 30): InboxItem[] {
  const from = new Date(now.getTime() - days * 86_400_000);
  const inWindow = (d: Date) => d.getTime() >= from.getTime() && d.getTime() <= now.getTime();
  const today = startOfDay(now);
  const out: InboxItem[] = [];

  for (const b of s.bills) {
    const created = fromISODate(b.createdAt);
    const periods =
      b.recurrence.type === 'once'
        ? ['once']
        : Array.from({ length: 3 }, (_, i) => periodKey(new Date(now.getFullYear(), now.getMonth() - 1 + i, 1)));
    for (const p of periods) {
      const due = billDueForPeriod(b, p);
      if (due < startOfDay(created)) continue;
      const paid = b.paidPeriods.includes(p);
      for (const o of b.reminders.offsets) {
        const at = fireTime(due, o, b.reminders);
        if (!inWindow(at) || at < created) continue;
        out.push({
          id: `bill:${b.id}:${p}:${o}`,
          fireAt: at,
          title: titleFor(b.title, o),
          body: `${b.variableAmount ? '≈ ' : ''}${formatTL(b.amount)} · son ödeme ${dayLabel(due)}`,
          category: 'bill-reminder',
          data: { kind: 'bill', refId: b.id, period: p },
          status: paid ? 'paid' : due < today ? 'overdue' : 'pending',
        });
      }
    }
  }

  for (const c of s.cards) {
    for (const st of cardLedger(c, s.expenses, s.cardPayments, now)) {
      if (st.isOpening || st.result.total <= 0) continue;
      const status: InboxStatus = st.remaining <= 0 ? 'paid' : st.due < today ? 'overdue' : 'pending';
      for (const o of c.reminders.offsets) {
        const at = fireTime(st.due, o, c.reminders);
        if (!inWindow(at)) continue;
        out.push({
          id: `card:${c.id}:${st.cut.getTime()}:${o}`,
          fireAt: at,
          title: titleFor(`${c.name} ekstresi`, o),
          body: `Toplam ${formatTL(st.result.total)} · asgari ${formatTL(st.result.minimum)} · son ödeme ${dayLabel(st.due)}`,
          category: 'card-reminder',
          data: { kind: 'card', refId: c.id },
          status,
        });
      }
      if (c.reminders.offsets.length) {
        const cutAt = new Date(st.cut);
        cutAt.setHours(c.reminders.hour, c.reminders.minute, 0, 0);
        if (inWindow(cutAt))
          out.push({
            id: `statement:${c.id}:${st.cut.getTime()}`,
            fireAt: cutAt,
            title: `${c.name}: ${monthName(st.cut)} ekstren kesildi`,
            body: `${formatTL(st.result.total)} · son ödeme ${dayLabel(st.due)}`,
            category: 'info',
            data: { kind: 'statement', refId: c.id },
            status,
          });
      }
    }
  }

  for (const p of incomePrompts(s, from, now)) {
    if (inWindow(p.fireAt)) out.push({ ...p, status: p.logged ? 'logged' : 'pending' });
  }

  return out.sort((a, b) => b.fireAt.getTime() - a.fireAt.getTime());
}

/** Kutuda, en son açılıştan sonra gelmiş bildirim sayısı. */
export const unreadCount = (items: InboxItem[], seenAt?: string) =>
  items.filter((i) => !seenAt || i.fireAt.getTime() > new Date(seenAt).getTime()).length;

/** Plan değişmediyse işletim sistemindeki bildirimleri yeniden kurmamak için imza. */
export const planSignature = (plan: PlannedNotification[]) =>
  plan.map((p) => `${p.id}|${p.fireAt.getTime()}|${p.title}|${p.body}`).join('\n');
