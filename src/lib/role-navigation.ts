export function roleHome(role: string): string {
  return role === 'ADMIN' ? '/admin' : role === 'MOSTRADOR' ? '/mostrador' : '/vuelos';
}
