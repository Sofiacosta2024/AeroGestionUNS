import type { OfflineTicket } from '@/lib/tickets/offline';
import { formatFlightDate } from '@/lib/format';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

export function OfflineTicketCard({ tickets }: { tickets: OfflineTicket[] }) {
  const ticket = tickets[0];
  if (!ticket) return null;

  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.route}>{ticket.origin?.iataCode ?? '—'} → {ticket.destination?.iataCode ?? '—'}</Text>
        <Text style={styles.detail}>{ticket.flightCode} · {formatFlightDate(ticket.departureAt)}</Text>
        <Text style={styles.saved}>Reserva {ticket.bookingCode} · Guardado sin conexión</Text>
      </View>
      {tickets.map((item) => (
        <Link
          key={item.ticketCode}
          href={{
            pathname: '/ticket/[bookingCode]/[boardingPassCode]',
            params: { bookingCode: item.bookingCode, boardingPassCode: item.ticketCode },
          } as unknown as Href}
          asChild
        >
          <Pressable style={styles.ticketButton}>
            <Text style={styles.ticketButtonText}>
              {tickets.length > 1 ? `Ver E-Ticket · Asiento ${item.seat ?? 'pendiente'}` : 'Ver mi E-Ticket'}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, marginBottom: 10, padding: 16 },
  route: { color: theme.colors.brand, fontSize: 16, fontWeight: '700' },
  detail: { color: theme.colors.text, fontSize: 13, marginTop: 6 },
  saved: { color: theme.colors.success, fontSize: 12, fontWeight: '600', marginTop: 6 },
  ticketButton: { alignItems: 'center', backgroundColor: theme.colors.brand, borderRadius: theme.radius.control, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  ticketButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
