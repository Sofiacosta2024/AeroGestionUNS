export type SiteHeaderPath = 'vuelos' | 'reserva';

/**
 * Destino del enlace "Buscar vuelos" de la barra de navegacion (SiteHeader).
 *
 * La barra es compartida por el motor de vuelos y la consulta publica de
 * reservas. En /reserva el visitante es un invitado: la busqueda de vuelos
 * exige sesion, asi que el enlace ofrece el acceso al login en lugar de
 * llevar al motor de vuelos. En /vuelos el enlace se mantiene en su propia
 * seccion (comportamiento previo, sin cambios).
 */
export function buscarVuelosHref(activePath: SiteHeaderPath): string {
  return activePath === 'reserva' ? '/login' : '/vuelos';
}

/**
 * Secciones pendientes visibles en la barra compartida. La consulta publica de
 * reservas no ofrece el alta de vuelos: esa pantalla es exclusiva del panel de
 * administracion y el acceso se conserva intacto en el resto del sitio.
 */
export function siteHeaderPendingSections<T extends { path: string }>(
  activePath: SiteHeaderPath,
  sections: readonly T[],
): readonly T[] {
  if (activePath !== 'reserva') return sections;
  return sections.filter((section) => section.path !== 'alta-de-vuelos-admin');
}
