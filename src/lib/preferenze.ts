import Storage from 'expo-sqlite/kv-store';

export type ShiftReminder = 'sera' | 'mattina';

export type NotificationPreferences = {
  shifts: boolean;
  shiftWhen: ShiftReminder;
  calendarSync: boolean;
  monthlyShare: boolean;
  rentals: boolean;
  balances: boolean;
  lowStock: boolean;
  listChanges: boolean;
  refunds: boolean;
};

export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  shifts: true,
  shiftWhen: 'sera',
  calendarSync: false,
  monthlyShare: false,
  rentals: true,
  balances: true,
  lowStock: true,
  listChanges: false,
  refunds: true,
};

const NOTIFICATIONS_KEY = 'preferenze.notifiche';

export function readNotificationPreferences(): NotificationPreferences {
  try {
    const raw = Storage.getItemSync(NOTIFICATIONS_KEY);
    return raw ? { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(raw) } : DEFAULT_NOTIFICATIONS;
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

export function saveNotificationPreferences(value: NotificationPreferences) {
  Storage.setItemSync(NOTIFICATIONS_KEY, JSON.stringify(value));
}
