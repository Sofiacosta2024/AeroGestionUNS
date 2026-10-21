const messages: Record<string, string> = {
  form_identifier_not_found: 'No encontramos una cuenta con ese correo. Revisalo o creá una cuenta.',
  form_param_format_invalid: 'Revisá el formato de los datos ingresados.',
  form_code_incorrect: 'El código no es correcto. Revisalo e intentá nuevamente.',
  verification_expired: 'El código venció. Solicitá uno nuevo.',
  too_many_requests: 'Se hicieron demasiados intentos. Esperá unos minutos y volvé a probar.',
  session_exists: 'Ya tenés una sesión abierta. Cerrá sesión antes de recuperar la contraseña.',
};

/** Clerk v7 wraps API errors; its user-facing message lives in errors[]. */
export function passwordRecoveryError(error: unknown, fallback: string, depth = 0): string {
  if (!error || typeof error !== 'object' || depth > 3) return fallback;
  const value = error as { code?: unknown; longMessage?: unknown; errors?: unknown; cause?: unknown };
  if (Array.isArray(value.errors)) {
    for (const nested of value.errors) {
      const message = passwordRecoveryError(nested, '', depth + 1);
      if (message) return message;
    }
  }
  if (typeof value.code === 'string' && messages[value.code]) return messages[value.code]!;
  if (typeof value.longMessage === 'string' && value.longMessage.trim()) return value.longMessage;
  return passwordRecoveryError(value.cause, fallback, depth + 1);
}
