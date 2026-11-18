import { jest } from '@jest/globals';

/** Tüm testler için yerel modül taklitleri. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-notifications', () => {
  const { jest: j } = require('@jest/globals');
  const listeners: ((r: unknown) => void)[] = [];
  return {
    __listeners: listeners,
    setNotificationHandler: j.fn(),
    setNotificationChannelAsync: j.fn(async () => null),
    setNotificationCategoryAsync: j.fn(async () => ({})),
    getPermissionsAsync: j.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
    requestPermissionsAsync: j.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
    scheduleNotificationAsync: j.fn(async () => 'scheduled-id'),
    cancelAllScheduledNotificationsAsync: j.fn(async () => undefined),
    addNotificationResponseReceivedListener: j.fn((l: (r: unknown) => void) => {
      listeners.push(l);
      return { remove: () => listeners.splice(listeners.indexOf(l), 1) };
    }),
    getLastNotificationResponseAsync: j.fn(async () => null),
    clearLastNotificationResponseAsync: j.fn(async () => undefined),
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  };
});
