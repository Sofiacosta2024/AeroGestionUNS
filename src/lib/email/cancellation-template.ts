import { formatTime, toDateInput } from '../format';
import type { BookingCancellationSnapshot, CancellationSnapshot } from './cancellation-snapshot';
import { escapeHtml } from './receipt-template';

const ALERT = 'ALERTA URGENTE · Vuelo cancelado';
const PHONE = '0800-555-0199';
const SUPPORT = 'soporte@aerogestion.uns.edu.ar';
const NO_ALTERNATIVE = 'A confirmar por Atención prioritaria';
const FOOTER = 'AeroGestión UNS · Terminal BHI Cte. Espora · Bahía Blanca, Argentina';
const DISCLAIMER = 'Mensaje automático, no respondas a esta casilla.';

export function renderBookingCancellationEmail(snapshot: BookingCancellationSnapshot) {
  const { displayCode, greetingName, bookingUrl, refundPending } = snapshot;
  const subject = `Reserva ${displayCode} — Tu reserva fue cancelada`;
  const message = `Tu reserva ${displayCode} fue cancelada.`;
  const refund = 'El reembolso quedó pendiente.';
  return {
    subject,
    text: [
      `Hola, ${greetingName}.`, message, ...(refundPending ? [refund] : []),
      `Ver Mi Reserva: ${bookingUrl}`, DISCLAIMER,
    ].join('\n'),
    html: `<!doctype html><html lang="es-AR"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;color:#1d1640">
      <h1 style="font-size:22px">${escapeHtml(subject)}</h1>
      <p>Hola, ${escapeHtml(greetingName)}.</p><p>${escapeHtml(message)}</p>
      ${refundPending ? `<p>${refund}</p>` : ''}
      <p><a href="${escapeHtml(bookingUrl)}">Ver Mi Reserva</a></p><p>${DISCLAIMER}</p>
    </body></html>`,
  };
}

function flightRows(flight: CancellationSnapshot['cancelled'], showArrival: boolean) {
  const date = toDateInput(new Date(flight.departureAt)).split('-').reverse().join('/');
  const departure = formatTime(flight.departureAt);
  return [
    ['Vuelo', flight.flightCode],
    ['Fecha', date],
    ['Salida', showArrival ? `${departure} → ${formatTime(flight.arrivalAt)}` : departure],
  ] as const;
}

function flightCard(title: string, rows: ReturnType<typeof flightRows> | null, cancelled: boolean) {
  const headingStyle = cancelled ? 'background:#f2f4fc;color:#595783' : 'background:#d9fae6;color:#116735';
  const valueStyle = cancelled ? 'color:#b4234a;text-decoration:line-through' : 'color:#116735';
  const cell = 'padding:7px 10px;border-top:1px solid #d9ddf0;font-size:14px';
  const body = rows?.map(([label, value]) => `
    <tr>
      <th scope="row" style="${cell};font-weight:normal;text-align:left">${label}</th>
      <td style="${cell};font-weight:bold;text-align:right;${valueStyle}">${escapeHtml(value)}</td>
    </tr>`).join('') ?? `<tr><td colspan="2" style="${cell};padding:14px 10px">${NO_ALTERNATIVE}</td></tr>`;

  return `<div class="flight-column" style="display:inline-block;width:100%;max-width:284px;vertical-align:top">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;text-align:left;color:#1d1640">
      <tr><td style="padding:0 5px 8px">
        <table width="100%" cellpadding="0" cellspacing="0" aria-label="${title}" style="border:1px solid #d9ddf0;border-collapse:collapse">
          <tr><th scope="colgroup" colspan="2" style="padding:6px 10px;text-align:left;${headingStyle}">${title}</th></tr>
          ${body}
        </table>
      </td></tr>
    </table>
  </div>`;
}

export function renderFlightCancellationEmail(snapshot: CancellationSnapshot) {
  const { bookingUrl, cancelled, displayCode, greetingName, proposed, reason } = snapshot;
  const status = proposed ? 'REASIGNACIÓN_PROPUESTA' : 'SIN_ALTERNATIVA';
  const intro = proposed
    ? 'Lamentamos informarte que tu vuelo fue cancelado. Ya te reservamos un lugar en el vuelo alternativo más cercano.'
    : 'Lamentamos informarte que tu vuelo fue cancelado. Por el momento no tenemos un vuelo alternativo para tu reserva.';
  const action = proposed
    ? `Si el vuelo propuesto te sirve, no hace falta que hagas nada: lo confirmaremos por vos. Si preferís otro vuelo o cancelar la reserva, comunicate con Atención prioritaria: ${PHONE}.`
    : `Comunicate con Atención prioritaria al ${PHONE} para coordinar otro vuelo o cancelar la reserva.`;
  const cancelledRows = flightRows(cancelled, false);
  const proposedRows = proposed ? flightRows(proposed, true) : null;

  return {
    subject: `${ALERT} — Reserva ${displayCode}`,
    text: [
      ALERT,
      `Hola, ${greetingName}:`,
      intro,
      'Vuelo cancelado',
      ...cancelledRows.map(([label, value]) => `${label}: ${value}`),
      'Vuelo propuesto',
      ...(proposedRows?.map(([label, value]) => `${label}: ${value}`) ?? [NO_ALTERNATIVE]),
      `Reserva ${displayCode} · ${status}`,
      `Motivo oficial: ${reason}`,
      `¿Qué tenés que hacer? ${action} ${SUPPORT}`,
      `Ver Mi Reserva: ${bookingUrl}`,
      FOOTER,
      DISCLAIMER,
    ].join('\n'),
    html: `<!doctype html>
<html lang="es-AR" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${ALERT} — Reserva ${escapeHtml(displayCode)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .flight-column { display:block !important; max-width:none !important; }
        .email-padding { padding-left:16px !important; padding-right:16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:16px;background:#e8eaf4;color:#1d1640;font-family:'Segoe UI',Roboto,Arial,sans-serif">
    <table lang="es-AR" dir="ltr" role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #d9ddf0;border-radius:10px;overflow:hidden">
      <tr><td class="email-padding" style="background:#d81142;color:#fff;padding:14px 24px">
        <div style="font-size:23px;font-weight:bold">AeroGestión <span style="font-size:17px">UNS</span></div>
        <h1 style="margin:3px 0 0;font-size:17px">🚨 ${ALERT}</h1>
      </td></tr>
      <tr><td class="email-padding" style="padding:14px 24px;font-size:14px;line-height:1.5">
        <h2 style="margin:0;color:#2a1060;font-size:22px">Hola, ${escapeHtml(greetingName)}:</h2>
        <p style="margin:0 0 10px;color:#595783">${intro}</p>
        <div style="font-size:0;text-align:center;margin:0 -5px">
          ${flightCard('Vuelo cancelado', cancelledRows, true)}
          ${flightCard('Vuelo propuesto', proposedRows, false)}
        </div>
        <p style="margin:0 0 12px;color:#595783">
          Reserva <strong style="color:#2a1060">${escapeHtml(displayCode)}</strong> ·
          <strong style="display:inline-block;border-radius:12px;padding:2px 8px;background:#ede4fc;color:#5b21b6;font-size:11px">${status}</strong>
        </p>
        <p style="margin:0 0 10px;padding:8px 12px;border:1px solid #ffa8bc;border-radius:7px;background:#ffe4eb;color:#9f1239">
          <strong>Motivo oficial:</strong> ${escapeHtml(reason)}
        </p>
        <p style="margin:0 0 10px;padding:8px 12px;border:1px solid #d9c6ff;border-radius:7px;background:#f5f1fc;color:#3e3865">
          <strong>¿Qué tenés que hacer?</strong>
          ${escapeHtml(action).replace(PHONE, `<a href="tel:08005550199" style="color:#3e3865;font-weight:bold;white-space:nowrap">${PHONE}</a>`)}
          <a href="mailto:${SUPPORT}" style="color:#3e3865;overflow-wrap:anywhere">${SUPPORT}</a>
        </p>
        <a href="${escapeHtml(bookingUrl)}" style="display:block;padding:10px 8px;background:#d81142;color:#fff;text-align:center;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none">Ver Mi Reserva</a>
      </td></tr>
      <tr><td style="padding:8px;background:#f2f4fc;color:#595783;text-align:center;font-size:12px;line-height:1.5">
        ${FOOTER}<br>${DISCLAIMER}
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
