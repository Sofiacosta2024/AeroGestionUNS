import { Screen } from '@/components/Screen';
import { useAuth, useUser } from '@clerk/expo';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { ApiClientError, registerPushToken } from '@/lib/api/client';
import { getAuthorizedExpoPushToken, requestExpoPushToken } from '@/lib/push-notifications';
import { useEffect, useRef, useState } from 'react';
import { router, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const userId = user?.id;
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [pushRegistration, setPushRegistration] = useState<{ userId: string; registered: boolean } | null>(null);
  const isCheckingPush = Boolean(isLoaded && isSignedIn && userId && pushRegistration?.userId !== userId);
  const isPushRegistered = Boolean(isSignedIn && userId && pushRegistration?.userId === userId && pushRegistration.registered);

  useEffect(() => {
    let cancelled = false;
    if (!isLoaded || !isSignedIn || !userId) return () => { cancelled = true; };
    void (async () => {
      try {
        const push = await getAuthorizedExpoPushToken();
        if (!push) {
          if (!cancelled) {
            setPushRegistration({ userId, registered: false });
            setPushStatus(null);
          }
          return;
        }

        const sessionToken = await getTokenRef.current();
        if (!sessionToken) throw new ApiClientError('La sesión de Clerk no tiene un token activo.');
        await registerPushToken(sessionToken, push.token, push.platform);
        if (!cancelled) {
          setPushRegistration({ userId, registered: true });
          setPushStatus('Este dispositivo quedó registrado para recibir novedades de tus vuelos.');
        }
      } catch {
        if (!cancelled) {
          setPushRegistration({ userId, registered: false });
          setPushStatus('No se pudo verificar el registro de este dispositivo. Revisá tu conexión o volvé a intentar.');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId]);

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
      if (!userId) throw new ApiClientError('No se pudo identificar la cuenta activa. Iniciá sesión de nuevo.');
      setPushRegistration({ userId, registered: true });
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

  if (!isSignedIn) {
    return (
      <SafeAreaView style={styles.welcomeSafeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.welcomeContent}>
          <View style={styles.welcomeTopbar}>
            <Text style={styles.welcomeTopbarTitle}>AeroGestión <Text style={styles.welcomeTopbarAccent}>UNS</Text></Text>
          </View>
          <View style={styles.hero}>
            <View style={styles.brandOrb}>
              <Image
                accessibilityLabel="Avión de AeroGestión UNS"
                resizeMode="contain"
                source={require('../../../assets/brand-mark.png')}
                style={styles.brandOrbImage}
              />
            </View>
            <View style={styles.welcomeBadge}><View style={styles.badgeDot} /><Text style={styles.welcomeBadgeText}>AEROGESTIÓN PORTAL UNS</Text></View>
            <Text style={styles.welcomeTitle}>Bienvenido a bordo</Text>
            <Text style={styles.welcomeDescription}>Ingresá a tu cuenta para gestionar tus vuelos y tener tus viajes siempre a mano.</Text>
          </View>
          <View style={styles.welcomeCard}>
            <Text style={styles.cardTitle}>Tu próximo viaje empieza acá</Text>
            <Text style={styles.cardDescription}>Iniciá sesión para consultar tus reservas, pasajes y novedades.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
              onPress={() => router.push('/login')}
              style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.loginButtonText}>Iniciar sesión  ›</Text>
            </Pressable>
            <View style={styles.separator}><View style={styles.separatorLine} /><Text style={styles.separatorText}>O CONTINUÁ COMO INVITADO</Text><View style={styles.separatorLine} /></View>
            <Link href="/flights" asChild>
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.guestButton, pressed && styles.buttonPressed]}>
                <Text style={styles.guestButtonText}>Consultar vuelos</Text>
              </Pressable>
            </Link>
          </View>
          <Text style={styles.privacyNote}>✦ Tus viajes y datos se gestionan de forma segura.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <Screen
      eyebrow="AEROGESTIÓN UNS"
      title="Sesión iniciada."
      description={user?.primaryEmailAddress?.emailAddress ?? 'Ya podés continuar con tu cuenta de pasajero.'}
    >
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
              accessibilityState={{ disabled: isCheckingPush || isRegisteringPush || isPushRegistered }}
              disabled={isCheckingPush || isRegisteringPush || isPushRegistered}
              onPress={enableFlightNotifications}
              style={({ pressed }) => [
                styles.pushButton,
                isPushRegistered && styles.pushButtonRegistered,
                pressed && !isPushRegistered && !isCheckingPush && styles.pressed,
              ]}
            >
              {isRegisteringPush || isCheckingPush
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcomeSafeArea: { backgroundColor: '#F7F8FF', flex: 1 },
  welcomeContent: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 18 },
  welcomeTopbar: { alignItems: 'center', borderBottomColor: '#EAECF5', borderBottomWidth: 1, height: 48, justifyContent: 'center' },
  welcomeTopbarTitle: { color: theme.colors.brand, fontSize: 14, fontWeight: '700' },
  welcomeTopbarAccent: { color: theme.colors.accent },
  hero: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 20, paddingBottom: 18 },
  brandOrb: { alignItems: 'center', backgroundColor: '#E7EEFF', borderRadius: 36, height: 72, justifyContent: 'center', marginBottom: 16, width: 72 },
  brandOrbImage: { height: 37, width: 46 },
  welcomeBadge: { alignItems: 'center', backgroundColor: '#EEE9FA', borderRadius: 20, flexDirection: 'row', marginBottom: 10, paddingHorizontal: 11, paddingVertical: 6 },
  badgeDot: { backgroundColor: '#C026D3', borderRadius: 3, height: 6, marginRight: 6, width: 6 },
  welcomeBadgeText: { color: theme.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.45 },
  welcomeTitle: { color: theme.colors.brand, fontSize: 25, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center' },
  welcomeDescription: { color: '#5F5C70', fontSize: 14, lineHeight: 21, marginTop: 5, maxWidth: 300, textAlign: 'center' },
  welcomeCard: { backgroundColor: theme.colors.surface, borderColor: '#ECEEF5', borderRadius: 14, borderWidth: 1, padding: 16 },
  cardTitle: { color: theme.colors.brand, fontSize: 16, fontWeight: '700', marginBottom: 5 },
  cardDescription: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  loginButton: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: '#FF3F62', borderRadius: 9, elevation: 3, justifyContent: 'center', minHeight: 52, shadowColor: '#FF3F62', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 8, width: '100%' },
  loginButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  guestButton: { alignItems: 'center', backgroundColor: '#E8EEFF', borderRadius: 9, justifyContent: 'center', minHeight: 44 },
  guestButtonText: { color: theme.colors.brand, fontSize: 14, fontWeight: '700' },
  buttonPressed: { opacity: 0.82 },
  separator: { alignItems: 'center', flexDirection: 'row', gap: 8, marginVertical: 15 },
  separatorLine: { backgroundColor: '#E6E7EF', flex: 1, height: 1 },
  separatorText: { color: theme.colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  privacyNote: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', marginTop: 16, textAlign: 'center' },
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
