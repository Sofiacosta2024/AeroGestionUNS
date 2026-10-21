/**
 * Destino del enlace "Buscar vuelos" de la barra de navegacion (SiteHeader).
 *
 * La barra es compartida por el motor de vuelos y la consulta publica de
 * reservas. En /reserva el visitante es un invitado: la busqueda de vuelos
 * exige sesion, asi que el enlace ofrece el acceso al login en lugar de
 * llevar al motor de vuelos. En /vuelos el enlace se mantiene en su propia
 * seccion (comportamiento previo, sin cambios).
 */
export function buscarVuelosHref(activePath: 'vuelos' | 'reserva'): string {
  return activePath === 'reserva' ? '/login' : '/vuelos';
}
