import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublic = createRouteMatcher([
  '/',
  '/vuelos(.*)',
  '/pago(.*)',
  '/login(.*)',
  '/sign-up(.*)',
  '/reserva(.*)',
  '/api/reservas/consulta',
  // La consulta publica y sus dos documentos: solo esas tres rutas. Rutas
  // explicitas (fail-closed): cualquier subpath nuevo exige decidir si es
  // publico; un wildcard haria publico de facto todo lo que empiece por el
  // prefijo (ej. /consulta-admin).
  '/api/v1/reservas/consulta',
  '/api/v1/reservas/consulta/pasaje',
  '/api/v1/reservas/consulta/factura',
  '/api/v1/reservas/consulta/reprogramar',
  '/api/webhooks(.*)',
  '/api/flights(.*)',
  '/api/bookings(.*)',
  '/api/health',
]);
const isAdmin = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
  '/api/v1/admin(.*)',
]);
const isMostrador = createRouteMatcher(['/mostrador(.*)', '/api/mostrador(.*)']);
// US-14C: la consola de busqueda y gestion de reservas acepta MOSTRADOR ademas de ADMIN
// (paginas y APIs internas). El resto del panel sigue siendo exclusivo de ADMIN.
const isReservasConsole = createRouteMatcher([
  '/admin/reservas(.*)',
  '/api/v1/admin/reservas(.*)',
]);

// Exportados solo para las pruebas de rutas (US-14A): permiten verificar que
// las rutas publicas y protegidas se comportan como se espera sin arrancar
// el servidor ni Clerk.
export { isPublic, isAdmin, isMostrador, isReservasConsole };


export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

  const role = sessionClaims?.metadata?.role ?? 'PASAJERO';

  if (isAdmin(req) && role !== 'ADMIN') {
    // US-14C: la unica excepcion a ADMIN es la consola de reservas para MOSTRADOR.
    const isReservasForMostrador = role === 'MOSTRADOR' && isReservasConsole(req);
    if (!isReservasForMostrador) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }
  if (isMostrador(req) && role !== 'MOSTRADOR' && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};