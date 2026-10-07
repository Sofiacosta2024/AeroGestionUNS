import { formatArs, formatFullDate, formatTime } from './format';

export type Receipt = {
  code: string;
  email: string;
  reference: string;
  amount: number;
  currency: string;
  flights: {
    code: string;
    origin: string;
    destination: string;
    departureAt: string;
    arrivalAt: string;
    isDirect: boolean;
  }[];
  passengers: { name: string; seat: string }[];
};
export type EmailResult = {
  status: 'accepted' | 'failed';
  message: string;
  id?: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

export function receiptContent(receipt: Receipt) {
  const lines = [
    'AeroGestión UNS — Pago simulado confirmado',
    `Reserva: ${receipt.code}`,
    `Comprobante: ${receipt.reference}`,
    `Total: ${formatArs(receipt.amount)} ${receipt.currency}`,
    ...receipt.flights.map(
      (f) =>
        `${f.code}: ${f.origin} → ${f.destination} · ${formatFullDate(f.departureAt)} · ${formatTime(f.departureAt)}–${formatTime(f.arrivalAt)} ART`,
    ),
    ...receipt.passengers.map((p) => `${p.name} · Asiento: ${p.seat}`),
    'Proyecto universitario. No se realizó ningún cobro real. Este comprobante no es una factura fiscal ni una tarjeta de embarque.',
  ];
  return {
    text: lines.join('\n'),
    html: `<html lang="es"><body style="background:#f6f7ff;font-family:Arial,sans-serif;color:#170040;padding:24px"><main style="max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden"><h1 style="margin:0;padding:28px;background:#2e1065;color:white;font-size:24px">AeroGestión <span style="color:#ff5179">UNS</span></h1><div style="padding:28px"><h2>¡Pago confirmado!</h2>${lines
      .slice(1)
      .map((line) => `<p style="line-height:1.6">${escape(line)}</p>`)
      .join('')}</div></main></body></html>`,
  };
}

/** Solo se envía información del comprobante, nunca PAN, CVV ni documento. */
export async function sendReceipt(
  receipt: Receipt,
  idempotencyKey: string,
  options: {
    apiKey?: string;
    from?: string;
    fetch?: typeof fetch;
  } = {},
): Promise<EmailResult> {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey)
    return {
      status: 'failed',
      message:
        'El envío de correo no está configurado. Tu pago sigue confirmado.',
    };
  const content = receiptContent(receipt);
  try {
    const response = await (options.fetch ?? fetch)(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          from:
            options.from ??
            process.env.RESEND_FROM ??
            'AeroGestión UNS <onboarding@resend.dev>',
          to: [receipt.email],
          subject: `Reserva ${receipt.code} — Pago simulado confirmado`,
          ...content,
        }),
      },
    );
    const result = await response.json();
    if (!response.ok || typeof result.id !== 'string') {
      const restricted =
        response.status === 403 &&
        String(result.message).includes('testing emails');
      return {
        status: 'failed',
        message: restricted
          ? 'El remitente de prueba de Resend solo permite enviar al correo del titular de la cuenta. Tu pago sigue confirmado.'
          : 'No pudimos enviar el correo. Tu pago sigue confirmado; podés reintentar.',
      };
    }
    return {
      status: 'accepted',
      id: result.id,
      message:
        'Resend aceptó el correo para su envío. Revisá tu bandeja y spam.',
    };
  } catch {
    return {
      status: 'failed',
      message:
        'No pudimos confirmar el envío del correo. Tu pago sigue confirmado; podés reintentar.',
    };
  }
}
