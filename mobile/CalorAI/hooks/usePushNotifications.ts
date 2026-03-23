import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerExpoToken } from '../lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(telegramId: number | null) {
  useEffect(() => {
    if (!telegramId) return;
    registerForPushNotificationsAsync(telegramId);
  }, [telegramId]);
}

async function registerForPushNotificationsAsync(telegramId: number) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const expoToken = tokenData.data;

  console.log('[Push] Expo token:', expoToken);
  await registerExpoToken(telegramId, expoToken);
}
