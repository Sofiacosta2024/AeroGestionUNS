'use client';

import { useEffect, useState } from 'react';
import type { ScheduleEvaluation } from '@/lib/scheduling/service';
import type { ScheduleInput } from '@/lib/validation';
import { ApiRequestError, apiRequest, detailMessages } from '../../api-client';

export type CheckState = {
  loading: boolean;
  result: ScheduleEvaluation | null;
  /** Errores de validacion de la entrada (por ejemplo, ninguna clase cargada). */
  errors: string[];
};

const IDLE: CheckState = { loading: false, result: null, errors: [] };
const DEBOUNCE_MS = 400;

/**
 * Chequeo en vivo del cronograma (RF-01): cada vez que cambia el pedido, espera a que el
 * admin deje de tipear y consulta `/api/flight-schedules/check`. Cancela la consulta
 * anterior para que nunca pise un resultado mas nuevo.
 */
export function useScheduleCheck(input: ScheduleInput | null): CheckState {
  const [state, setState] = useState<CheckState>(IDLE);
  const key = input ? JSON.stringify(input) : null;

  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const result = await apiRequest<ScheduleEvaluation>(
          'POST',
          '/api/flight-schedules/check',
          JSON.parse(key),
          controller.signal,
        );
        setState({ loading: false, result, errors: [] });
      } catch (err) {
        if (controller.signal.aborted) return;
        const errors =
          err instanceof ApiRequestError
            ? detailMessages(err.details).length > 0
              ? detailMessages(err.details)
              : [err.message]
            : ['No se pudo verificar el cronograma'];
        setState({ loading: false, result: null, errors });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return state;
}
