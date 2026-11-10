/**
 * Ruta base del componente Clerk que completa los desafios pendientes del
 * login propio (confianza del dispositivo, MFA, etc.).
 *
 * Debe coincidir con el `path` de `<SignIn>` en la pagina de login: si no,
 * Clerk normaliza la URL a `/login` y el formulario propio vuelve a aparecer.
 */
export const CLERK_SIGN_IN_PATH = '/login/clerk';
