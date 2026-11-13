import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushPlatform } from '@/lib/api/client';

export async function requestExpoPushToken(): Promise<{ token: string; platform: PushPlatform }> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Las notificaciones push requieren un dispositivo Android o iOS.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('flight-updates', {
      name: 'Novedades de vuelos',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#BA0035',
    });
  }

  let permissions = await Notifications.getPermissionsAsync();
  const alreadyAuthorized = permissions.granted || permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (!alreadyAuthorized) permissions = await Notifications.requestPermissionsAsync();

  const authorized = permissions.granted || permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (!authorized) {
    throw new Error('No habilitaste las notificaciones. Podés activarlas en los ajustes del teléfono.');
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error('Falta vincular la app a un proyecto Expo/EAS para obtener el token push.');
  }

  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  return { token: result.data, platform: Platform.OS };
}
