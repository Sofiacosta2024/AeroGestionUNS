import type {
  FlightSearchResponse,
  FlightSeatMap,
  MobileFlight,
  MobilePaymentResult,
  MobileNotificationsResponse,
  MobileReservationResult,
  MyBookingsResponse,
} from './types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error?: { code?: string; message?: string } };

export class ApiClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function getJson<T>(path: string, token?: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiClientError('Falta configurar EXPO_PUBLIC_API_URL en aerogestion-mobile/.env.local');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload || !payload.ok) {
    const message = payload && 'error' in payload
      ? payload.error?.message
      : undefined;
    throw new ApiClientError(message ?? `Error al consultar el servidor (${response.status})`, response.status);
  }

  return payload.data;
}

async function sendJson<T>(method: 'POST' | 'DELETE', path: string, body: unknown, token: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiClientError('Falta configurar EXPO_PUBLIC_API_URL en aerogestion-mobile/.env.local');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload || !payload.ok) {
    const message = payload && 'error' in payload ? payload.error?.message : undefined;
    throw new ApiClientError(message ?? `Error al consultar el servidor (${response.status})`, response.status);
  }
  return payload.data;
}

export type PushPlatform = 'android' | 'ios';

export function registerPushToken(token: string, pushToken: string, platform: PushPlatform) {
  return sendJson<{ registered: boolean }>('POST', '/api/v1/mobile/push-token', { pushToken, platform }, token);
}

export function unregisterPushToken(token: string, pushToken: string) {
  return sendJson<{ registered: boolean }>('DELETE', '/api/v1/mobile/push-token', { pushToken }, token);
}

export type FlightSearchFilters = {
  origin?: string;
  destination?: string;
  date?: string;
  passengers?: number;
};

export function searchAvailableFlights(filters: FlightSearchFilters = {}) {
  const query = new URLSearchParams({
    available: 'true',
    passengers: String(filters.passengers ?? 1),
    pageSize: '20',
    sort: 'departure',
    order: 'asc',
  });

  for (const key of ['origin', 'destination', 'date'] as const) {
    const value = filters[key]?.trim();
    if (value) query.set(key, key === 'date' ? value : value.toUpperCase());
  }

  return getJson<FlightSearchResponse>(`/api/v1/mobile/vuelos?${query.toString()}`);
}

export function getFlight(flightId: string) {
  return getJson<MobileFlight>(`/api/flights/${encodeURIComponent(flightId)}`);
}

export function getFlightSeats(flightId: string, fareId: string) {
  return getJson<FlightSeatMap>(`/api/flights/${encodeURIComponent(flightId)}/seats?${new URLSearchParams({ fareId })}`);
}

export function createMobileReservation(
  token: string,
  input: {
    flightId: string;
    fareId: string;
    seatIds: string[];
    quotedTotal: number;
    seatMode: 'MANUAL';
    passengers: {
      firstName: string;
      lastName: string;
      documentType: 'DNI' | 'PASAPORTE' | 'CEDULA' | 'OTRO';
      documentNumber: string;
    }[];
  },
) {
  return sendJson<MobileReservationResult>('POST', '/api/v1/mobile/reservas', input, token);
}

export function payMobileReservation(
  token: string,
  input: {
    bookingCode: string;
    cardNumber: string;
    cardholder: string;
    expiry: string;
    cvv: string;
    contactEmail: string;
    installments: 1 | 3 | 6;
  },
) {
  return sendJson<MobilePaymentResult>('POST', '/api/v1/mobile/pago', input, token);
}

export function getMyBookings(token: string) {
  return getJson<MyBookingsResponse>('/api/v1/pasajeros/mis-reservas', token);
}

export function getMobileNotifications(token: string) {
  return getJson<MobileNotificationsResponse>('/api/v1/mobile/notifications', token);
}
