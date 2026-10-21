/** Conservar el remitente de pruebas usado por la integración local existente. */
export function receiptSender(explicit?: string): string | undefined {
  const configured = explicit?.trim() || process.env.RESEND_FROM?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? undefined : 'AeroGestión UNS <onboarding@resend.dev>';
}
