'use client';

import React, { useState, type FormEvent } from 'react';
import { bookingPublicLookupSchema } from '@/lib/validation';
import { formatArs, formatDayMonth, formatTime } from '@/lib/format';
import {
  bookingStatusPresentation,
  cabinClassLabel,
  flightRouteLabel,
  flightSchedule,
  passengerDocumentLabel,
  passengerName,
  passengerSeatAria,
  passengerSeatLabel,
  type BookingTone,
  type PublicBookingView,
} from '@/lib/public-booking-view';

/**
 * Consulta publica de una reserva (US-14A).
 *
 * Reutiliza el mismo validador que el endpoint (`bookingPublicLookupSchema`) y
 * la misma normalizacion de codigo/apellido, para que el cliente y el servidor
 * nunca discrepen. La autoridad sigue siendo el servidor: la validacion local
 * es solo para dar feedback inmediato antes de la peticion.
 *
 * Toda la logica de presentacion vive en `public-booking-view.ts`; aca solo se
 * compone el markup (accesible y responsive).
 */

/** Mensajes exactos exigidos por la historia. */
const EMPTY_MESSAGE = 'Por favor, complete ambos campos para realizar la búsqueda.';
const NOT_FOUND_MESSAGE =
  'No encontramos ninguna reserva que coincida con el código y apellido ingresados. Por favor verifique sus datos.';
const UNAVAILABLE_MESSAGE =
  'No pudimos conectar con el servicio de consultas. Intente nuevamente en unos instantes.';
const PASAJE_DOWNLOAD_FAILED_MESSAGE =
  'No pudimos generar el pasaje en PDF. Intente nuevamente en unos instantes.';
const FACTURA_DOWNLOAD_FAILED_MESSAGE =
  'No pudimos generar la factura en PDF. Intente nuevamente en unos instantes.';

type ApiErrorBody = {
  ok: false;
  error: { code?: string; message: string; details?: Array<{ campo: string; mensaje: string }> };
};
type ApiOkBody = { ok: true; data: PublicBookingView };
type ApiBody = ApiOkBody | ApiErrorBody | null;

type FieldErrors = { code?: string; lastName?: string };

const TONE_CLASS: Record<BookingTone, string> = {
  ok: 'bg-[#DCF5EA] text-[#0F9D6B]',
  warn: 'bg-[#FFF4E0] text-[#B45309]',
  bad: 'bg-[#FFE3EA] text-[#E11D48]',
  info: 'bg-[#E6ECFF] text-[#2D0F63]',
};

/** Logo de marca (mismo glifo que el resto de la app). */
function Logo() {
  return (
    <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0 shadow-sm">
      <svg className="w-6 h-6 text-secondary" fill="none" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M9 20.5L25.5 12L21 21.5L29 27L24 28L18 24.5L14 28.5L13.5 24L9 20.5Z" fill="currentColor" />
        <circle cx="28.5" cy="13.5" fill="#f43f5e" r="2.8" />
      </svg>
    </div>
  );
}

export default function ConsultaClient() {
  const [code, setCode] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingView | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Evita requests duplicadas si se envia de nuevo antes de que el estado
    // `loading` vuelva a renderizar (doble Enter o clic rapido).
    if (loading) return;
    // El detalle anterior se descarta al iniciar una consulta nueva: nunca se
    // muestra la reserva previa mientras se resuelve (o falla) la siguiente.
    setResult(null);
    setAlert(null);
    setFieldErrors({});

    const trimmedCode = code.trim();
    const trimmedLastName = lastName.trim();

    // 1) Ambos vacios: mensaje exacto de la historia (WF-14A-E1).
    if (!trimmedCode && !trimmedLastName) {
      setAlert(EMPTY_MESSAGE);
      return;
    }

    // 2) Validacion local reutilizando el mismo schema del endpoint.
    const parsed = bookingPublicLookupSchema.safeParse({
      code: trimmedCode,
      lastName: trimmedLastName,
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'code' && !errors.code) errors.code = issue.message;
        if (key === 'lastName' && !errors.lastName) errors.lastName = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/reservas/consulta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: trimmedCode, lastName: trimmedLastName }),
      });

      const body = (await response.json().catch(() => null)) as ApiBody;

      if (body && body.ok === true) {
        setResult(body.data);
        return;
      }

      if (body && body.ok === false) {
        const { code: errorCode, message, details } = body.error;

        // Combinacion sin coincidencias: mensaje exacto (WF-14A-E2).
        if (response.status === 404 || errorCode === 'NOT_FOUND') {
          setAlert(NOT_FOUND_MESSAGE);
          return;
        }

        // Campos vacios reportados por el servidor: mismo mensaje exacto.
        if (response.status === 400 && message === EMPTY_MESSAGE) {
          setAlert(EMPTY_MESSAGE);
          return;
        }

        // Errores de schema del servidor: se mapean a su campo.
        if (response.status === 422 && details?.length) {
          const errors: FieldErrors = {};
          for (const detail of details) {
            if (detail.campo === 'code' && !errors.code) errors.code = detail.mensaje;
            if (detail.campo === 'lastName' && !errors.lastName) errors.lastName = detail.mensaje;
          }
          setFieldErrors(errors);
          if (!errors.code && !errors.lastName) setAlert(message);
          return;
        }

        setAlert(message || UNAVAILABLE_MESSAGE);
        return;
      }

      setAlert(UNAVAILABLE_MESSAGE);
    } catch {
      // Falla de red o endpoint no disponible: no se simula ningun resultado.
      setAlert(UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-5rem)] flex flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-3xl flex flex-col gap-space-md">
        <div className="flex items-center gap-space-sm">
          <Logo />
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-sm text-headline-sm text-primary font-extrabold tracking-tight">
                AeroGestión
              </span>
              <span className="font-headline-sm text-headline-sm text-secondary font-extrabold tracking-wide">
                UNS
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Consulta pública de reservas
            </span>
          </div>
        </div>

        <section
          aria-labelledby="consulta-title"
          className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-md p-4 sm:p-6"
        >
          <h1
            id="consulta-title"
            className="font-headline-md text-headline-md text-primary-container font-bold"
          >
            Consultá tu reserva
          </h1>

          <form className="mt-4 flex flex-col gap-4" noValidate onSubmit={onSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-4 items-start">
              <div className="flex flex-col gap-1.5">
                <label
                  className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
                  htmlFor="booking-code"
                >
                  Código de reserva (6 caracteres)
                </label>
                <input
                  aria-describedby={fieldErrors.code ? 'booking-code-error' : 'booking-code-help'}
                  aria-invalid={fieldErrors.code ? true : undefined}
                  autoComplete="off"
                  className={
                    fieldErrors.code
                      ? 'w-full h-11 px-3 rounded-lg bg-surface-container-low border border-secondary text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40'
                      : 'w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'
                  }
                  id="booking-code"
                  inputMode="text"
                  maxLength={9}
                  name="code"
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  spellCheck={false}
                  type="text"
                  value={code}
                />
                {fieldErrors.code ? (
                  <p
                    className="font-label-sm text-label-sm text-secondary font-bold"
                    id="booking-code-error"
                    role="alert"
                  >
                    {fieldErrors.code}
                  </p>
                ) : (
                  <p className="sr-only" id="booking-code-help">
                    Ingresá los seis caracteres del código, sin el prefijo AG-.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
                  htmlFor="passenger-last-name"
                >
                  Apellido del pasajero
                </label>
                <input
                  aria-describedby={
                    fieldErrors.lastName ? 'passenger-last-name-error' : 'passenger-last-name-help'
                  }
                  aria-invalid={fieldErrors.lastName ? true : undefined}
                  autoComplete="off"
                  className={
                    fieldErrors.lastName
                      ? 'w-full h-11 px-3 rounded-lg bg-surface-container-low border border-secondary text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40'
                      : 'w-full h-11 px-3 rounded-lg bg-surface-container-low border border-outline-variant text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'
                  }
                  id="passenger-last-name"
                  maxLength={80}
                  name="lastName"
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Apellido"
                  spellCheck={false}
                  type="text"
                  value={lastName}
                />
                {fieldErrors.lastName ? (
                  <p
                    className="font-label-sm text-label-sm text-secondary font-bold"
                    id="passenger-last-name-error"
                    role="alert"
                  >
                    {fieldErrors.lastName}
                  </p>
                ) : (
                  <p className="sr-only" id="passenger-last-name-help">
                    Al menos dos letras; se admiten tildes, ñ, espacios y guiones.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <button
                  className="h-11 px-6 rounded-lg bg-secondary text-on-secondary font-label-lg text-label-lg font-bold hover:bg-secondary-container transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  disabled={loading}
                  type="submit"
                >
                  {loading && (
                    <span aria-hidden="true" className="material-symbols-outlined animate-spin text-base">
                      progress_activity
                    </span>
                  )}
                  {loading ? 'Buscando…' : 'Buscar Reserva'}
                </button>
              </div>
            </div>

            <p className="text-outline font-body-sm text-body-sm">
              Sin iniciar sesión. El código no distingue mayúsculas de minúsculas.
            </p>
          </form>

          {/* Región viva: anuncia carga y errores a lectores de pantalla. */}
          <div aria-live="assertive" role="status">
            {loading && <p className="sr-only">Buscando su reserva, por favor espere.</p>}
            {alert && (
              <p
                className="mt-4 rounded-lg bg-error-container border border-error/30 text-on-error-container font-body-sm text-body-sm px-4 py-3"
                role="alert"
              >
                {alert}
              </p>
            )}
          </div>
        </section>

        {result && <ReservaDetalle booking={result} onReprogrammed={setResult} />}
      </div>
    </main>
  );
}

/**
 * Extrae un nombre de archivo seguro del header Content-Disposition.
 * Solo acepta nombres simples de PDF (sin barras, espacios ni puntos dobles);
 * cualquier otro valor descarta el header para usar el nombre de respaldo.
 */
export function pdfFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /;\s*filename="([^"]*)"/i.exec(header);
  const name = match?.[1]?.trim() ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(name)) return null;
  return name;
}

/**
 * Traduce la respuesta del endpoint de pasaje a un mensaje para la persona.
 * Nunca propaga detalles internos: solo el mensaje exacto de no encontrado,
 * el mensaje ya orientado a la persona del 409 (cancelada) y, en el resto
 * de los casos, un mensaje generico.
 */
export function describePasajeDownloadError(status: number, serverMessage: string | null): string {
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 409 && serverMessage) return serverMessage;
  return PASAJE_DOWNLOAD_FAILED_MESSAGE;
}

/**
 * Traduce la respuesta del endpoint de factura a un mensaje para la persona.
 * Mismas reglas que el pasaje: 404 = no encontrado; 409 = el servidor ya
 * explica con un mensaje honesto por que la factura no esta disponible
 * (pago pendiente o inexistente); el resto, generico sin internals.
 */
export function describeFacturaDownloadError(status: number, serverMessage: string | null): string {
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 409 && serverMessage) return serverMessage;
  return FACTURA_DOWNLOAD_FAILED_MESSAGE;
}

type DocumentKind = 'pasaje' | 'factura';

const DOCUMENT_CONFIG: Record<
  DocumentKind,
  { endpoint: string; failedMessage: string; describeError: typeof describePasajeDownloadError }
> = {
  pasaje: {
    endpoint: '/api/v1/reservas/consulta/pasaje',
    failedMessage: PASAJE_DOWNLOAD_FAILED_MESSAGE,
    describeError: describePasajeDownloadError,
  },
  factura: {
    endpoint: '/api/v1/reservas/consulta/factura',
    failedMessage: FACTURA_DOWNLOAD_FAILED_MESSAGE,
    describeError: describeFacturaDownloadError,
  },
};

/**
 * Descarga un documento PDF desde su endpoint publico y dispara la descarga
 * del navegador. Cualquier fallo (red, estado no ok, content-type raro) se
 * traduce a un mensaje generico sin exponer internals. Devuelve `true` si la
 * descarga se inicio correctamente. Logica compartida por pasaje y factura.
 */
async function downloadDocumentPdf(
  kind: DocumentKind,
  bookingCode: string,
  lastName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = DOCUMENT_CONFIG[kind];
  let objectUrl: string | null = null;
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: bookingCode, lastName }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      return {
        ok: false,
        message: config.describeError(response.status, body?.error?.message ?? null),
      };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/pdf')) {
      return { ok: false, message: config.failedMessage };
    }

    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download =
      pdfFilenameFromDisposition(response.headers.get('content-disposition')) ??
      `${kind}-${bookingCode}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true };
  } catch {
    // Falla de red: no se exponen detalles internos.
    return { ok: false, message: config.failedMessage };
  } finally {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Detalle de la reserva encontrada. Solo muestra los datos que devuelve el
 * endpoint. Se exporta para poder renderizarlo en las pruebas de la vista.
 *
 * Ambos botones (pasaje y factura) reutilizan el mismo par codigo + apellido
 * que autorizo la consulta (el endpoint vuelve a validarlos). La factura solo
 * se genera cuando existe un pago aprobado real; si no, el servidor responde
 * 409 y se muestra su mensaje honesto.
 */
export function ReservaDetalle({
  booking,
  onReprogrammed = () => undefined,
}: {
  booking: PublicBookingView;
  onReprogrammed: (booking: PublicBookingView) => void;
}) {
  const [downloading, setDownloading] = useState<DocumentKind | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [rebookingOpen, setRebookingOpen] = useState(false);
  const [rebookingDate, setRebookingDate] = useState(tomorrowInArgentina());
  const [rebookingFlights, setRebookingFlights] = useState<RebookingFlight[]>([]);
  const [selectedRebooking, setSelectedRebooking] = useState<string | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [rebookingLoading, setRebookingLoading] = useState(false);
  const [rebookingError, setRebookingError] = useState<string | null>(null);

  // Cualquier apellido de la reserva autoriza la descarga: el endpoint exige
  // que el apellido pertenezca a un pasajero de esa misma reserva.
  const lookupLastName =
    booking.passengers.find((passenger) => passenger.lastName?.trim())?.lastName?.trim() ?? '';

  const status = bookingStatusPresentation(booking.status);
  const cabin = cabinClassLabel(booking.cabinClass || booking.flights[0]?.fare?.cabinClass);
  const passengerCount = booking.passengersCount ?? booking.passengers.length;
  const currentFlight = booking.flights[0];
  const preservedSeat = Boolean(currentFlight?.fare?.seatSelection);
  const canRebook = Boolean(
    currentFlight &&
    booking.flights.length === 1 &&
    ['CONFIRMED', 'PAID'].includes(booking.status) &&
    currentFlight.status !== 'CANCELLED' &&
    currentFlight.status !== 'DEPARTED' &&
    currentFlight.status !== 'ARRIVED' &&
    currentFlight.departureAt &&
    new Date(currentFlight.departureAt) > new Date() &&
    booking.passengers.every((passenger) => passenger.checkInStatus !== 'DONE'),
  );

  async function searchRebookingFlights() {
    if (!currentFlight || !lookupLastName || rebookingLoading) return;
    setRebookingLoading(true);
    setRebookingError(null);
    setRebookingFlights([]);
    setSelectedRebooking(null);
    setSelectedSeatIds([]);
    try {
      const response = await fetch('/api/v1/reservas/consulta/reprogramar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          code: booking.bookingCode,
          lastName: lookupLastName,
          flightCode: currentFlight.flightCode,
          date: rebookingDate,
        }),
      });
      const body = (await response.json().catch(() => null)) as RebookingSearchResponse | RebookingErrorResponse | null;
      if (!response.ok || !body || body.ok !== true) {
        setRebookingError(body?.ok === false ? body.error.message : 'No se pudo buscar vuelos disponibles. Intente nuevamente.');
        return;
      }
      setRebookingFlights(body.data.data);
      if (body.data.data.length === 0) {
        setRebookingError('No hay vuelos disponibles para esa fecha en la misma clase.');
      }
    } catch {
      setRebookingError('No se pudo conectar con el servicio de reprogramación. Intente nuevamente.');
    } finally {
      setRebookingLoading(false);
    }
  }

  async function confirmRebooking() {
    if (!currentFlight || !selectedRebooking || !lookupLastName || rebookingLoading) return;
    const [replacementFlightId, replacementFareId] = selectedRebooking.split(':');
    if (!replacementFlightId || !replacementFareId) return;

    setRebookingLoading(true);
    setRebookingError(null);
    try {
      const response = await fetch('/api/v1/reservas/consulta/reprogramar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          code: booking.bookingCode,
          lastName: lookupLastName,
          flightCode: currentFlight.flightCode,
          replacementFlightId,
          replacementFareId,
          seatIds: selectedSeatIds,
        }),
      });
      const body = (await response.json().catch(() => null)) as RebookingConfirmResponse | RebookingErrorResponse | null;
      if (!response.ok || !body || body.ok !== true) {
        setSelectedRebooking(null);
        setSelectedSeatIds([]);
        setRebookingFlights((flights) => flights
          .map((flight) => ({
            ...flight,
            fares: flight.fares.filter((fare) => `${flight.id}:${fare.id}` !== selectedRebooking),
          }))
          .filter((flight) => flight.fares.length > 0));
        setRebookingError(body?.ok === false ? body.error.message : 'No se pudo confirmar el cambio. Busque otra alternativa.');
        return;
      }

      onReprogrammed(body.data.booking);
      setRebookingOpen(false);
      setRebookingFlights([]);
      setSelectedSeatIds([]);
      const pdf = await downloadDocumentPdf('pasaje', booking.bookingCode, lookupLastName);
      if (!pdf.ok) setDownloadError(pdf.message);
    } catch {
      setRebookingError('No se pudo conectar con el servicio de reprogramación. Intente nuevamente.');
    } finally {
      setRebookingLoading(false);
    }
  }

  async function onDownload(kind: DocumentKind) {
    // Evita descargas multiples mientras una sigue en curso.
    if (downloading) return;
    setDownloadError(null);
    setDownloading(kind);
    try {
      const result = await downloadDocumentPdf(kind, booking.bookingCode, lookupLastName);
      if (!result.ok) setDownloadError(result.message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section
      aria-labelledby="reserva-title"
      className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-md p-4 sm:p-6 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="font-headline-md text-headline-md text-primary-container font-bold"
          id="reserva-title"
        >
          Reserva {booking.bookingCode}
        </h2>
        <span
          className={`inline-block rounded-full px-3 py-1 font-label-sm text-label-sm font-bold ${TONE_CLASS[status.tone]}`}
        >
          {status.label}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {booking.flights.map((flight, index) => {
          const schedule = flightSchedule(flight.departureAt, flight.arrivalAt);
          return (
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-surface-container-low rounded-lg p-3"
              key={`${flight.flightCode}-${index}`}
            >
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Vuelo
                </span>
                <p className="font-body-md text-body-md text-on-surface font-bold">
                  {flightRouteLabel(flight)}
                  {flight.isReturn && (
                    <span className="ml-2 font-label-sm text-label-sm text-primary">Regreso</span>
                  )}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {[flight.fare?.name, cabinClassLabel(flight.fare?.cabinClass)]
                    .filter((value) => value && value !== '—')
                    .join(' · ') || 'Tarifa a confirmar'}
                </p>
              </div>
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Salida
                </span>
                <p className="font-body-md text-body-md text-on-surface font-bold">
                  {schedule.date} · {schedule.time}
                </p>
                {flight.status && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Estado del vuelo: {flight.status}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border border-outline-variant/60 rounded-lg overflow-x-auto">
        <table className="w-full border-collapse font-body-sm text-body-sm">
          <caption className="sr-only">Pasajeros y asientos de la reserva</caption>
          <thead>
            <tr className="bg-surface-container-low text-outline">
              <th className="text-left font-label-sm text-label-sm uppercase tracking-wider px-3 py-2">
                Pasajero
              </th>
              <th className="text-left font-label-sm text-label-sm uppercase tracking-wider px-3 py-2">
                Documento
              </th>
              <th className="text-left font-label-sm text-label-sm uppercase tracking-wider px-3 py-2">
                Asiento
              </th>
              <th className="text-left font-label-sm text-label-sm uppercase tracking-wider px-3 py-2">
                Clase
              </th>
            </tr>
          </thead>
          <tbody>
            {booking.passengers.map((passenger, index) => {
              const document = passengerDocumentLabel(
                passenger.documentType,
                passenger.documentNumber,
              );
              return (
                <tr
                  className="border-t border-outline-variant/40 text-on-surface"
                  key={`${passenger.lastName}-${index}`}
                >
                  <td className="px-3 py-2 font-semibold">
                    {passengerName(passenger.firstName, passenger.lastName) || '—'}
                  </td>
                  <td className="px-3 py-2 font-mono">{document ?? '—'}</td>
                  <td className="px-3 py-2" aria-label={passengerSeatAria(passenger.seatNumber)}>
                    {passengerSeatLabel(passenger.seatNumber)}
                  </td>
                  <td className="px-3 py-2">{cabin}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {passengerCount} {passengerCount === 1 ? 'pasajero' : 'pasajeros'}
        </span>
        <span className="font-label-lg text-label-lg text-primary-container font-bold">
          Total: {formatArs(booking.totalAmount)} {booking.currency}
        </span>
      </div>

      {/*
        Acciones de documento: pasaje y factura se descargan desde sus
        endpoints publicos reutilizando el codigo y apellido de la consulta.
        La factura solo se genera con un pago aprobado real; nunca se simula
        una descarga ni una emision inexistente.
      */}
      <div className={`grid grid-cols-1 gap-3 border-t border-outline-variant/60 pt-4 ${canRebook ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {canRebook && (
          <button
            className="h-11 w-full px-4 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={downloading !== null || rebookingLoading}
            onClick={() => {
              setRebookingError(null);
              setRebookingOpen(true);
            }}
            type="button"
          >
            <span aria-hidden="true" className="material-symbols-outlined">event_repeat</span>
            Reprogramar vuelo
          </button>
        )}
        <button
          aria-describedby="pdf-pasaje-note"
          className="h-11 px-4 rounded-lg bg-secondary text-on-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={downloading !== null || lookupLastName === ''}
          onClick={() => onDownload('pasaje')}
          type="button"
        >
          {downloading === 'pasaje' && (
            <span aria-hidden="true" className="material-symbols-outlined animate-spin text-base">
              progress_activity
            </span>
          )}
          <span aria-hidden="true" className="material-symbols-outlined text-base">
            download
          </span>
          {downloading === 'pasaje' ? 'Generando PDF…' : 'Descargar Pasaje PDF'}
        </button>
        <button
          aria-describedby="pdf-factura-note"
          className="h-11 px-4 rounded-lg bg-surface-container-low text-primary-container border border-outline-variant font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={downloading !== null || lookupLastName === ''}
          onClick={() => onDownload('factura')}
          type="button"
        >
          {downloading === 'factura' && (
            <span aria-hidden="true" className="material-symbols-outlined animate-spin text-base">
              progress_activity
            </span>
          )}
          <span aria-hidden="true" className="material-symbols-outlined text-base">
            download
          </span>
          {downloading === 'factura' ? 'Generando PDF…' : 'Descargar Factura PDF'}
        </button>
      </div>
      {/* Región viva de las descargas: errores para lectores de pantalla. */}
      <div aria-live="assertive" role="status">
        {downloading && (
          <p className="sr-only">
            {downloading === 'pasaje'
              ? 'Generando el pasaje en PDF, por favor espere.'
              : 'Generando la factura en PDF, por favor espere.'}
          </p>
        )}
        {downloadError && (
          <p
            className="mt-2 rounded-lg bg-error-container border border-error/30 text-on-error-container font-body-sm text-body-sm px-4 py-3"
            role="alert"
          >
            {downloadError}
          </p>
        )}
      </div>
      <p className="sr-only" id="pdf-pasaje-note">
        La descarga del pasaje en PDF usa el código y apellido de la consulta.
      </p>
      <p className="sr-only" id="pdf-factura-note">
        La descarga de la factura en PDF usa el código y apellido de la consulta; requiere un pago
        aprobado.
      </p>
      {rebookingOpen && currentFlight && (
        <RebookingModal
          cabin={cabin}
          date={rebookingDate}
          error={rebookingError}
          flights={rebookingFlights}
          loading={rebookingLoading}
          onCancel={() => setRebookingOpen(false)}
          onConfirm={confirmRebooking}
          onDateChange={(next) => {
            setRebookingDate(next);
            setRebookingFlights([]);
            setSelectedRebooking(null);
            setSelectedSeatIds([]);
            setRebookingError(null);
          }}
          onSearch={searchRebookingFlights}
          onSelect={(key) => {
            const [flightId] = key.split(':');
            const candidate = rebookingFlights.find((flight) => flight.id === flightId);
            setSelectedRebooking(key);
            if (!preservedSeat || !candidate) {
              setSelectedSeatIds([]);
              return;
            }
            const seatsByLabel = new Map(candidate.availableSeats.map((seat) => [seat.label, seat.id]));
            const used = new Set<string>();
            const defaults = booking.passengers.map((passenger) => {
              const matching = passenger.seatNumber ? seatsByLabel.get(passenger.seatNumber) : undefined;
              const seatId = matching && !used.has(matching)
                ? matching
                : candidate.availableSeats.find((seat) => !used.has(seat.id))?.id;
              if (seatId) used.add(seatId);
              return seatId ?? '';
            });
            setSelectedSeatIds(defaults);
          }}
          onSeatChange={(index, seatId) => setSelectedSeatIds((previous) => previous.map((value, i) => i === index ? seatId : value))}
          passengerCount={passengerCount}
          passengers={booking.passengers}
          preservedSeat={preservedSeat}
          selected={selectedRebooking}
          selectedSeatIds={selectedSeatIds}
          route={`${currentFlight.origin?.iataCode ?? '—'} → ${currentFlight.destination?.iataCode ?? '—'}`}
        />
      )}
    </section>
  );
}

type RebookingFare = { id: string; name: string; cabinClass: string; price: number; seatsAvailable: number };
type RebookingFlight = {
  id: string;
  code: string;
  departureAt: string;
  arrivalAt: string;
  origin: { iataCode: string; city: string };
  destination: { iataCode: string; city: string };
  fares: RebookingFare[];
  availableSeats: Array<{ id: string; label: string }>;
};
type RebookingErrorResponse = { ok: false; error: { message: string } };
type RebookingSearchResponse = { ok: true; data: { data: RebookingFlight[] } };
type RebookingConfirmResponse = { ok: true; data: { booking: PublicBookingView } };

function todayInArgentina() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function tomorrowInArgentina() {
  const tomorrow = new Date(`${todayInArgentina()}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function RebookingModal({
  cabin, date, error, flights, loading, onCancel, onConfirm, onDateChange, onSearch,
  onSelect, onSeatChange, passengers, passengerCount, preservedSeat, selected, selectedSeatIds, route,
}: {
  cabin: string;
  date: string;
  error: string | null;
  flights: RebookingFlight[];
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDateChange: (date: string) => void;
  onSearch: () => void;
  onSelect: (value: string) => void;
  onSeatChange: (index: number, seatId: string) => void;
  passengers: PublicBookingView['passengers'];
  passengerCount: number;
  preservedSeat: boolean;
  selected: string | null;
  selectedSeatIds: string[];
  route: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1038]/60 p-3 sm:p-6" role="presentation">
      <section
        aria-labelledby="rebooking-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-surface-container-lowest p-4 shadow-2xl sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-md text-headline-md text-primary-container font-bold" id="rebooking-title">
              Reprogramar vuelo
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Vuelos futuros para la misma ruta: {route}.
            </p>
          </div>
          <button aria-label="Cerrar" className="rounded-md p-2 text-outline hover:bg-surface-container-low" onClick={onCancel} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface">
          Tu clase: <strong>{cabin}</strong>. Se muestran vuelos con al menos {passengerCount} lugares libres en esa clase.
        </div>
        {preservedSeat && (
          <div className="mt-3 rounded-lg border border-outline-variant bg-secondary-container/10 p-3 font-body-sm text-body-sm text-on-surface">
            Ya abonaste la elección de asiento. Seleccioná un asiento libre para cada pasajero sin volver a pagar el adicional.
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="font-label-sm text-label-sm font-bold text-outline" htmlFor="rebooking-date">
            Nueva fecha
            <input
              className="mt-1 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-on-surface"
              id="rebooking-date"
              min={tomorrowInArgentina()}
              onChange={(event) => onDateChange(event.target.value)}
              type="date"
              value={date}
            />
          </label>
          <button className="h-11 rounded-lg border border-outline-variant bg-surface-container-low px-5 font-label-lg text-label-lg font-bold text-primary-container disabled:opacity-60" disabled={loading || date <= todayInArgentina()} onClick={onSearch} type="button">
            {loading ? 'Buscando…' : 'Buscar vuelos'}
          </button>
        </div>

        {flights.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-outline-variant">
            <table className="w-full min-w-[620px] border-collapse text-left font-body-sm text-body-sm">
              <thead className="bg-surface-container-low text-outline">
                <tr>
                  <th className="px-3 py-2">Elegir</th>
                  <th className="px-3 py-2">Vuelo</th>
                  <th className="px-3 py-2">Salida</th>
                  <th className="px-3 py-2">Llegada</th>
                  <th className="px-3 py-2">Tarifa {cabin}</th>
                  <th className="px-3 py-2">Lugares</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((flight) => flight.fares.map((fare) => {
                  const key = `${flight.id}:${fare.id}`;
                  const isSelected = selected === key;
                  return (
                    <tr className={isSelected ? 'border-t border-outline-variant bg-secondary-container/20' : 'border-t border-outline-variant'} key={key}>
                      <td className="px-3 py-3">
                        <input aria-label={`Elegir vuelo ${flight.code}`} checked={isSelected} name="replacement-flight" onChange={() => onSelect(key)} type="radio" />
                      </td>
                      <td className="px-3 py-3 font-bold text-primary-container">{flight.code}</td>
                      <td className="px-3 py-3">{formatDayMonth(flight.departureAt)} · {formatTime(flight.departureAt)}</td>
                      <td className="px-3 py-3">{formatTime(flight.arrivalAt)}</td>
                      <td className="px-3 py-3">{fare.name}</td>
                      <td className="px-3 py-3">{fare.seatsAvailable} libres</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}

        {preservedSeat && selected && (() => {
          const selectedFlight = flights.find((flight) => flight.id === selected.split(':')[0]);
          if (!selectedFlight) return null;
          return (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {passengers.map((passenger, index) => (
                <label className="font-label-sm text-label-sm font-bold text-outline" htmlFor={`replacement-seat-${index}`} key={`${passenger.lastName}-${index}`}>
                  Asiento para {passengerName(passenger.firstName, passenger.lastName) || `Pasajero ${index + 1}`}
                  <select
                    className="mt-1 block h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-on-surface"
                    id={`replacement-seat-${index}`}
                    onChange={(event) => onSeatChange(index, event.target.value)}
                    value={selectedSeatIds[index] ?? ''}
                  >
                    <option value="" disabled>Seleccione un asiento</option>
                    {selectedFlight.availableSeats.map((seat) => (
                      <option
                        disabled={selectedSeatIds.some((chosen, chosenIndex) => chosen === seat.id && chosenIndex !== index)}
                        key={seat.id}
                        value={seat.id}
                      >
                        {seat.label}{seat.label === passenger.seatNumber ? ' · asiento actual' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          );
        })()}

        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
          El valor ya abonado se conserva. Al confirmar se reemplaza el tramo y se reemite el pasaje actualizado.
        </p>
        {error && <p className="mt-3 rounded-lg border border-secondary/30 bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container" role="alert">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="h-11 rounded-lg border border-outline-variant px-5 font-label-lg text-label-lg font-bold text-outline" disabled={loading} onClick={onCancel} type="button">Cancelar</button>
          <button className="h-11 rounded-lg bg-secondary px-5 font-label-lg text-label-lg font-bold text-on-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={loading || !selected || (preservedSeat && selectedSeatIds.filter(Boolean).length !== passengerCount)} onClick={onConfirm} type="button">
            {loading ? 'Confirmando…' : 'Confirmar cambio de vuelo'}
          </button>
        </div>
      </section>
    </div>
  );
}
