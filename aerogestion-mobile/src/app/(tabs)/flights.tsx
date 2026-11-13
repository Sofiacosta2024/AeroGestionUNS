import { FlightCard } from '@/components/FlightCard';
import { Screen } from '@/components/Screen';
import { ApiClientError, searchAvailableFlights, type FlightSearchFilters } from '@/lib/api/client';
import type { MobileFlight } from '@/lib/api/types';
import { theme } from '@/lib/theme';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function FlightsScreen() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [flights, setFlights] = useState<MobileFlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (filters: FlightSearchFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await searchAvailableFlights(filters);
      setFlights(result.data);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof ApiClientError
        ? err.message
        : 'No se pudo conectar con el backend. Revisá la URL de la API y que el servidor esté iniciado.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void searchAvailableFlights({})
      .then((result) => {
        if (!cancelled) {
          setFlights(result.data);
          setHasLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiClientError
          ? err.message
          : 'No se pudo conectar con el backend. Revisá la URL de la API y que el servidor esté iniciado.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <Screen
      eyebrow="VUELOS"
      title="Encontrá tu próximo viaje."
      description="Buscamos vuelos disponibles directamente en AeroGestión UNS."
    >
      <View style={styles.form}>
        <Text style={styles.label}>Origen (código IATA)</Text>
        <TextInput autoCapitalize="characters" maxLength={3} onChangeText={setOrigin} placeholder="BHI" placeholderTextColor="#64748b" style={styles.input} value={origin} />
        <Text style={styles.label}>Destino (código IATA)</Text>
        <TextInput autoCapitalize="characters" maxLength={3} onChangeText={setDestination} placeholder="AEP" placeholderTextColor="#64748b" style={styles.input} value={destination} />
        <Text style={styles.label}>Fecha (opcional)</Text>
        <TextInput keyboardType="numbers-and-punctuation" onChangeText={setDate} placeholder="AAAA-MM-DD" placeholderTextColor="#64748b" style={styles.input} value={date} />
        <Text style={styles.label}>Pasajeros</Text>
        <View style={styles.passengerControl}>
          <Pressable accessibilityLabel="Quitar un pasajero" accessibilityRole="button" disabled={passengerCount <= 1} onPress={() => setPassengerCount((count) => Math.max(1, count - 1))} style={styles.countButton}><Text style={styles.countButtonText}>−</Text></Pressable>
          <Text style={styles.countText}>{passengerCount} {passengerCount === 1 ? 'pasajero' : 'pasajeros'}</Text>
          <Pressable accessibilityLabel="Agregar un pasajero" accessibilityRole="button" disabled={passengerCount >= 9} onPress={() => setPassengerCount((count) => Math.min(9, count + 1))} style={styles.countButton}><Text style={styles.countButtonText}>+</Text></Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => runSearch({ origin, destination, date, passengers: passengerCount })}
          style={({ pressed }) => [styles.button, isLoading && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Buscar vuelos</Text>
        </Pressable>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Vuelos disponibles</Text>
        {isLoading && <ActivityIndicator color={theme.colors.accent} />}
      </View>
      {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {!isLoading && !error && hasLoaded && flights.length === 0 && (
        <Text style={styles.empty}>No encontramos vuelos disponibles con esos criterios.</Text>
      )}
      {flights.map((flight) => (
        <FlightCard
          key={flight.id}
          flight={flight}
          onReserve={() => {
            const returnTo = `/booking/${flight.id}?passengers=${passengerCount}`;
            if (!isSignedIn) {
              router.push({ pathname: '/login', params: { returnTo } });
              return;
            }
            router.push({ pathname: '/booking/[flightId]', params: { flightId: flight.id, passengers: String(passengerCount) } });
          }}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 28, padding: 16 },
  label: { color: theme.colors.text, fontSize: 13, fontWeight: '600', marginBottom: 7 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderColor: theme.colors.border, borderRadius: 11, borderWidth: 1, color: theme.colors.text, fontSize: 15, marginBottom: 15, paddingHorizontal: 13, paddingVertical: 12 },
  passengerControl: { alignItems: 'center', flexDirection: 'row', gap: 16, marginBottom: 16, marginTop: 1 },
  countButton: { alignItems: 'center', backgroundColor: theme.colors.surfaceSoft, borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, height: 40, justifyContent: 'center', width: 44 },
  countButtonText: { color: theme.colors.brand, fontSize: 21, fontWeight: '600' },
  countText: { color: theme.colors.text, fontSize: 14, fontWeight: '600', minWidth: 90, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: 12, marginTop: 3, padding: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
  resultsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  resultsTitle: { color: theme.colors.brand, fontSize: 18, fontWeight: '700' },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  empty: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
});
