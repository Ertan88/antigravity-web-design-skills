import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import NotificationsScreen from '../app/notifications';
import { AppState } from '../core/model';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { buildNotificationPlan } from '../notifications/plan';
import { demoState } from '../store/demoSeed';
import { initialState } from '../store/reducer';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));

const N = Notifications as unknown as {
  __listeners: ((r: unknown) => void)[];
  getPermissionsAsync: jest.Mock<() => Promise<unknown>>;
  scheduleNotificationAsync: jest.Mock<(req: unknown) => Promise<string>>;
  cancelAllScheduledNotificationsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
};

let latest: AppState = initialState;
function Probe() {
  latest = useStore().state;
  return null;
}
const renderApp = (state: AppState) =>
  render(
    <ThemeProvider>
      <StoreProvider initial={state}>
        <NotificationsProvider>
          <NotificationsScreen />
          <Probe />
        </NotificationsProvider>
      </StoreProvider>
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  N.getPermissionsAsync.mockImplementation(async () => ({ granted: false, status: 'undetermined', canAskAgain: true }));
});

describe('bildirim katmanı', () => {
  it('izin yokken kurmaz; izin verilince planın tamamını tarihli tetikleyiciyle kurar', async () => {
    const s = demoState(new Date());
    await renderApp(s);
    expect(screen.getByText('Bildirimlere izin ver')).toBeTruthy();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Bildirimlere izin ver'));
    const plan = buildNotificationPlan(s, new Date());
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(plan.length));
    expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    const first = N.scheduleNotificationAsync.mock.calls[0][0] as { identifier: string; content: { title: string; categoryIdentifier?: string }; trigger: { type: string; date: Date } };
    expect(first.identifier).toBe(plan[0].id);
    expect(first.trigger).toMatchObject({ type: 'date', date: plan[0].fireAt });
    expect(screen.getByText('Hatırlatmalar açık')).toBeTruthy();
  });

  it('"Ödedim" butonu faturayı işaretler; "Ertele" 2 saat sonraya yeniden kurar', async () => {
    N.getPermissionsAsync.mockImplementation(async () => ({ granted: true, status: 'granted' }));
    await renderApp(demoState(new Date()));
    await waitFor(() => expect(N.__listeners.length).toBeGreaterThan(0));
    const response = (actionIdentifier: string, id = 'n1') => ({
      actionIdentifier,
      notification: { request: { identifier: id, content: { title: 'Elektrik: yarın son gün', body: 'x', categoryIdentifier: 'bill-reminder', data: { kind: 'bill', refId: 'demo-ele', period: '2026-11' } } } },
    });

    N.scheduleNotificationAsync.mockClear();
    await act(async () => N.__listeners.forEach((l) => l(response('snooze'))));
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ trigger: expect.objectContaining({ type: 'timeInterval', seconds: 7200 }) }));

    await act(async () => N.__listeners.forEach((l) => l(response('paid'))));
    expect(latest.bills.find((b) => b.id === 'demo-ele')!.paidPeriods).toEqual(['2026-11']);
  });

  it('yaklaşan hatırlatmaları listeler', async () => {
    await renderApp(demoState(new Date()));
    expect(screen.getByText('Yaklaşan hatırlatmalar')).toBeTruthy();
    expect(screen.getAllByText(/Elektrik: (yarın|bugün) son gün|Elektrik: 3 gün kaldı/).length).toBeGreaterThan(0);
  });
});
