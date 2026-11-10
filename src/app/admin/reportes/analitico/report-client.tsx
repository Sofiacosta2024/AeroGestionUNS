'use client';

import { useState, type FormEvent } from 'react';
import { INVALID_REPORT_DATE_RANGE_MESSAGE } from '@/lib/admin-analytics-constants';

type ReportRow = {
  routeId: string;
  route: string;
  fareCode: string;
  classLabel: string;
  ticketCount: number;
  grossAmount: number;
  capacitySeats: number;
  loadFactorPct: number;
};

type ReportResult = {
  rows: ReportRow[];
  summary: {
    totalTickets: number;
    totalGrossAmount: number;
    averageLoadFactorPct: number;
  };
};

type FilterOption = { value: string; label: string };

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-[#D5DDF5] bg-[#F3F6FF] px-3 text-sm text-[#1D1640] outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15';
const LABEL_CLASS = 'mb-1.5 block text-xs font-bold text-[#6B6990]';

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AnalyticsReport({
  routes,
  classes,
}: {
  routes: FilterOption[];
  classes: FilterOption[];
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [routeId, setRouteId] = useState('');
  const [classCode, setClassCode] = useState('');
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function reportUrl(format: 'json' | 'csv') {
    const params = new URLSearchParams({ startDate, endDate, format });
    if (routeId) params.set('routeId', routeId);
    if (classCode) params.set('fareCode', classCode);
    return `/api/v1/admin/reportes/analitico?${params.toString()}`;
  }

  async function generateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReport(null);
    setError('');
    if (startDate > endDate) {
      setError(INVALID_REPORT_DATE_RANGE_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(reportUrl('json'));
      const body = await response.json();
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message || 'No se pudo generar el reporte.');
      }
      setReport(body.data as ReportResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo conectar con el servicio de reportes. Intentá nuevamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6D28D9]">
          Panel de administración
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#2A1060] sm:text-3xl">
          Reportes analíticos e históricos
        </h1>
        <p className="mt-2 text-sm text-[#6B6990]">
          Analizá ventas, facturación y ocupación por ruta y rango de fechas.
        </p>
      </div>

      <form
        onSubmit={generateReport}
        className="rounded-xl border border-[#D9DDF0] bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] lg:items-end">
          <div>
            <label className={LABEL_CLASS} htmlFor="report-start-date">Fecha inicio</label>
            <input
              id="report-start-date"
              type="date"
              required
              disabled={loading}
              value={startDate}
              aria-invalid={Boolean(error && startDate > endDate)}
              aria-describedby={error ? 'report-error' : undefined}
              className={INPUT_CLASS}
              onChange={(event) => {
                setStartDate(event.target.value);
                setReport(null);
                setError('');
              }}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="report-end-date">Fecha fin</label>
            <input
              id="report-end-date"
              type="date"
              required
              disabled={loading}
              value={endDate}
              aria-invalid={Boolean(error && startDate > endDate)}
              aria-describedby={error ? 'report-error' : undefined}
              className={INPUT_CLASS}
              onChange={(event) => {
                setEndDate(event.target.value);
                setReport(null);
                setError('');
              }}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="report-route">Ruta</label>
            <select
              id="report-route"
              disabled={loading}
              value={routeId}
              className={INPUT_CLASS}
              onChange={(event) => {
                setRouteId(event.target.value);
                setReport(null);
                setError('');
              }}
            >
              <option value="">Todas</option>
              {routes.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="report-class">Clase</label>
            <select
              id="report-class"
              disabled={loading}
              value={classCode}
              className={INPUT_CLASS}
              onChange={(event) => {
                setClassCode(event.target.value);
                setReport(null);
                setError('');
              }}
            >
              <option value="">Todas</option>
              {classes.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-lg bg-[#E11D48] px-6 text-sm font-bold text-white transition hover:bg-[#BE123C] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Generando…' : 'Generar'}
          </button>
        </div>
        {error && (
          <p id="report-error" role="alert" className="mt-4 rounded-lg border border-[#F5B3C3] bg-[#FFE4EA] px-4 py-3 text-sm text-[#9F1239]">
            {error}
          </p>
        )}
      </form>

      {report ? (
        <>
          <section aria-label="Métricas consolidadas" className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Total pasajes vendidos" value={formatNumber(report.summary.totalTickets)} />
            <MetricCard label="Facturación bruta" value={formatCurrency(report.summary.totalGrossAmount)} />
            <MetricCard label="Load Factor promedio" value={`${formatNumber(report.summary.averageLoadFactorPct, 1)}%`} />
          </section>

          <div className="mt-5 overflow-hidden rounded-xl border border-[#D9DDF0] bg-white shadow-sm">
            {report.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-[#F2F4FC] text-xs font-bold text-[#6B6990]">
                    <tr>
                      <th scope="col" className="px-5 py-3">Ruta</th>
                      <th scope="col" className="px-5 py-3">Clase</th>
                      <th scope="col" className="px-5 py-3">Pasajes</th>
                      <th scope="col" className="px-5 py-3">Facturación ($)</th>
                      <th scope="col" className="px-5 py-3">Load Factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={`${row.routeId}-${row.fareCode}`} className="border-t border-[#E3E6F3] text-[#3B3660]">
                        <td className="px-5 py-3 font-semibold text-[#2A1060]">{row.route}</td>
                        <td className="px-5 py-3">{row.classLabel}</td>
                        <td className="px-5 py-3">{formatNumber(row.ticketCount)}</td>
                        <td className="px-5 py-3">{formatCurrency(row.grossAmount)}</td>
                        <td className="px-5 py-3">{formatNumber(row.loadFactorPct, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-6 py-12 text-center text-sm text-[#6B6990]">
                No se encontraron ventas para los parámetros seleccionados.
              </p>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <a
              href={reportUrl('csv')}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#E11D48] px-5 text-sm font-bold text-white transition hover:bg-[#BE123C]"
            >
              <span aria-hidden="true">↓</span>
              Exportar a CSV
            </a>
          </div>
        </>
      ) : (
        !error && !loading && (
          <div className="mt-5 rounded-xl border border-[#D9DDF0] bg-white px-6 py-12 text-center text-sm text-[#6B6990]">
            Completá los parámetros para generar el reporte.
          </div>
        )
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#D9DDF0] bg-white p-5 text-center shadow-sm">
      <p className="text-sm text-[#6B6990]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#2A1060]">{value}</p>
    </div>
  );
}
