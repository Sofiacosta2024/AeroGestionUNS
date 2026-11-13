import { Screen } from '@/components/Screen';
import { ApiClientError, createMobileReservation, getFlight, getFlightSeats, payMobileReservation } from '@/lib/api/client';
import type { FlightSeat, FlightSeatMap, MobileFlight, MobileReservationResult } from '@/lib/api/types';
import { formatFlightDate, formatPrice } from '@/lib/format';
import { theme } from '@/lib/theme';
import { useAuth, useUser } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type BookingStep = 'fare' | 'passengers' | 'payment' | 'confirmation';
type PassengerForm = { firstName: string; lastName: string; documentType: 'DNI' | 'PASAPORTE'; documentNumber: string };
type PaymentForm = { cardNumber: string; cardholder: string; expiry: string; cvv: string; contactEmail: string; installments: 1 | 3 | 6 };

function initialPassengerCount(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(9, parsed)) : 1;
}

const emptyPassenger = (): PassengerForm => ({ firstName: '', lastName: '', documentType: 'DNI', documentNumber: '' });

export default function BookingScreen() {
  const router = useRouter();
  const { flightId, passengers: passengerParam } = useLocalSearchParams<{ flightId: string; passengers?: string }>();
  const { getToken, isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [flight, setFlight] = useState<MobileFlight | null>(null);
  const [fareId, setFareId] = useState('');
  const [seatMap, setSeatMap] = useState<FlightSeatMap | null>(null);
  const [passengerCount, setPassengerCount] = useState(() => initialPassengerCount(passengerParam));
  const [passengers, setPassengers] = useState<PassengerForm[]>(() => Array.from({ length: initialPassengerCount(passengerParam) }, emptyPassenger));
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [step, setStep] = useState<BookingStep>('fare');
  const [booking, setBooking] = useState<MobileReservationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [payment, setPayment] = useState<PaymentForm>({
    cardNumber: '', cardholder: '', expiry: '', cvv: '', contactEmail: '', installments: 1,
  });

  const fare = flight?.prices.find((item) => item.id === fareId) ?? null;
  const currentSeatMap = seatMap?.fare?.id === fareId ? seatMap : null;
  const seatFee = fare ? (fare.seatSelection ? 0 : fare.seatSelectionFee ?? 0) : 0;
  const quotedTotal = fare ? (fare.price + seatFee) * passengerCount : 0;
  const secondsRemaining = booking ? Math.max(0, Math.floor((new Date(booking.expiresAt).getTime() - now) / 1000)) : 0;

  useEffect(() => {
    let cancelled = false;
    void getFlight(flightId)
      .then((result) => {
        if (!cancelled) {
          setFlight(result);
          setFareId(result.prices[0]?.id ?? '');
          if (result.prices.length === 0) setError('Este vuelo ya no tiene tarifas disponibles.');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar el vuelo.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [flightId]);

  useEffect(() => {
    if (!fareId) return;
    let cancelled = false;
    void getFlightSeats(flightId, fareId)
      .then((result) => { if (!cancelled) setSeatMap(result); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'No se pudo consultar el mapa de asientos.');
      });
    return () => { cancelled = true; };
  }, [fareId, flightId]);

  useEffect(() => {
    if (!booking || step !== 'payment') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [booking, step]);

  function resizePassengerList(nextCount: number) {
    const safeCount = Math.max(1, Math.min(9, nextCount));
    setPassengerCount(safeCount);
    setPassengers((current) => Array.from({ length: safeCount }, (_, index) => current[index] ?? emptyPassenger()));
    setSelectedSeatIds((current) => current.slice(0, safeCount));
  }

  function toggleSeat(seat: FlightSeat) {
    setError(null);
    setSelectedSeatIds((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= passengerCount) return current;
      return [...current, seat.id];
    });
  }

  function updatePassenger(index: number, field: keyof PassengerForm, value: string) {
    setPassengers((current) => current.map((passenger, itemIndex) => itemIndex === index ? { ...passenger, [field]: value } : passenger));
  }

  async function holdSeats() {
    setError(null);
    if (!fare || selectedSeatIds.length !== passengerCount) {
      setError(`Elegí ${passengerCount === 1 ? 'un asiento' : `${passengerCount} asientos`} para continuar.`);
      return;
    }
    if (passengers.some((item) => !item.firstName.trim() || !item.lastName.trim() || !item.documentNumber.trim())) {
      setError('Completá nombre, apellido y documento de cada pasajero.');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new ApiClientError('La sesión venció. Iniciá sesión nuevamente.');
      const result = await createMobileReservation(token, {
        flightId,
        fareId,
        seatIds: selectedSeatIds,
        quotedTotal,
        seatMode: 'MANUAL',
        passengers: passengers.map((item) => ({
          firstName: item.firstName.trim(),
          lastName: item.lastName.trim(),
          documentType: item.documentType,
          documentNumber: item.documentNumber.trim(),
        })),
      });
      setBooking(result);
      setNow(Date.now());
      setPayment((current) => ({ ...current, contactEmail: user?.primaryEmailAddress?.emailAddress ?? '' }));
      setStep('payment');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron bloquear los asientos. Revisá tu conexión e intentá de nuevo.');
      if (err instanceof ApiClientError && err.status === 409) {
        void getFlightSeats(flightId, fareId).then(setSeatMap).catch(() => undefined);
        setSelectedSeatIds([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitPayment() {
    setError(null);
    if (!booking) return;
    if (secondsRemaining <= 0) {
      setError('El bloqueo de asientos venció. Volvé a buscar el vuelo para elegir asientos disponibles.');
      return;
    }
    const cardNumber = payment.cardNumber.replace(/\D/g, '');
    if (cardNumber.length !== 16 || payment.cardholder.trim().length < 2 || !/^\d{2}\/\d{2}$/.test(payment.expiry) || !/^\d{3,4}$/.test(payment.cvv) || !/^\S+@\S+\.\S+$/.test(payment.contactEmail.trim())) {
      setError('Revisá los datos de la tarjeta y el correo de confirmación.');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new ApiClientError('La sesión venció. Iniciá sesión nuevamente.');
      const result = await payMobileReservation(token, {
        bookingCode: booking.bookingCode,
        cardNumber,
        cardholder: payment.cardholder.trim(),
        expiry: payment.expiry,
        cvv: payment.cvv,
        contactEmail: payment.contactEmail.trim(),
        installments: payment.installments,
      });
      if (result.payment.status === 'REJECTED') {
        setPayment((current) => ({ ...current, cardNumber: '', cvv: '' }));
        setError('El pago fue rechazado. Probá con otra tarjeta de prueba antes de que venza el bloqueo.');
        return;
      }
      setPayment((current) => ({ ...current, cardNumber: '', cvv: '' }));
      setStep('confirmation');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo procesar el pago. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!authLoaded || isLoading) {
    return <Screen eyebrow="RESERVA" title="Preparando tu viaje" description="Estamos cargando el vuelo y la disponibilidad."><ActivityIndicator color={theme.colors.accent} /></Screen>;
  }

  if (!isSignedIn) {
    const returnTo = `/booking/${flightId}?passengers=${passengerCount}`;
    return <Screen eyebrow="RESERVA" title="Iniciá sesión para continuar" description="La búsqueda es pública, pero para bloquear asientos y pagar necesitamos tu cuenta de pasajero."><Pressable onPress={() => router.replace({ pathname: '/login', params: { returnTo } })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Iniciar sesión</Text></Pressable></Screen>;
  }

  if (!flight) {
    return <Screen eyebrow="RESERVA" title={error ? 'No pudimos cargar este vuelo' : 'No encontramos este vuelo'} description={error ?? 'Volvé a la búsqueda e intentá con otro vuelo.'}><Pressable onPress={() => router.replace('/(tabs)/flights')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Volver a vuelos</Text></Pressable></Screen>;
  }

  const stepNumber = step === 'fare' ? 1 : step === 'passengers' ? 2 : step === 'payment' ? 3 : 4;
  const stepTitle = step === 'fare' ? 'Elegí tu tarifa' : step === 'passengers' ? 'Asientos y pasajeros' : step === 'payment' ? 'Pago de prueba' : 'Reserva confirmada';
  const description = `${flight.code} · ${flight.route.originAirport.iataCode} → ${flight.route.destinationAirport.iataCode} · ${formatFlightDate(flight.departureAt)}`;
  const rows = currentSeatMap ? [...new Set(currentSeatMap.seats.filter((seat) => seat.allowedForFare).map((seat) => seat.rowNumber))].sort((a, b) => a - b) : [];

  return (
    <Screen eyebrow={`RESERVA · PASO ${stepNumber} DE 4`} title={stepTitle} description={description}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryFlight}>{flight.code} · {flight.route.originAirport.city} → {flight.route.destinationAirport.city}</Text>
        <Text style={styles.summaryDate}>{formatFlightDate(flight.departureAt)}</Text>
      </View>

      {step === 'fare' && (
        <>
          <Text style={styles.sectionTitle}>Cantidad de pasajeros</Text>
          <View style={styles.counter}>
            <Pressable accessibilityLabel="Quitar un pasajero" disabled={passengerCount <= 1} onPress={() => resizePassengerList(passengerCount - 1)} style={styles.counterButton}><Text style={styles.counterButtonText}>−</Text></Pressable>
            <Text style={styles.counterValue}>{passengerCount}</Text>
            <Pressable accessibilityLabel="Agregar un pasajero" disabled={passengerCount >= 9} onPress={() => resizePassengerList(passengerCount + 1)} style={styles.counterButton}><Text style={styles.counterButtonText}>+</Text></Pressable>
          </View>
          <Text style={styles.helper}>Podés reservar de 1 a 9 pasajeros.</Text>
          <Text style={styles.sectionTitle}>Tarifas disponibles</Text>
          {flight.prices.map((item) => (
            <Pressable key={item.id} onPress={() => { setFareId(item.id); setSelectedSeatIds([]); }} style={[styles.fareCard, fareId === item.id && styles.fareSelected]}>
              <View style={styles.fareHeader}><Text style={styles.fareName}>{item.name}</Text><Text style={styles.farePrice}>{formatPrice(item.price, item.currency)}</Text></View>
              <Text style={styles.helper}>{item.cabinClass} · {item.availableSeats} lugares disponibles</Text>
              <Text style={styles.helper}>{item.seatSelection ? 'Selección de asiento incluida' : `Selección de asiento: ${formatPrice(item.seatSelectionFee ?? 0, item.currency)} por pasajero`}</Text>
              {!!item.benefits?.length && <Text style={styles.helper}>{item.benefits.join(' · ')}</Text>}
            </Pressable>
          ))}
          {fare && <View style={styles.totalBox}><Text style={styles.totalLabel}>Total estimado</Text><Text style={styles.totalValue}>{formatPrice(quotedTotal, fare.currency)}</Text></View>}
          <Pressable disabled={!fare || !currentSeatMap} onPress={() => { setError(null); setStep('passengers'); }} style={[styles.primaryButton, (!fare || !currentSeatMap) && styles.disabled]}>
            {!currentSeatMap ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Continuar a asientos</Text>}
          </Pressable>
        </>
      )}

      {step === 'passengers' && (
        <>
          <Text style={styles.sectionTitle}>Elegí {passengerCount === 1 ? 'un asiento' : `${passengerCount} asientos`}</Text>
          <Text style={styles.helper}>{currentSeatMap?.aircraft.model ?? 'Aeronave'} · los asientos disponibles aparecen en blanco.</Text>
          {currentSeatMap ? (
            <View style={styles.seatMap}>
              {rows.map((row) => (
                <View key={row} style={styles.seatRow}>
                  <Text style={styles.rowNumber}>{row}</Text>
                  {currentSeatMap.seats.filter((seat) => seat.rowNumber === row && seat.allowedForFare).sort((a, b) => a.columnLetter.localeCompare(b.columnLetter)).map((seat) => (
                    <SeatButton key={seat.id} seat={seat} selected={selectedSeatIds.includes(seat.id)} onPress={() => toggleSeat(seat)} />
                  ))}
                </View>
              ))}
              <View style={styles.legend}><Legend color={theme.colors.success} label="Elegido" /><Legend color={theme.colors.surface} label="Disponible" /><Legend color="#E5E7EB" label="Ocupado" /></View>
            </View>
          ) : <ActivityIndicator color={theme.colors.accent} />}

          {passengers.map((passenger, index) => (
            <View key={index} style={styles.passengerCard}>
              <Text style={styles.passengerTitle}>Pasajero {index + 1}{selectedSeatIds[index] ? ` · Asiento ${currentSeatMap?.seats.find((seat) => seat.id === selectedSeatIds[index])?.rowNumber}${currentSeatMap?.seats.find((seat) => seat.id === selectedSeatIds[index])?.columnLetter}` : ''}</Text>
              <Text style={styles.label}>Nombre</Text>
              <TextInput autoCapitalize="words" onChangeText={(value) => updatePassenger(index, 'firstName', value)} placeholder="Nombre" placeholderTextColor={theme.colors.muted} style={styles.input} value={passenger.firstName} />
              <Text style={styles.label}>Apellido</Text>
              <TextInput autoCapitalize="words" onChangeText={(value) => updatePassenger(index, 'lastName', value)} placeholder="Apellido" placeholderTextColor={theme.colors.muted} style={styles.input} value={passenger.lastName} />
              <Text style={styles.label}>Tipo de documento</Text>
              <View style={styles.documentTypes}>
                {(['DNI', 'PASAPORTE'] as const).map((type) => <Pressable key={type} onPress={() => updatePassenger(index, 'documentType', type)} style={[styles.documentType, passenger.documentType === type && styles.documentTypeSelected]}><Text style={[styles.documentTypeText, passenger.documentType === type && styles.documentTypeTextSelected]}>{type}</Text></Pressable>)}
              </View>
              <Text style={styles.label}>Número de documento</Text>
              <TextInput autoCapitalize="characters" onChangeText={(value) => updatePassenger(index, 'documentNumber', value)} placeholder="Número sin puntos" placeholderTextColor={theme.colors.muted} style={styles.input} value={passenger.documentNumber} />
            </View>
          ))}
          <View style={styles.totalBox}><Text style={styles.totalLabel}>Total estimado</Text><Text style={styles.totalValue}>{fare ? formatPrice(quotedTotal, fare.currency) : '—'}</Text></View>
          <Pressable disabled={isSubmitting} onPress={holdSeats} style={[styles.primaryButton, isSubmitting && styles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Bloquear asientos y continuar</Text>}
          </Pressable>
          <Pressable disabled={isSubmitting} onPress={() => setStep('fare')} style={styles.backButton}><Text style={styles.backButtonText}>Volver a tarifa</Text></Pressable>
        </>
      )}

      {step === 'payment' && booking && (
        <>
          <View style={[styles.notice, secondsRemaining <= 60 && styles.noticeWarning]}>
            <Text style={styles.noticeTitle}>Reserva {booking.bookingCode}</Text>
            <Text style={styles.noticeText}>Asientos bloqueados por {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')} min. Si vence el tiempo, se liberan automáticamente.</Text>
          </View>
          <View style={styles.notice}><Text style={styles.noticeTitle}>Pasarela de pago simulada · TEST MODE</Text><Text style={styles.noticeText}>No se realiza un cobro real. Para simular un rechazo usá 1111 1111 1111 1111; otro número válido de 16 dígitos se aprueba en este entorno.</Text></View>
          <Text style={styles.label}>Número de tarjeta</Text>
          <TextInput autoComplete="off" keyboardType="number-pad" maxLength={19} onChangeText={(value) => setPayment((current) => ({ ...current, cardNumber: value.replace(/\D/g, '').slice(0, 16) }))} placeholder="0000 0000 0000 0000" placeholderTextColor={theme.colors.muted} style={styles.input} value={payment.cardNumber.replace(/(.{4})/g, '$1 ').trim()} />
          <Text style={styles.label}>Titular</Text>
          <TextInput autoCapitalize="words" autoComplete="off" onChangeText={(value) => setPayment((current) => ({ ...current, cardholder: value }))} placeholder="Como figura en la tarjeta" placeholderTextColor={theme.colors.muted} style={styles.input} value={payment.cardholder} />
          <View style={styles.paymentPair}>
            <View style={styles.paymentField}><Text style={styles.label}>Vencimiento</Text><TextInput keyboardType="number-pad" maxLength={5} onChangeText={(value) => { const digits = value.replace(/\D/g, '').slice(0, 4); setPayment((current) => ({ ...current, expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits })); }} placeholder="MM/AA" placeholderTextColor={theme.colors.muted} style={styles.input} value={payment.expiry} /></View>
            <View style={styles.paymentField}><Text style={styles.label}>CVV</Text><TextInput keyboardType="number-pad" maxLength={4} onChangeText={(value) => setPayment((current) => ({ ...current, cvv: value.replace(/\D/g, '').slice(0, 4) }))} placeholder="•••" placeholderTextColor={theme.colors.muted} secureTextEntry style={styles.input} value={payment.cvv} /></View>
          </View>
          <Text style={styles.label}>Correo de confirmación</Text>
          <TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setPayment((current) => ({ ...current, contactEmail: value }))} placeholder="tu@email.com" placeholderTextColor={theme.colors.muted} style={styles.input} value={payment.contactEmail} />
          <Text style={styles.label}>Cuotas sin interés</Text>
          <View style={styles.installments}>{([1, 3, 6] as const).map((count) => <Pressable key={count} onPress={() => setPayment((current) => ({ ...current, installments: count }))} style={[styles.installment, payment.installments === count && styles.documentTypeSelected]}><Text style={[styles.installmentText, payment.installments === count && styles.documentTypeTextSelected]}>{count}</Text></Pressable>)}</View>
          {fare && <View style={styles.totalBox}><Text style={styles.totalLabel}>Total a pagar</Text><Text style={styles.totalValue}>{formatPrice(booking.totalAmount, fare.currency)}</Text></View>}
          <Pressable disabled={isSubmitting || secondsRemaining <= 0} onPress={submitPayment} style={[styles.primaryButton, (isSubmitting || secondsRemaining <= 0) && styles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Pagar y confirmar</Text>}
          </Pressable>
        </>
      )}

      {step === 'confirmation' && booking && (
        <View style={styles.confirmationCard}>
          <Text style={styles.confirmationMark}>✓</Text>
          <Text style={styles.confirmationTitle}>¡Tu viaje está confirmado!</Text>
          <Text style={styles.confirmationText}>Código de reserva</Text>
          <Text selectable style={styles.confirmationCode}>{booking.bookingCode}</Text>
          <Text style={styles.confirmationText}>El pasaje ya está asociado a tu cuenta. Podés consultarlo desde Mis pasajes.</Text>
          <Pressable onPress={() => router.replace('/(tabs)/tickets')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Ver mis pasajes</Text></Pressable>
        </View>
      )}

      {error && step !== 'confirmation' && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {step !== 'confirmation' && <Pressable onPress={() => router.replace('/(tabs)/flights')} style={styles.backButton}><Text style={styles.backButtonText}>Cancelar y volver a vuelos</Text></Pressable>}
    </Screen>
  );
}

function SeatButton({ seat, selected, onPress }: { seat: FlightSeat; selected: boolean; onPress: () => void }) {
  const disabled = seat.status !== 'FREE' || !seat.allowedForFare;
  return <Pressable accessibilityLabel={`Asiento ${seat.rowNumber}${seat.columnLetter}${disabled ? ', no disponible' : ''}`} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.seat, selected && styles.seatSelected, disabled && styles.seatDisabled]}><Text style={[styles.seatText, selected && styles.seatTextSelected, disabled && styles.seatTextDisabled]}>{seat.columnLetter}</Text></Pressable>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.helper}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: theme.colors.surfaceSoft, borderRadius: theme.radius.control, marginBottom: 22, padding: 14 },
  summaryFlight: { color: theme.colors.brand, fontSize: 15, fontWeight: '700' },
  summaryDate: { color: theme.colors.muted, fontSize: 13, marginTop: 5 },
  sectionTitle: { color: theme.colors.brand, fontSize: 17, fontWeight: '700', marginBottom: 10, marginTop: 18 },
  counter: { alignItems: 'center', flexDirection: 'row', gap: 18, marginBottom: 5 },
  counterButton: { alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, height: 42, justifyContent: 'center', width: 48 },
  counterButtonText: { color: theme.colors.brand, fontSize: 22, fontWeight: '600' },
  counterValue: { color: theme.colors.text, fontSize: 17, fontWeight: '700', minWidth: 22, textAlign: 'center' },
  helper: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  fareCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, marginBottom: 10, padding: 15 },
  fareSelected: { backgroundColor: '#F7F1FF', borderColor: theme.colors.brand, borderWidth: 2 },
  fareHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  fareName: { color: theme.colors.brand, flexShrink: 1, fontSize: 15, fontWeight: '700', marginRight: 8 },
  farePrice: { color: theme.colors.accent, fontSize: 15, fontWeight: '700' },
  totalBox: { alignItems: 'center', backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginVertical: 14, padding: 14 },
  totalLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  totalValue: { color: theme.colors.brand, fontSize: 17, fontWeight: '800' },
  primaryButton: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.radius.control, justifyContent: 'center', marginTop: 10, minHeight: 50, paddingHorizontal: 16, paddingVertical: 13 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.control, borderWidth: 1, marginTop: 12, padding: 14 },
  secondaryButtonText: { color: theme.colors.brand, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  seatMap: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, marginBottom: 16, padding: 12 },
  seatRow: { alignItems: 'center', flexDirection: 'row', gap: 5, justifyContent: 'center', marginBottom: 6 },
  rowNumber: { color: theme.colors.muted, fontSize: 11, marginRight: 4, width: 22 },
  seat: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: theme.colors.success, borderRadius: 7, borderWidth: 1, height: 34, justifyContent: 'center', width: 36 },
  seatSelected: { backgroundColor: theme.colors.success },
  seatDisabled: { backgroundColor: '#E5E7EB', borderColor: '#D1D5DB' },
  seatText: { color: theme.colors.brand, fontSize: 11, fontWeight: '700' },
  seatTextSelected: { color: '#FFFFFF' },
  seatTextDisabled: { color: '#9CA3AF' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 12 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderColor: theme.colors.border, borderRadius: 5, borderWidth: 1, height: 10, width: 10 },
  passengerCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, marginBottom: 12, padding: 15 },
  passengerTitle: { color: theme.colors.brand, fontSize: 15, fontWeight: '700', marginBottom: 14 },
  label: { color: theme.colors.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, color: theme.colors.text, fontSize: 15, marginBottom: 13, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  documentTypes: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  documentType: { alignItems: 'center', backgroundColor: theme.colors.surfaceSoft, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 },
  documentTypeSelected: { backgroundColor: theme.colors.brand },
  documentTypeText: { color: theme.colors.brand, fontSize: 12, fontWeight: '700' },
  documentTypeTextSelected: { color: '#FFFFFF' },
  backButton: { alignItems: 'center', paddingVertical: 14 },
  backButtonText: { color: theme.colors.brand, fontSize: 14, fontWeight: '600' },
  notice: { backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, marginBottom: 12, padding: 14 },
  noticeWarning: { backgroundColor: '#FFF4E0' },
  noticeTitle: { color: theme.colors.brand, fontSize: 14, fontWeight: '700', marginBottom: 5 },
  noticeText: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  paymentPair: { flexDirection: 'row', gap: 12 },
  paymentField: { flex: 1 },
  installments: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  installment: { alignItems: 'center', backgroundColor: theme.colors.surfaceSoft, borderRadius: 9, minWidth: 58, paddingVertical: 10 },
  installmentText: { color: theme.colors.brand, fontSize: 13, fontWeight: '700' },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21, marginTop: 10 },
  confirmationCard: { alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, padding: 20 },
  confirmationMark: { alignItems: 'center', backgroundColor: '#DCF5EA', borderRadius: 32, color: theme.colors.success, fontSize: 32, fontWeight: '800', height: 64, lineHeight: 64, marginBottom: 14, overflow: 'hidden', textAlign: 'center', width: 64 },
  confirmationTitle: { color: theme.colors.brand, fontSize: 19, fontWeight: '800', marginBottom: 18, textAlign: 'center' },
  confirmationText: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 8, textAlign: 'center' },
  confirmationCode: { color: theme.colors.accent, fontSize: 22, fontWeight: '800', letterSpacing: 1, marginBottom: 16 },
});
