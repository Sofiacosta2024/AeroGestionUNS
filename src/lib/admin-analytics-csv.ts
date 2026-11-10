export function analyticsCsvLine(values: readonly (string | number)[]) {
  return values
    .map((value) => `"${String(value).replaceAll('"', '""')}"`)
    .join(';');
}

export function formatCsvDecimal(value: number, fractionDigits: number) {
  return value.toFixed(fractionDigits).replace('.', ',');
}
