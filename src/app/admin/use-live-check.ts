'use client';

import { useEffect, useState } from 'react';
import { ApiRequestError, apiRequest, detailMessages } from './api-client';

export type CheckState<T> = {
  loading: boolean;
  result: T | null;
  /** Errores de validacion de la entrada (por ejemplo, ninguna clase cargada). */
  errors: string[];
};

const DEBOUNCE_MS = 400;

/**
 * Chequeo en vivo de un formulario del panel: cada vez que cambia el pedido, espera a que
 * el admin deje de tipear y lo manda por POST a `url`. Cancela la consulta anterior para
 * que nunca pise un resultado mas nuevo. Lo usan el alta (RF-01) y la reprogramacion
 * (US-11B); antes era `useScheduleCheck`, solo para el alta.
 */
export function useLiveCheck<T>(url: string, input: unknown): CheckState<T> {
  const [state, setState] = useState<CheckState<T>>({ loading: false, result: null, errors: [] });
  const key = input ? JSON.stringify(input) : null;

  useEffect(() => {
    if (!key) {
      setState({ loading: false, result: null, errors: [] });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const result = await apiRequest<T>('POST', url, JSON.parse(key), controller.signal);
        setState({ loading: false, result, errors: [] });
      } catch (err) {
        if (controller.signal.aborted) return;
        const errors =
          err instanceof ApiRequestError
            ? detailMessages(err.details).length > 0
              ? detailMessages(err.details)
              : [err.message]
            : ['No se pudo verificar la disponibilidad'];
        setState({ loading: false, result: null, errors });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, key]);

  return state;
}
