'use client';

import { useEffect, useState } from 'react';
import type { MotivoCancelacion, CancelacionInfo } from '@/lib/contingencias';
import { apiRequest, ApiRequestError } from '../api-client';

type Props = {
  flightId: string;
  flightCode: string;
  onClose: () => void;
  onSuccess: (data: { affectedPassengersCount: number; reason: string }) => void;
};

export default function CancelFlightModal({
  flightId,
  flightCode,
  onClose,
  onSuccess,
}: Props) {
  const [reason, setReason] = useState<MotivoCancelacion>('Clima');
  const [info, setInfo] = useState<CancelacionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiRequest<CancelacionInfo>('GET', `/api/admin/vuelos/${flightId}/cancelar`);
        if (active) setInfo(data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Error al cargar información del vuelo');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [flightId]);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{
        affectedPassengersCount: number;
        reason: string;
      }>('POST', `/api/admin/vuelos/${flightId}/cancelar`, { reason });
      onSuccess(res);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'No se pudo cancelar el vuelo. Por favor reintente.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-surface-container-high transition-all">
        {/* Ícono de advertencia circular WF-12A */}
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-2xl mx-auto mb-3 shadow-inner">
          !
        </div>

        {/* Título y subtítulo */}
        <h2 id="cancel-modal-title" className="text-xl font-bold text-primary text-center">
          Cancelar vuelo {flightCode}
        </h2>

        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-secondary">
              progress_activity
            </span>
            <p className="text-sm text-on-surface-variant font-medium">
              Consultando pasajes y reservas afectadas…
            </p>
          </div>
        ) : error && !info ? (
          <div className="my-4 p-4 rounded-xl bg-error-container text-on-error-container text-sm">
            <p className="font-bold">{error}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-surface-container text-primary text-sm font-semibold hover:bg-surface-container-high"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-on-surface-variant text-center mt-1">
              {info?.flight.origin} → {info?.flight.destination} ·{' '}
              {info?.flight.departureAt
                ? new Date(info.flight.departureAt).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                  })
                : ''}{' '}
              ·{' '}
              {info?.flight.departureAt
                ? new Date(info.flight.departureAt).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Argentina/Buenos_Aires',
                  })
                : ''}
              . La cancelación es lógica: el vuelo queda registrado como cancelado.
            </p>

            {/* Cuadro de advertencia WF-12A */}
            <div className="bg-[#fff1f2] border border-[#fecdd3] text-[#9f1239] rounded-xl p-4 text-sm font-medium leading-relaxed my-4">
              <p>
                <strong className="font-bold">
                  {info?.affectedPassengersCount ?? 0} pasajes vendidos serán afectados
                </strong>{' '}
                ({info?.breakdown.economy ?? 0} Economy ·{' '}
                {info?.breakdown.economyPremium ?? 0} Economy Premium ·{' '}
                {info?.breakdown.primeraClase ?? 0} Primera Clase). Los pasajeros
                quedarán pendientes de reasignación.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-error-container text-on-error-container text-sm font-medium">
                {error}
              </div>
            )}

            {/* Selector de motivo de cancelación */}
            <div className="flex flex-col gap-1.5 text-left mb-6">
              <label
                htmlFor="motivo-cancelacion-select"
                className="text-sm font-semibold text-primary"
              >
                Motivo de cancelación
              </label>
              <select
                id="motivo-cancelacion-select"
                value={reason}
                onChange={(e) => setReason(e.target.value as MotivoCancelacion)}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm text-primary font-medium focus:border-secondary focus:ring-1 focus:ring-secondary cursor-pointer"
              >
                <option value="Clima">Clima</option>
                <option value="Mantenimiento">Mantenimiento</option>
                <option value="Operativo">Operativo</option>
              </select>
              <span className="text-xs text-on-surface-variant font-medium">
                Opciones: Clima · Mantenimiento · Operativo
              </span>
            </div>

            {/* Botones de acción WF-12A */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-container">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg border border-outline-variant bg-surface-container-low text-primary hover:bg-surface-container-high font-semibold text-sm transition-colors"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg bg-secondary hover:bg-secondary/90 text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {busy && (
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                )}
                Confirmar Cancelación de Vuelo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
