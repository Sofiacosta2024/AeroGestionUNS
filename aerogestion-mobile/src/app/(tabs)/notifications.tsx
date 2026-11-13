import { ActionLink } from '@/components/ActionLink';
import { Screen } from '@/components/Screen';
import { ApiClientError, getMobileNotifications } from '@/lib/api/client';
import type { MobileNotification } from '@/lib/api/types';
import { theme } from '@/lib/theme';
import { useAuth } from '@clerk/expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

function formatSentAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

function NotificationCard({ notification }: { notification: MobileNotification }) {
  const cancelled = notification.type === 'FLIGHT_CANCELLED';
  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={[styles.dot, cancelled && styles.cancelledDot]} />
        <Text style={[styles.kind, cancelled && styles.cancelledKind]}>
          {cancelled ? 'Vuelo cancelado' : 'Cambio de vuelo'}
        </Text>
        <Text style={styles.date}>{formatSentAt(notification.sentAt)}</Text>
      </View>
      <Text style={styles.title}>{notification.title}</Text>
      <Text style={styles.message}>{notification.message}</Text>
      {(notification.flightCode || notification.bookingCode) && (
        <Text style={styles.reference}>
          {[notification.flightCode && `Vuelo ${notification.flightCode}`, notification.bookingCode && `Reserva ${notification.bookingCode}`]
            .filter(Boolean).join(' · ')}
        </Text>
      )}
    </View>
  );
}

export default function NotificationsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (!isLoaded) return () => { cancelled = true; };
    if (!isSignedIn) {
      setNotifications([]);
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    setIsLoading(true);
    setError(null);
    void getTokenRef.current()
      .then((token) => {
        if (!token) throw new ApiClientError('La sesión no tiene un token activo. Iniciá sesión de nuevo.');
        return getMobileNotifications(token);
      })
      .then((result) => { if (!cancelled) setNotifications(result.notifications); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo consultar el historial.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]));

  if (!isLoaded) {
    return <Screen eyebrow="AVISOS" title="Preparando tu sesión" description="Un momento, por favor." compact headerTitle="Notificaciones"><ActivityIndicator color={theme.colors.accent} /></Screen>;
  }

  if (!isSignedIn) {
    return (
      <Screen eyebrow="AVISOS" title="Novedades de tus vuelos." description="Iniciá sesión para consultar los avisos asociados a tus dispositivos." compact headerTitle="Notificaciones">
        <ActionLink href="/login" title="Iniciar sesión" description="Accedé al historial de avisos de tus vuelos." />
      </Screen>
    );
  }

  return (
    <Screen eyebrow="AVISOS" title="Novedades de tus vuelos." description="Avisos sobre cancelaciones y cambios de horario enviados a tus dispositivos." compact headerTitle="Notificaciones">
      {isLoading && <ActivityIndicator color={theme.colors.accent} />}
      {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {!isLoading && !error && notifications.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Todavía no hay avisos</Text>
          <Text style={styles.emptyText}>Cuando haya novedades sobre tus vuelos, vas a encontrarlas acá.</Text>
        </View>
      )}
      {notifications.map((notification) => <NotificationCard key={notification.id} notification={notification} />)}
      {!error && <Text style={styles.disclaimer}>El historial incluye los avisos que el servicio de notificaciones aceptó para envío.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, marginBottom: 12, padding: 15 },
  cardHeading: { alignItems: 'center', flexDirection: 'row', marginBottom: 10 },
  dot: { backgroundColor: theme.colors.accent, borderRadius: 5, height: 9, marginRight: 7, width: 9 },
  cancelledDot: { backgroundColor: theme.colors.danger },
  kind: { color: theme.colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cancelledKind: { color: theme.colors.danger },
  date: { color: theme.colors.muted, fontSize: 11, marginLeft: 'auto' },
  title: { color: theme.colors.brand, fontSize: 16, fontWeight: '700', marginBottom: 5 },
  message: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
  reference: { borderTopColor: theme.colors.border, borderTopWidth: 1, color: theme.colors.muted, fontSize: 12, marginTop: 12, paddingTop: 9 },
  emptyCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, padding: 18 },
  emptyTitle: { color: theme.colors.brand, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptyText: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 },
  disclaimer: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
