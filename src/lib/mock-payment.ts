/** Validación de formato separada del resultado: no consulta bancos ni usa Luhn. */
export function mockPaymentStatus(cardNumber: string): 'APPROVED' | 'REJECTED' {
  if (!/^\d{16}$/.test(cardNumber))
    throw new Error('Número de tarjeta inválido');
  return /^1+$/.test(cardNumber) ? 'REJECTED' : 'APPROVED';
}

export function digitsOnly(value: string, limit: number): string {
  return value.replace(/\D/g, '').slice(0, limit);
}
