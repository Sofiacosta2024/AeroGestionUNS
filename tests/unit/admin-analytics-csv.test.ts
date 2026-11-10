import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsCsvLine, formatCsvDecimal } from '../../src/lib/admin-analytics-csv';

test('el CSV usa punto y coma como separador de columnas para Excel regional', () => {
  assert.equal(
    analyticsCsvLine(['BHI→AEP', 'Economy Premium', 24, '1984200,50', '78,2']),
    '"BHI→AEP";"Economy Premium";"24";"1984200,50";"78,2"',
  );
});

test('el CSV escapa comillas y mantiene coma decimal', () => {
  assert.equal(analyticsCsvLine(['Clase "Plus"']), '"Clase ""Plus"""');
  assert.equal(formatCsvDecimal(1984200.5, 2), '1984200,50');
  assert.equal(formatCsvDecimal(78.25, 1), '78,3');
});
