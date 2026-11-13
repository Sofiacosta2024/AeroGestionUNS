import type { MyBooking } from '@/lib/api/types';
import { formatFlightDate, presentStatus } from '@/lib/format';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

export function BookingCard({ booking }: { booking: MyBooking }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.bookingCode}>{booking.bookingCode}</Text>
        <Text style={styles.status}>{presentStatus(booking.status)}</Text>
      </View>
      {booking.flights.map((flight) => (
        <View key={`${booking.bookingCode}-${flight.flightCode}`} style={styles.flight}>
          <Text style={styles.flightCode}>{flight.flightCode}</Text>
          <Text style={styles.route}>
            {flight.origin?.iataCode ?? '—'}  →  {flight.destination?.iataCode ?? '—'}
          </Text>
          <Text style={styles.detail}>{formatFlightDate(flight.departureAt)}</Text>
          <Text style={styles.detail}>Vuelo: {presentStatus(flight.status)}</Text>
        </View>
      ))}
      {booking.proposedFlight && (
        <View style={styles.proposal}>
          <Text style={styles.proposalTitle}>Vuelo alternativo propuesto</Text>
          <Text style={styles.route}>
            {booking.proposedFlight.origin?.iataCode ?? '—'}  →  {booking.proposedFlight.destination?.iataCode ?? '—'}
          </Text>
          <Text style={styles.detail}>{formatFlightDate(booking.proposedFlight.departureAt)}</Text>
          {booking.proposalReason && <Text style={styles.detail}>{booking.proposalReason}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    marginBottom: 12,
    padding: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bookingCode: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  status: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  flight: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 13,
  },
  flightCode: {
    color: theme.colors.brand,
    fontSize: 15,
    fontWeight: '700',
  },
  route: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 5,
  },
  detail: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  proposal: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 13,
  },
  proposalTitle: {
    color: theme.colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
});
