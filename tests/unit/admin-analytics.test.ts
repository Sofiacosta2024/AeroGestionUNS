import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/lib/api';
import { INVALID_REPORT_DATE_RANGE_MESSAGE } from '../../src/lib/admin-analytics-constants';
import {
  getAnalyticsDateRange,
} from '../../src/lib/admin-analytics';

test('el rango del reporte incluye el día final completo', () => {
  const range = getAnalyticsDateRange('2026-10-01', '2026-10-31');
  assert.equal(range.from.toISOString(), '2026-10-01T03:00:00.000Z');
  assert.equal(range.until.toISOString(), '2026-11-01T03:00:00.000Z');
});

test('rechaza fechas invertidas con el mensaje funcional literal', () => {
  assert.throws(
    () => getAnalyticsDateRange('2026-10-31', '2026-10-01'),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.message === INVALID_REPORT_DATE_RANGE_MESSAGE,
  );
});

test('rechaza fechas que no existen en el calendario', () => {
  assert.throws(
    () => getAnalyticsDateRange('2026-02-30', '2026-03-01'),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
});
