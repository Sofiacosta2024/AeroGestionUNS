export type PassengerFormData = {
  firstName: string;
  lastName: string;
  documentNumber: string;
};

export type PassengerFormField = keyof PassengerFormData;
export type PassengerFormErrors = Partial<Record<PassengerFormField, string>>;

const NAME_RE = /^\p{L}+(?:[ '\-]+\p{L}+)*$/u;

function countLetters(value: string): number {
  return (value.match(/\p{L}/gu) ?? []).length;
}

export function emptyPassenger(): PassengerFormData {
  return { firstName: '', lastName: '', documentNumber: '' };
}

export function normalizePassenger(passenger: PassengerFormData): PassengerFormData {
  return {
    firstName: passenger.firstName.trim().replace(/\s+/g, ' '),
    lastName: passenger.lastName.trim().replace(/\s+/g, ' '),
    documentNumber: passenger.documentNumber.replace(/\D/g, ''),
  };
}

export function validatePassenger(passenger: PassengerFormData): PassengerFormErrors {
  const errors: PassengerFormErrors = {};
  const firstName = passenger.firstName.trim();
  const lastName = passenger.lastName.trim();
  const documentNumber = passenger.documentNumber.trim();

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

  if (!documentNumber) {
    errors.documentNumber = 'Ingresá el DNI.';
  } else if (!/^\d{6,9}$/.test(documentNumber)) {
    errors.documentNumber = 'Ingresá un DNI de 6 a 9 dígitos.';
  }

  return errors;
}

export function validatePassengers(passengers: PassengerFormData[]): PassengerFormErrors[] {
  const errors = passengers.map(validatePassenger);
  const documentIndexes = new Map<string, number[]>();

  passengers.forEach((passenger, index) => {
    const documentNumber = passenger.documentNumber.trim();
    if (!documentNumber) return;
    const indexes = documentIndexes.get(documentNumber) ?? [];
    indexes.push(index);
    documentIndexes.set(documentNumber, indexes);
  });

  for (const indexes of documentIndexes.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      errors[index]!.documentNumber = 'Este DNI se repite en otro pasajero.';
    }
  }

  return errors;
}

export function hasPassengerErrors(errors: PassengerFormErrors[]): boolean {
  return errors.some((passengerErrors) => Object.keys(passengerErrors).length > 0);
}
