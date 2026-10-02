import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number) => trimmed(max).min(1, 'Este campo es obligatorio');

export const iataCode = z
  .string()
  .trim()
  .length(3, 'El codigo IATA debe tener 3 letras')
  .regex(/^[A-Z]{3}$/, 'El codigo IATA debe estar en mayusculas (ej. BHI)');

export const documentTypeEnum = z.enum(['DNI', 'PASAPORTE', 'CEDULA', 'OTRO']);
export const cabinClassEnum = z.enum(['ECONOMY', 'PREMIUM', 'BUSINESS', 'FIRST']);
export const demandLevelEnum = z.enum(['LOW', 'NORMAL', 'HIGH']);
export const userRoleEnum = z.enum(['PASAJERO', 'MOSTRADOR', 'ADMIN']);
export const flightStatusEnum = z.enum([
  'SCHEDULED',
  'BOARDING',
  'DEPARTED',
  'ARRIVED',
  'CANCELLED',
  'DELAYED',
]);
export const bookingStatusEnum = z.enum([
  'PENDING',
  'CONFIRMED',
  'PAID',
  'BOARDED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);

const money = z.coerce.number().nonnegative('No puede ser negativo').max(99_999_999);
const dateIso = z.coerce.date();

/** Query params comun: paginacion. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Ingrese su correo o legajo').max(160),
  password: z.string().min(1, 'Ingrese su contrasena').max(200),
  /** Perfil elegido en la UI; debe coincidir con el rol real del usuario. */
  role: userRoleEnum.optional(),
  remember: z.coerce.boolean().default(false),
});

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Correo invalido').max(160),
    password: z
      .string()
      .min(8, 'La contrasena debe tener al menos 8 caracteres')
      .max(200)
      .regex(/[A-Za-z]/, 'Debe incluir al menos una letra')
      .regex(/[0-9]/, 'Debe incluir al menos un numero'),
    firstName: required(80),
    lastName: required(80),
    phone: trimmed(32).optional().or(z.literal('')),
    documentType: documentTypeEnum.default('DNI'),
    documentNumber: required(32),
    birthDate: dateIso.optional(),
  });

export const userBase = z.object({
  email: z.string().trim().toLowerCase().email('Correo invalido').max(160).optional(),
  password: z.string().min(8).max(200).optional(),
  role: userRoleEnum.optional(),
  legajo: trimmed(32).optional().nullable(),
  firstName: trimmed(80).optional(),
  lastName: trimmed(80).optional(),
  phone: trimmed(32).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export const updateUserSchema = userBase.refine((d) => Object.keys(d).length > 0, {
  message: 'No hay campos para actualizar',
});

// ---------------------------------------------------------------------------
// AIRPORTS
// ---------------------------------------------------------------------------

export const airportSchema = z.object({
  iataCode: iataCode,
  name: required(120),
  city: required(80),
  province: trimmed(80).optional().nullable(),
  country: trimmed(80).default('Argentina'),
  timezone: trimmed(64).default('America/Argentina/Buenos_Aires'),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  isActive: z.coerce.boolean().default(true),
});

export const airportUpdateSchema = airportSchema.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'No hay campos para actualizar',
});

// ---------------------------------------------------------------------------
// AIRCRAFT / SEATS
// ---------------------------------------------------------------------------

const aircraftBase = z.object({
  registration: required(12).transform((v) => v.toUpperCase()),
  model: required(80),
  manufacturer: required(80),
  seatCount: z.coerce.number().int().min(1).max(1000).default(150),
  layout: trimmed(120).optional().nullable(),
  hasWifi: z.coerce.boolean().default(false),
  hasUsbPower: z.coerce.boolean().default(false),
  imageUrl: z.string().url('URL invalida').optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']).default('ACTIVE'),
  baseAirportId: iataCode.optional().nullable(),
});

export const aircraftSchema = aircraftBase.refine((d) => !/[\s-]/.test(d.registration), {
  message: 'La matricula no puede contener espacios ni guiones',
});

export const aircraftUpdateSchema = aircraftBase
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

export const seatSchema = z.object({
  rowNumber: z.coerce.number().int().min(1).max(200),
  columnLetter: z.string().trim().length(1).regex(/^[A-Z]$/, 'Debe ser una sola letra mayuscula'),
  cabinClass: cabinClassEnum.default('ECONOMY'),
  type: z.enum(['WINDOW', 'AISLE', 'MIDDLE', 'EXIT']).default('AISLE'),
  isExitRow: z.coerce.boolean().default(false),
});

export const seatBulkSchema = z.object({ seats: z.array(seatSchema).min(1).max(500) });

// ---------------------------------------------------------------------------
// ROUTES / FLIGHTS / FARES
// ---------------------------------------------------------------------------

const routeBase = z.object({
  code: required(12).transform((v) => v.toUpperCase()),
  originAirportId: iataCode,
  destinationAirportId: iataCode,
  distanceKm: z.coerce.number().int().min(1).max(20_000).optional().nullable(),
  // Obligatoria: la llegada de cada vuelo se calcula con ella (RF-01).
  durationMinutes: z.coerce.number().int().min(1).max(1500),
  isActive: z.coerce.boolean().default(true),
});

export const routeSchema = routeBase.refine(
  (d) => d.originAirportId !== d.destinationAirportId,
  {
    message: 'El origen y el destino no pueden ser el mismo aeropuerto',
    path: ['destinationAirportId'],
  },
);

export const routeUpdateSchema = routeBase
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

const flightBase = z.object({
  code: required(10).transform((v) => v.toUpperCase()),
  routeId: z.string().cuid('routeId invalido'),
  aircraftId: z.string().cuid('aircraftId invalido'),
  departureAt: dateIso,
  arrivalAt: dateIso,
  isDirect: z.coerce.boolean().default(true),
  punctualityPct: z.coerce.number().min(0).max(100).optional().nullable(),
  tags: z.array(trimmed(120)).max(10).default([]),
  notes: trimmed(255).optional().nullable(),
});

export const flightSchema = flightBase.refine(
  (d) => d.arrivalAt.getTime() > d.departureAt.getTime(),
  { message: 'La llegada debe ser posterior a la salida', path: ['arrivalAt'] },
);

export const flightUpdateSchema = flightBase
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

export const flightStatusUpdateSchema = z.object({
  status: flightStatusEnum,
});

/** Busca los precios de un vuelo; el HTML muestra el minimo como tarifa sugerida. */
export const flightFareSchema = z.object({
  fareId: z.string().cuid(),
  price: money,
  availableSeats: z.coerce.number().int().min(0).max(1000).default(150),
  currency: z.string().trim().length(3).default('ARS'),
});

export const flightSearchQuery = paginationQuery.extend({
  origin: iataCode.optional(),
  destination: iataCode.optional(),
  /** Fecha (YYYY-MM-DD). Devuelve los vuelos que salen ese dia. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha invalido (YYYY-MM-DD)')
    .optional(),
  /** Rango inclusivo. Tiene prioridad sobre `date`. */
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  status: flightStatusEnum.optional(),
  routeId: z.string().cuid().optional(),
  minPrice: money.optional(),
  maxPrice: money.optional(),
  sort: z.enum(['departure', 'price', 'punctuality']).default('departure'),
  order: z.enum(['asc', 'desc']).default('asc'),
  onlyDirect: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const fareSchema = z.object({
  code: required(24).transform((v) => v.toUpperCase()),
  name: required(80),
  cabinClass: cabinClassEnum.default('ECONOMY'),
  basePrice: money,
  carryOnKg: z.coerce.number().int().min(0).max(60).default(8),
  checkedBagKg: z.coerce.number().int().min(0).max(100).default(0),
  changeAllowed: z.coerce.boolean().default(false),
  seatSelection: z.coerce.boolean().default(false),
  refundable: z.coerce.boolean().default(false),
  benefits: z.array(trimmed(120)).max(10).default([]),
  isActive: z.coerce.boolean().default(true),
});

export const fareUpdateSchema = fareSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

export const weeklyFareSchema = z.object({
  routeId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha invalido (YYYY-MM-DD)'),
  price: money,
  demandLevel: demandLevelEnum.default('NORMAL'),
  currency: z.string().trim().length(3).default('ARS'),
});

export const weeklyFareUpdateSchema = z
  .object({
    price: money.optional(),
    demandLevel: demandLevelEnum.optional(),
    currency: z.string().trim().length(3).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

export const weeklyFareQuery = z.object({
  routeId: z.string().cuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  origin: iataCode.optional(),
  destination: iataCode.optional(),
});

// ---------------------------------------------------------------------------
// PASSENGERS
// ---------------------------------------------------------------------------

export const passengerSchema = z.object({
  firstName: required(80),
  lastName: required(80),
  documentType: documentTypeEnum.default('DNI'),
  documentNumber: required(32),
  birthDate: dateIso.optional().nullable(),
  nationality: trimmed(64).optional().nullable(),
  email: z.string().trim().toLowerCase().email('Correo invalido').optional().nullable().or(z.literal('')),
  phone: trimmed(32).optional().nullable(),
});

export const passengerUpdateSchema = passengerSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

// ---------------------------------------------------------------------------
// BOOKINGS
// ---------------------------------------------------------------------------

export const bookingFlightSchema = z.object({
  flightId: z.string().cuid(),
  fareId: z.string().cuid(),
  isReturn: z.coerce.boolean().default(false),
});

export const bookingSchema = z.object({
  tripType: z.enum(['ROUND_TRIP', 'ONE_WAY']).default('ONE_WAY'),
  contactEmail: z.string().trim().toLowerCase().email('Correo invalido').max(160),
  contactPhone: trimmed(32).optional().nullable(),
  cabinClass: cabinClassEnum.default('ECONOMY'),
  notes: trimmed(500).optional().nullable(),
  flights: z.array(bookingFlightSchema).min(1, 'Seleccione al menos un vuelo').max(4),
});

export const bookingUpdateSchema = z
  .object({
    status: bookingStatusEnum.optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(160).optional(),
    contactPhone: trimmed(32).optional().nullable(),
    notes: trimmed(500).optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

export const bookingPassengerSchema = z.object({
  passengerId: z.string().cuid().optional().nullable(),
  firstName: required(80),
  lastName: required(80),
  documentType: documentTypeEnum.default('DNI'),
  documentNumber: required(32),
  birthDate: dateIso.optional().nullable(),
  seatId: z.string().cuid().optional().nullable(),
});

export const checkInSchema = z.object({
  seatId: z.string().cuid().optional().nullable(),
  seatNumber: trimmed(6).optional().nullable(),
  checkInStatus: z.enum(['NOT_STARTED', 'OPEN', 'DONE']).default('OPEN'),
});

export const paymentSchema = z.object({
  method: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH', 'WALLET']),
  amount: money.optional(),
  currency: z.string().trim().length(3).default('ARS'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REFUNDED']).default('PENDING'),
  transactionRef: trimmed(64).optional().nullable(),
  installments: z.coerce.number().int().min(1).max(24).optional().nullable(),
});

export const baggageSchema = z.object({
  type: z.enum(['CABIN', 'HOLD', 'CARGO', 'SPECIAL']).default('HOLD'),
  tagCode: trimmed(16).optional(),
  weightKg: z.coerce.number().min(0).max(200).optional().nullable(),
  status: z.enum(['REGISTERED', 'CHECKED', 'LOADED', 'DELIVERED', 'LOST']).default('REGISTERED'),
});

export const boardingPassSchema = z.object({
  bookingPassengerId: z.string().cuid(),
  seatId: z.string().cuid().optional().nullable(),
});

export const auditQuery = paginationQuery.extend({
  userId: z.string().cuid().optional(),
  entity: trimmed(64).optional(),
  action: trimmed(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
