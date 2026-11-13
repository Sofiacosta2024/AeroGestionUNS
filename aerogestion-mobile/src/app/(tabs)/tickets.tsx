import { ActionLink } from '@/components/ActionLink';
import { BookingCard } from '@/components/BookingCard';
import { OfflineTicketCard } from '@/components/OfflineTicketCard';
import { Screen } from '@/components/Screen';
import { useAuth, useUser } from '@clerk/expo';
import { ApiClientError, getMyBookings } from '@/lib/api/client';
import type { MyBookingsResponse } from '@/lib/api/types';
import { getOfflineTickets, syncOfflineTickets, type OfflineTicket } from '@/lib/tickets/offline';
import { theme } from '@/lib/theme';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function TicketsScreen() {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const userId = user?.id;
  // Clerk puede devolver una referencia nueva a getToken tras cada render. Mantener
  // la referencia actual evita volver a consultar reservas cuando cambia el estado UI.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const [bookings, setBookings] = useState<MyBookingsResponse | null>(null);
  const [offlineTickets, setOfflineTickets] = useState<OfflineTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (!isAuthLoaded || !isUserLoaded) return () => { cancelled = true; };
    if (!isSignedIn || !userId) {
      setBookings(null);
      setOfflineTickets([]);
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    setError(null);
    setBookings(null);

    void getOfflineTickets(userId)
      .then((saved) => { if (!cancelled) setOfflineTickets(saved); })
      .catch(() => undefined);

    void getTokenRef.current()
      .then((token) => {
        if (!token) throw new ApiClientError('La sesión de Clerk no tiene un token activo. Iniciá sesión de nuevo.');
        return getMyBookings(token);
      })
      .then((result) => {
        const tickets = [...result.upcoming, ...result.past].flatMap((booking) => booking.tickets ?? []);
        return syncOfflineTickets(userId, tickets).then(() => {
          if (!cancelled) {
            setBookings(result);
            setOfflineTickets(tickets.map((ticket) => ({ ...ticket, ownerId: userId, savedAt: new Date().toISOString() })));
          }
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiClientError
          ? err.message
          : 'No se pudieron consultar tus reservas. Revisá la conexión con el backend.');
      })
      .finally(async () => {
        if (!cancelled) {
          const saved = await getOfflineTickets(userId).catch(() => []);
          setOfflineTickets(saved);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [isAuthLoaded, isSignedIn, isUserLoaded, userId]));

  if (!isAuthLoaded || !isUserLoaded) {
    return <Screen eyebrow="PASAJES" title="Preparando tu sesión" description="Un momento, por favor." compact headerTitle="Mis Pasajes"><ActivityIndicator color={theme.colors.accent} /></Screen>;
  }

  if (!isSignedIn) {
    return (
      <Screen eyebrow="PASAJES" title="Tus viajes, a mano." description="Iniciá sesión para consultar las reservas asociadas a tu cuenta." compact headerTitle="Mis Pasajes">
        <ActionLink href="/login" title="Iniciar sesión" description="Accedé a tus reservas y pasajes." />
      </Screen>
    );
  }

  return (
    <Screen eyebrow="PASAJES" title="Tus viajes, a mano." description="Reservas asociadas a tu cuenta de pasajero." compact headerTitle="Mis Pasajes">
      {isLoading && <ActivityIndicator color={theme.colors.accent} />}
      {error && offlineTickets.length === 0 && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {error && offlineTickets.length > 0 && <Text accessibilityLiveRegion="polite" style={styles.offlineNotice}>Sin conexión con el servidor. Mostramos los viajes guardados en este dispositivo.</Text>}
      {error && offlineTickets.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Viajes guardados en este dispositivo</Text>
          {groupOfflineTrips(offlineTickets).map((tickets) => (
            <OfflineTicketCard key={`${tickets[0].bookingCode}-${tickets[0].flightCode}`} tickets={tickets} />
          ))}
        </View>
      )}
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
  offlineNotice: { color: theme.colors.success, fontSize: 14, lineHeight: 21, marginBottom: 14 },
});

function groupOfflineTrips(tickets: OfflineTicket[]) {
  const groups = new Map<string, OfflineTicket[]>();
  for (const ticket of tickets) {
    const key = `${ticket.bookingCode}-${ticket.flightCode}`;
    groups.set(key, [...(groups.get(key) ?? []), ticket]);
  }
  return [...groups.values()];
}
