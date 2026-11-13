import { ActionLink } from '@/components/ActionLink';
import { BookingCard } from '@/components/BookingCard';
import { Screen } from '@/components/Screen';
import { useAuth } from '@clerk/expo';
import { ApiClientError, getMyBookings } from '@/lib/api/client';
import type { MyBookingsResponse } from '@/lib/api/types';
import { theme } from '@/lib/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function TicketsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [bookings, setBookings] = useState<MyBookingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isLoaded || !isSignedIn) return () => { cancelled = true; };

    void getToken()
      .then((token) => {
        if (!token) throw new ApiClientError('La sesión de Clerk no tiene un token activo. Iniciá sesión de nuevo.');
        return getMyBookings(token);
      })
      .then((result) => {
        if (!cancelled) setBookings(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiClientError
          ? err.message
          : 'No se pudieron consultar tus reservas. Revisá la conexión con el backend.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn]);

  if (!isLoaded) {
    return <Screen eyebrow="PASAJES" title="Preparando tu sesión" description="Un momento, por favor."><ActivityIndicator color={theme.colors.accent} /></Screen>;
  }

  if (!isSignedIn) {
    return (
      <Screen eyebrow="PASAJES" title="Tus viajes, a mano." description="Iniciá sesión para consultar las reservas asociadas a tu cuenta.">
        <ActionLink href="/login" title="Iniciar sesión" description="Accedé a tus reservas y pasajes." />
      </Screen>
    );
  }

  return (
    <Screen eyebrow="PASAJES" title="Tus viajes, a mano." description="Reservas asociadas a tu cuenta de pasajero.">
      {isLoading && <ActivityIndicator color={theme.colors.accent} />}
      {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {!isLoading && !error && bookings && bookings.upcoming.length === 0 && bookings.past.length === 0 && (
        <Text style={styles.empty}>Aún no hay reservas asociadas a esta cuenta.</Text>
      )}
      {bookings && bookings.upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Próximos viajes</Text>
          {bookings.upcoming.map((booking) => <BookingCard key={booking.bookingCode} booking={booking} />)}
        </View>
      )}
      {bookings && bookings.past.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historial</Text>
          {bookings.past.map((booking) => <BookingCard key={booking.bookingCode} booking={booking} />)}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { color: theme.colors.brand, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 },
  empty: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
});
