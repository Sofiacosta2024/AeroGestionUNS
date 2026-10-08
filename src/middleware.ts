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
  '/api/webhooks(.*)',
  '/api/flights(.*)',
  '/api/bookings(.*)',
  '/api/health',
]);
const isAdmin = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);
const isMostrador = createRouteMatcher(['/mostrador(.*)', '/api/mostrador(.*)']);


export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

  const role = sessionClaims?.metadata?.role ?? 'PASAJERO';

  if (isAdmin(req) && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
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