export {};
declare global {
  interface CustomJwtSessionClaims {
    metadata: { role?: 'PASAJERO' | 'MOSTRADOR' | 'ADMIN' };
  }
}