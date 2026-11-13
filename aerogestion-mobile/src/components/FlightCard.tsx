import type { MobileFlight } from '@/lib/api/types';
import { formatPrice, presentStatus } from '@/lib/format';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

export function FlightCard({ flight, onReserve }: { flight: MobileFlight; onReserve: () => void }) {
  const cheapestPrice = flight.prices[0];
  const departureTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(flight.departureAt));
  const arrivalTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(flight.arrivalAt));
  const flightDay = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(flight.departureAt));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.flightCode}>{flight.code}</Text>
        <Text style={styles.status}>{presentStatus(flight.status)}</Text>
      </View>
      <Text style={styles.route}>
        {flight.route.originAirport.iataCode}  →  {flight.route.destinationAirport.iataCode}
      </Text>
      <Text style={styles.date}>{departureTime} → {arrivalTime} · {flightDay}</Text>
      <View style={styles.footer}>
        <Text style={styles.aircraft}>{flight.aircraft.model}</Text>
        <Text style={styles.price}>
          {cheapestPrice ? `${cheapestPrice.name} · ${formatPrice(cheapestPrice.price, cheapestPrice.currency)}` : 'Precio no disponible'}
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
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flightCode: {
    color: theme.colors.brand,
    fontSize: 14,
    fontWeight: '700',
  },
  status: {
    backgroundColor: '#DCFCE7',
    borderRadius: 9,
    color: theme.colors.success,
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  route: {
    color: theme.colors.brand,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 7,
  },
  date: {
    color: theme.colors.text,
    fontSize: 12,
    marginTop: 7,
  },
  footer: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 9,
  },
  aircraft: {
    color: theme.colors.muted,
    flexShrink: 1,
    fontSize: 10,
    marginRight: 10,
  },
  price: {
    color: theme.colors.brand,
    fontSize: 11,
    fontWeight: '700',
  },
  reserveButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 7,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 11,
    minHeight: 40,
  },
  reserveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  reserveArrow: { color: '#FFFFFF', fontSize: 22, fontWeight: '400', marginLeft: 8, marginTop: -2 },
  pressed: { opacity: 0.8 },
});
