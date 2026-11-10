import { ApiError } from '@/lib/api';
import { INVALID_REPORT_DATE_RANGE_MESSAGE } from '@/lib/admin-analytics-constants';
import { localDayRangeUtc } from '@/lib/dates';

function isValidDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

export function getAnalyticsDateRange(startDate: string, endDate: string) {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw ApiError.badRequest('Ingresá un rango de fechas válido.');
  }
  if (startDate > endDate) {
    throw ApiError.badRequest(INVALID_REPORT_DATE_RANGE_MESSAGE);
  }

  return {
    from: localDayRangeUtc(startDate).start,
    until: localDayRangeUtc(endDate).end,
  };
}
