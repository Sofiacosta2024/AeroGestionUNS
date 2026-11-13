import { ActionLink } from '@/components/ActionLink';
import { Screen } from '@/components/Screen';
import { useAuth, useUser } from '@clerk/expo';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { ApiClientError, registerPushToken } from '@/lib/api/client';
import { requestExpoPushToken } from '@/lib/push-notifications';
import { useState } from 'react';

export default function HomeScreen() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isPushRegistered, setIsPushRegistered] = useState(false);

  async function checkSessionToken() {
    try {
      const token = await getToken();
      setTokenStatus(token ? 'La sesión entregó un token, listo para llamadas autenticadas.' : 'No hay un token activo en esta sesión.');
    } catch {
      setTokenStatus('No se pudo obtener el token de la sesión.');
    }
  }

  async function enableFlightNotifications() {
    setIsRegisteringPush(true);
    setPushStatus(null);
    try {
      const { token, platform } = await requestExpoPushToken();
      const sessionToken = await getToken();
      if (!sessionToken) throw new ApiClientError('La sesión de Clerk no tiene un token activo. Iniciá sesión de nuevo.');
      await registerPushToken(sessionToken, token, platform);
      setIsPushRegistered(true);
      setPushStatus('Este dispositivo quedó registrado para recibir novedades de tus vuelos.');
    } catch (err) {
      setPushStatus(err instanceof Error ? err.message : 'No se pudo activar las notificaciones. Intentá de nuevo.');
    } finally {
      setIsRegisteringPush(false);
    }
  }

  if (!isLoaded) {
    return (
      <Screen eyebrow="AEROGESTIÓN UNS" title="Preparando tu sesión" description="Un momento, por favor.">
        <ActivityIndicator color={theme.colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="AEROGESTIÓN UNS"
      title={isSignedIn ? 'Sesión iniciada.' : 'Tus viajes, más cerca.'}
      description={isSignedIn
        ? user?.primaryEmailAddress?.emailAddress ?? 'Ya podés continuar con tu cuenta de pasajero.'
        : 'Consultá tus vuelos y pasajes desde un solo lugar.'}
    >
      {isSignedIn ? (
        <>
          <Pressable accessibilityRole="button" onPress={checkSessionToken} style={styles.action}>
            <Text style={styles.actionText}>Comprobar token de sesión</Text>
          </Pressable>
          {tokenStatus && <Text accessibilityLiveRegion="polite" style={styles.status}>{tokenStatus}</Text>}
          <View style={styles.pushCard}>
            <Text style={styles.pushTitle}>Avisos de tus vuelos</Text>
            <Text style={styles.pushDescription}>Activá notificaciones para recibir novedades importantes sobre demoras, cancelaciones y cambios de horario.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isRegisteringPush || isPushRegistered }}
              disabled={isRegisteringPush || isPushRegistered}
              onPress={enableFlightNotifications}
              style={({ pressed }) => [
                styles.pushButton,
                isPushRegistered && styles.pushButtonRegistered,
                pressed && !isPushRegistered && styles.pressed,
              ]}
            >
              {isRegisteringPush
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={[styles.pushButtonText, isPushRegistered && styles.pushButtonRegisteredText]}>
                    {isPushRegistered ? '✓ Notificaciones activadas' : 'Activar notificaciones'}
                  </Text>}
            </Pressable>
            {pushStatus && <Text accessibilityLiveRegion="polite" style={styles.pushStatus}>{pushStatus}</Text>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => signOut()} style={[styles.action, styles.secondaryAction]}>
            <Text style={styles.secondaryActionText}>Cerrar sesión</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActionLink
            href="/flights"
            title="Consultar vuelos"
            description="Explorá la pantalla de vuelos."
          />
          <ActionLink
            href="/tickets"
            title="Mis pasajes"
            description="Encontrá tus reservas y pasajes."
          />
          <ActionLink
            href="/login"
            title="Iniciar sesión"
            description="Accedé a las funciones para pasajeros."
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    marginBottom: 12,
    padding: 16,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  status: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  secondaryAction: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  secondaryActionText: {
    color: theme.colors.brand,
    fontSize: 14,
    fontWeight: '600',
  },
  pushCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, marginBottom: 18, padding: 16 },
  pushTitle: { color: theme.colors.brand, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  pushDescription: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  pushButton: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.radius.control, minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  pushButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pushButtonRegistered: { backgroundColor: '#DCF5EA', borderColor: '#B7E5D0', borderWidth: 1 },
  pushButtonRegisteredText: { color: theme.colors.success },
  pushStatus: { color: theme.colors.brand, fontSize: 13, lineHeight: 19, marginTop: 12 },
  pressed: { opacity: 0.78 },
});
