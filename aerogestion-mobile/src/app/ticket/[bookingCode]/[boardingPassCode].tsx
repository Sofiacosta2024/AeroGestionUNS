import { ActionLink } from '@/components/ActionLink';
import { Screen } from '@/components/Screen';
import { getMyBookings } from '@/lib/api/client';
import type { MyBookingTicket } from '@/lib/api/types';
import { formatFlightDate, formatTicketDate } from '@/lib/format';
import { getOfflineTicket, removeOfflineTicket, type OfflineTicket, syncOfflineTickets } from '@/lib/tickets/offline';
import { theme } from '@/lib/theme';
import { useAuth, useUser } from '@clerk/expo';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import QRCode from 'react-native-qrcode-svg';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type QrSvgRef = { toDataURL: (callback: (value: string) => void) => void };

function ticketPdfFilename(ticket: Pick<OfflineTicket, 'bookingCode' | 'ticketCode' | 'departureAt'>) {
  const scheduleVersion = ticket.departureAt?.replace(/\D/g, '') || 'sin-fecha';
  return `e-ticket-${ticket.bookingCode}-${ticket.ticketCode}-${scheduleVersion}.pdf`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

function ticketPdfHtml(ticket: OfflineTicket, qrBase64: string) {
  const from = ticket.origin?.iataCode ?? '—';
  const to = ticket.destination?.iataCode ?? '—';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#0b1c30;padding:36px} .brand{color:#2e1065;font-size:22px;font-weight:bold}
    .label{color:#625f6b;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:24px}
    .route{font-size:30px;font-weight:bold;margin:8px 0 20px}.card{border:1px solid #d8d5de;border-radius:16px;padding:22px}
    .row{margin:12px 0}.qr{width:210px;height:210px;margin:24px auto 8px;display:block}.code{text-align:center;color:#625f6b;font-size:12px}
  </style></head><body><div class="brand">AeroGestión UNS</div><div class="label">E-Ticket · Reserva ${escapeHtml(ticket.bookingCode)}</div>
    <div class="card"><div class="route">${escapeHtml(from)} → ${escapeHtml(to)}</div>
    <div class="row"><b>Vuelo</b>　${escapeHtml(ticket.flightCode)}</div>
    <div class="row"><b>Salida</b>　${escapeHtml(formatFlightDate(ticket.departureAt))}</div>
    <div class="row"><b>Asiento</b>　${escapeHtml(ticket.seat ?? 'Pendiente')}</div>
    <div class="row"><b>Reserva</b>　${escapeHtml(ticket.bookingCode)}</div>
    <img class="qr" src="data:image/png;base64,${qrBase64}" /><div class="code">Código e-ticket ${escapeHtml(ticket.ticketCode)}</div></div>
    <p>Guardado en el dispositivo. Este e-ticket se puede consultar sin conexión.</p></body></html>`;
}

export default function ETicketScreen() {
  // The route segment keeps its historical name for installed development builds;
  // the value now identifies either the e-ticket or an existing boarding pass.
  const { bookingCode, boardingPassCode: ticketCode } = useLocalSearchParams<{ bookingCode: string; boardingPassCode: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const userId = user?.id;
  // Keep the latest Clerk function without making the screen reload its ticket
  // every time Clerk returns a new function identity during a render.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const qrRef = useRef<QrSvgRef | null>(null);
  const pdfStartedFor = useRef<string | null>(null);
  const [ticket, setTicket] = useState<OfflineTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfSavedFor, setPdfSavedFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pdfVersion = ticket ? `${ticket.ticketCode}:${ticket.departureAt ?? ''}` : null;
  const pdfSaved = pdfVersion !== null && pdfSavedFor === pdfVersion;

  const loadTicket = useCallback(async () => {
    if (!isUserLoaded) return;
    if (!userId || !bookingCode || !ticketCode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    const offline = await getOfflineTicket(userId, bookingCode, ticketCode);
    if (offline) {
      setTicket(offline);
      setLoading(false);
    }

    if (isSignedIn) {
      try {
        const token = await getTokenRef.current();
        if (token) {
          const bookings = await getMyBookings(token);
          const allTickets: MyBookingTicket[] = [...bookings.upcoming, ...bookings.past]
            .flatMap((booking) => booking.tickets ?? []);
          await syncOfflineTickets(userId, allTickets);
          const current = allTickets.find((item) =>
            item.bookingCode === bookingCode && item.ticketCode === ticketCode);
          if (current) {
            const fresh = { ...current, ownerId: userId, savedAt: new Date().toISOString() };
            setTicket(fresh);
          } else {
            await removeOfflineTicket(userId, bookingCode, ticketCode);
            setTicket(null);
            setMessage('Este e-ticket ya no está disponible. Conectate a internet para consultar el estado de tu reserva.');
          }
        }
      } catch {
        if (!offline) setMessage('No se pudo consultar el pase. Conectate a internet y volvé a intentarlo.');
      }
    }
    setLoading(false);
  }, [bookingCode, isSignedIn, isUserLoaded, ticketCode, userId]);

  useEffect(() => {
    const timeout = setTimeout(() => { void loadTicket(); }, 0);
    return () => clearTimeout(timeout);
  }, [loadTicket]);

  const persistPdf = useCallback(async () => {
    if (!ticket || !qrRef.current) return;
    setSavingPdf(true);
    setMessage(null);
    try {
      const filename = ticketPdfFilename(ticket);
      const savedFile = new File(Paths.document, filename);
      if (savedFile.exists) {
        setPdfSavedFor(pdfVersion);
        return;
      }
      const qrBase64 = await new Promise<string>((resolve, reject) => {
        try { qrRef.current?.toDataURL(resolve); } catch (error) { reject(error); }
      });
      const { uri } = await Print.printToFileAsync({ html: ticketPdfHtml(ticket, qrBase64) });
      await new File(uri).copy(savedFile);
      setPdfSavedFor(pdfVersion);
      setMessage('El PDF quedó guardado en el espacio privado de la app.');
    } catch {
      setMessage('No se pudo guardar el PDF. El e-ticket y su QR siguen disponibles en esta pantalla.');
    } finally {
      setSavingPdf(false);
    }
  }, [pdfVersion, ticket]);

  const openPdf = async () => {
    if (!ticket) return;
    const savedFile = new File(Paths.document, ticketPdfFilename(ticket));
    if (!savedFile.exists) await persistPdf();
    if (savedFile.exists) await File.preview(savedFile, { mimeType: 'application/pdf', title: 'Mi E-Ticket' });
  };

  if (!isLoaded || loading) {
    return <Screen eyebrow="E-TICKET" title="Cargando tu pase" description="Estamos buscando la copia guardada en este dispositivo." compact headerTitle="Mi E-Ticket" headerBadge="✈ Modo Avión"><ActivityIndicator color={theme.colors.accent} /></Screen>;
  }

  if (!isSignedIn || !ticket) {
    return (
      <Screen eyebrow="E-TICKET" title="No encontramos un e-ticket guardado" description={message ?? 'Para consultar este e-ticket, iniciá sesión con la cuenta asociada a la reserva.'} compact headerTitle="Mi E-Ticket" headerBadge="✈ Modo Avión">
        {!isSignedIn && <ActionLink href="/login" title="Iniciar sesión" description="Accedé a tus viajes y pasajes." />}
        <ActionLink href="/(tabs)/tickets" title="Volver a pasajes" description="Consultá tus reservas." />
      </Screen>
    );
  }

  return (
    <Screen eyebrow="MI E-TICKET" title="Tu pase, siempre a mano." description="Este e-ticket y su código QR están guardados para consultarlos sin conexión." compact headerTitle="Mi E-Ticket" headerBadge="✈ Modo Avión">
      <View style={styles.ticketCard}>
        <Text style={styles.route}>{ticket.origin?.iataCode ?? '—'}  →  {ticket.destination?.iataCode ?? '—'}</Text>
        <Text style={styles.flight}>{ticket.flightCode} · {formatTicketDate(ticket.departureAt)}</Text>
        <View style={styles.qrWrap}>
        <QRCode value={ticket.ticketCode} size={168} getRef={(node) => {
            qrRef.current = node as QrSvgRef | null;
            if (node && pdfVersion && !pdfSaved && !savingPdf && pdfStartedFor.current !== pdfVersion) {
              pdfStartedFor.current = pdfVersion;
              setTimeout(() => { void persistPdf(); }, 0);
            }
          }} />
        </View>
        <Text style={styles.qrCaption}>Código e-ticket {ticket.ticketCode}</Text>
        <Text style={styles.seat}>Asiento {ticket.seat ?? 'Pendiente'}</Text>
        <Text style={styles.booking}>Reserva {ticket.bookingCode}</Text>
      </View>
      <View style={styles.savedBox}><Text style={styles.saved}>✓ Guardado en el dispositivo.{ '\n' }Disponible sin conexión.</Text></View>
      <Pressable disabled={savingPdf} onPress={() => void openPdf()} style={[styles.pdfButton, savingPdf && styles.disabled]}>
        {savingPdf ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pdfButtonText}>{pdfSaved ? 'Abrir e-ticket PDF' : 'Guardar / abrir e-ticket PDF'}</Text>}
      </Pressable>
      {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <ActionLink href="/(tabs)/tickets" title="Volver a mis pasajes" description="Regresá a tus reservas." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticketCard: { alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, padding: 12 },
  route: { color: theme.colors.brand, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  flight: { color: theme.colors.muted, fontSize: 12, marginTop: 5, textAlign: 'center' },
  qrWrap: { alignItems: 'center', marginVertical: 10 },
  qrCaption: { color: theme.colors.muted, fontSize: 10, marginTop: -4, textAlign: 'center' },
  seat: { color: theme.colors.brand, fontSize: 24, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  booking: { color: theme.colors.muted, fontSize: 12, marginTop: 2, textAlign: 'center' },
  savedBox: { backgroundColor: '#DCFCE7', borderColor: '#A7E3C3', borderRadius: 7, borderWidth: 1, marginTop: 12, paddingHorizontal: 13, paddingVertical: 10 },
  saved: { color: '#166534', fontSize: 12, lineHeight: 18 },
  pdfButton: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.radius.control, marginVertical: 14, minHeight: 48, justifyContent: 'center', padding: 13 },
  disabled: { opacity: 0.65 },
  pdfButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  message: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
});
