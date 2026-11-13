import type { MobileFlight } from '@/lib/api/types';
import { formatFlightDate, formatPrice, presentStatus } from '@/lib/format';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

export function FlightCard({ flight, onReserve }: { flight: MobileFlight; onReserve: () => void }) {
  const cheapestPrice = flight.prices[0];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.flightCode}>{flight.code}</Text>
        <Text style={styles.status}>{presentStatus(flight.status)}</Text>
      </View>
      <Text style={styles.route}>
        {flight.route.originAirport.iataCode}  →  {flight.route.destinationAirport.iataCode}
      </Text>
      <Text style={styles.cities}>
        {flight.route.originAirport.city} · {flight.route.destinationAirport.city}
      </Text>
      <Text style={styles.date}>{formatFlightDate(flight.departureAt)}</Text>
      <View style={styles.footer}>
        <Text style={styles.aircraft}>{flight.aircraft.model}</Text>
        <Text style={styles.price}>
          {cheapestPrice ? `Desde ${formatPrice(cheapestPrice.price, cheapestPrice.currency)}` : 'Precio no disponible'}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onReserve} style={({ pressed }) => [styles.reserveButton, pressed && styles.pressed]}>
        <Text style={styles.reserveText}>Elegir vuelo y reservar</Text>
        <Text style={styles.reserveArrow}>›</Text>
      </Pressable>
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
  flightCode: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  status: {
    color: theme.colors.success,
    fontSize: 12,
  },
  route: {
    color: theme.colors.brand,
    fontSize: 23,
    fontWeight: '700',
    marginTop: 14,
  },
  cities: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: 3,
  },
  date: {
    color: theme.colors.text,
    fontSize: 14,
    marginTop: 16,
  },
  footer: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 12,
  },
  aircraft: {
    color: theme.colors.muted,
    flexShrink: 1,
    fontSize: 12,
    marginRight: 10,
  },
  price: {
    color: theme.colors.brand,
    fontSize: 13,
    fontWeight: '700',
  },
  reserveButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.control,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 46,
  },
  reserveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  reserveArrow: { color: '#FFFFFF', fontSize: 22, fontWeight: '400', marginLeft: 8, marginTop: -2 },
  pressed: { opacity: 0.8 },
});
