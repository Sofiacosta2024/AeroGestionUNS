export function formatFlightDate(value: string | null): string {
  if (!value) return 'Horario pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horario pendiente';

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('es-AR')}`;
  }
}

export function presentStatus(status: string): string {
  const labels: Record<string, string> = {
    SCHEDULED: 'Programado',
    BOARDING: 'Embarcando',
    DEPARTED: 'Despegó',
    ARRIVED: 'Arribó',
    DELAYED: 'Demorado',
    CANCELLED: 'Cancelado',
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmado',
    PAID: 'Pagado',
    COMPLETED: 'Completado',
    BOARDED: 'Abordado',
    NO_SHOW: 'No se presentó',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}
