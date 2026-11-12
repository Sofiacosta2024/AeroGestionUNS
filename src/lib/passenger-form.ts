import { toDateInput } from './format';

// Cambio US-16: el pasajero del checkout suma tipo de documento (DNI o Pasaporte) y fecha
// de nacimiento obligatoria, para guardarlo en la agenda y autocompletarlo despues.
// Estas reglas las usan el formulario y el servidor (`webLockSeatsSchema`, agenda).

/** Documentos que acepta el checkout web. */
export const PASSENGER_DOCUMENT_TYPES = ['DNI', 'PASAPORTE'] as const;
export type PassengerDocumentType = (typeof PASSENGER_DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<PassengerDocumentType, string> = {
  DNI: 'DNI',
  PASAPORTE: 'Pasaporte',
};

export type PassengerFormData = {
  firstName: string;
  lastName: string;
  documentType: PassengerDocumentType;
  documentNumber: string;
  /** yyyy-mm-dd, o '' si todavia no se cargo. */
  birthDate: string;
};

export type PassengerFormField = keyof PassengerFormData;
export type PassengerFormErrors = Partial<Record<PassengerFormField, string>>;

const NAME_RE = /^\p{L}+(?:[ '\-]+\p{L}+)*$/u;
const DNI_RE = /^\d{6,9}$/;
/** Pasaporte: letras y numeros, sin espacios ni signos (ej. AAE123456). */
const PASSPORT_RE = /^[A-Z0-9]{6,15}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_BIRTH_DATE = '1900-01-01';

function countLetters(value: string): number {
  return (value.match(/\p{L}/gu) ?? []).length;
}

export function emptyPassenger(): PassengerFormData {
  return { firstName: '', lastName: '', documentType: 'DNI', documentNumber: '', birthDate: '' };
}

/** DNI: solo digitos (acepta "39.112.804"). Pasaporte: mayusculas, sin espacios, puntos ni guiones. */
export function normalizeDocumentNumber(type: PassengerDocumentType, raw: string): string {
  return type === 'DNI' ? raw.replace(/\D/g, '') : raw.toUpperCase().replace(/[\s.\-]/g, '');
}

/** Lo que se puede escribir en el campo: corta lo que nunca seria valido. */
export function sanitizeDocumentInput(type: PassengerDocumentType, raw: string): string {
  return type === 'DNI' ? raw.replace(/\D/g, '').slice(0, 9) : raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

export function normalizePassenger(passenger: PassengerFormData): PassengerFormData {
  return {
    firstName: passenger.firstName.trim().replace(/\s+/g, ' '),
    lastName: passenger.lastName.trim().replace(/\s+/g, ' '),
    documentType: passenger.documentType,
    documentNumber: normalizeDocumentNumber(passenger.documentType, passenger.documentNumber),
    birthDate: passenger.birthDate.trim(),
  };
}

function documentError(type: PassengerDocumentType, raw: string): string | undefined {
  const value = normalizeDocumentNumber(type, raw.trim());
  if (type === 'DNI') {
    if (!value) return 'Ingresá el DNI.';
    if (!DNI_RE.test(value)) return 'Ingresá un DNI de 6 a 9 dígitos.';
    return undefined;
  }
  if (!value) return 'Ingresá el número de pasaporte.';
  if (!PASSPORT_RE.test(value)) return 'Ingresá un pasaporte de 6 a 15 letras o números.';
  return undefined;
}

/** `today` en yyyy-mm-dd (hora argentina): la fecha de nacimiento no puede ser posterior. */
function birthDateError(raw: string, today: string): string | undefined {
  const value = raw.trim();
  if (!value) return 'Ingresá la fecha de nacimiento.';
  const parsed = new Date(`${value}T00:00:00Z`);
  const real = DATE_RE.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  if (!real || value < MIN_BIRTH_DATE) return 'Ingresá una fecha de nacimiento válida.';
  if (value > today) return 'La fecha de nacimiento no puede ser futura.';
  return undefined;
}

export function validatePassenger(
  passenger: PassengerFormData,
  today: string = toDateInput(new Date()),
): PassengerFormErrors {
  const errors: PassengerFormErrors = {};
  const firstName = passenger.firstName.trim();
  const lastName = passenger.lastName.trim();

  if (!firstName) {
    errors.firstName = 'Ingresá el nombre.';
  } else if (firstName.length > 80) {
    errors.firstName = 'El nombre no puede superar los 80 caracteres.';
  } else if (!NAME_RE.test(firstName)) {
    errors.firstName = 'Ingresá sólo letras y espacios.';
  } else if (countLetters(firstName) < 2) {
    errors.firstName = 'El nombre debe tener al menos 2 letras.';
  }

  if (!lastName) {
    errors.lastName = 'Ingresá el apellido.';
  } else if (lastName.length > 80) {
    errors.lastName = 'El apellido no puede superar los 80 caracteres.';
  } else if (!NAME_RE.test(lastName)) {
    errors.lastName = 'Ingresá sólo letras y espacios.';
  } else if (countLetters(lastName) < 2) {
    errors.lastName = 'El apellido debe tener al menos 2 letras.';
  }

  if (!PASSENGER_DOCUMENT_TYPES.includes(passenger.documentType)) {
    errors.documentType = 'Elegí DNI o Pasaporte.';
  } else {
    const document = documentError(passenger.documentType, passenger.documentNumber);
    if (document) errors.documentNumber = document;
  }

  const birthDate = birthDateError(passenger.birthDate, today);
  if (birthDate) errors.birthDate = birthDate;

  return errors;
}

/** Clave de un documento: el mismo numero con otro tipo es otro documento. */
export function documentKey(type: string, number: string): string {
  return `${type}:${number}`;
}

export function validatePassengers(
  passengers: PassengerFormData[],
  today: string = toDateInput(new Date()),
): PassengerFormErrors[] {
  const errors = passengers.map((p) => validatePassenger(p, today));
  const documentIndexes = new Map<string, number[]>();

  passengers.forEach((passenger, index) => {
    const number = normalizeDocumentNumber(passenger.documentType, passenger.documentNumber.trim());
    if (!number) return;
    const key = documentKey(passenger.documentType, number);
    documentIndexes.set(key, [...(documentIndexes.get(key) ?? []), index]);
  });

  for (const indexes of documentIndexes.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      errors[index]!.documentNumber =
        passengers[index]!.documentType === 'DNI'
          ? 'Este DNI se repite en otro pasajero.'
          : 'Este pasaporte se repite en otro pasajero.';
    }
  }

  return errors;
}

export function hasPassengerErrors(errors: PassengerFormErrors[]): boolean {
  return errors.some((passengerErrors) => Object.keys(passengerErrors).length > 0);
}
