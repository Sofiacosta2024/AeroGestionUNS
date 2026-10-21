import Link from 'next/link';

/**
 * Salida publica hacia la consulta de reservas (US-14A).
 *
 * `/reserva` esta en `isPublic` (src/middleware.ts): la consulta no pide
 * sesion. El enlace vive en un componente propio para que el login muestre
 * siempre la misma salida, tanto en el formulario propio (`/login`) como en
 * los pasos de Clerk (`/login/clerk`), sin duplicar el marcado.
 */
export default function PublicReservaLink() {
  return (
    <p className="pt-2 text-center">
      <Link
        className="font-label-md text-label-md text-secondary hover:underline underline-offset-4"
        href="/reserva"
      >
        Consultar reserva sin iniciar sesión
      </Link>
    </p>
  );
}
