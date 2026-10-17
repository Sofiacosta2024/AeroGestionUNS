import ConsultaClient from './consulta-client';

/**
 * Pagina publica de consulta de reservas (US-14A).
 *
 * No necesita datos del servidor en el primer render: todo el flujo (validacion
 * y llamada a `POST /api/v1/reservas/consulta`) vive en el Client Component.
 */
export default function ReservaPage() {
  return <ConsultaClient />;
}
