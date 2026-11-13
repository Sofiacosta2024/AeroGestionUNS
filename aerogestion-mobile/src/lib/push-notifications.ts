import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushPlatform } from '@/lib/api/client';

export async function requestExpoPushToken(): Promise<{ token: string; platform: PushPlatform }> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Las notificaciones push requieren un dispositivo Android o iOS.');
  }

  await configureAndroidChannel();

  let permissions = await Notifications.getPermissionsAsync();
  const alreadyAuthorized = permissions.granted || permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (!alreadyAuthorized) permissions = await Notifications.requestPermissionsAsync();

  const authorized = permissions.granted || permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (!authorized) {
    throw new Error('No habilitaste las notificaciones. Podés activarlas en los ajustes del teléfono.');
  }

  return getExpoPushToken();
}

/** Recupera el token solo si el usuario ya autorizó avisos; nunca abre el prompt. */
export async function getAuthorizedExpoPushToken(): Promise<{ token: string; platform: PushPlatform } | null> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;

  const permissions = await Notifications.getPermissionsAsync();
  const authorized = permissions.granted || permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (!authorized) return null;

  await configureAndroidChannel();
  return getExpoPushToken();
}

async function configureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('flight-updates', {
    name: 'Novedades de vuelos',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#BA0035',
  });
}

async function getExpoPushToken(): Promise<{ token: string; platform: PushPlatform }> {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error('Falta vincular la app a un proyecto Expo/EAS para obtener el token push.');
  }

  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  return { token: result.data, platform: Platform.OS as PushPlatform };
}
