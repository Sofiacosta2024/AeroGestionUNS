import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const isPublicPage = createRouteMatcher([
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
  '/api/webhooks/resend',
  '/api/health',
]);
const isFlightRead = createRouteMatcher(['/api/flights', '/api/flights/([^/]+)/seats']);
/** Las lecturas comerciales son públicas; no habilitar por prefijo APIs de escritura. */
function isPublic(req: NextRequest) {
  if (isPublicPage(req)) return true;
  if ((req.method ?? 'GET') !== 'GET') return false;
  if (isFlightRead(req)) return true;
  return req.nextUrl.pathname === '/api/bookings' && /^[A-Z]{2}-[A-Z0-9]{4,10}$/i.test(req.nextUrl.searchParams.get('search')?.trim() ?? '');
}
const isAdmin = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
  '/api/v1/admin(.*)',
]);
const isMostrador = createRouteMatcher(['/mostrador(.*)', '/api/mostrador(.*)', '/api/v1/mostrador(.*)']);
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

function denyAccess(req: NextRequest) {
  return req.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'No tiene permisos para esta operación' } }, { status: 403 })
    : NextResponse.redirect(new URL('/', req.url));
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return req.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    : redirectToSignIn({ returnBackUrl: req.url });

  const role = sessionClaims?.metadata?.role ?? 'PASAJERO';

  if (isAdmin(req) && role !== 'ADMIN') {
    // US-14C: la unica excepcion a ADMIN es la consola de reservas para MOSTRADOR.
    const isReservasForMostrador = role === 'MOSTRADOR' && isReservasConsole(req);
    if (!isReservasForMostrador) {
      return denyAccess(req);
    }
  }
  if (isMostrador(req) && role !== 'MOSTRADOR' && role !== 'ADMIN') {
    return denyAccess(req);
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
