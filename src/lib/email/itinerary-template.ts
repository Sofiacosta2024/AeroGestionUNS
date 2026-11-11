import { formatTime, toDateInput } from '../format';
import type { ItineraryLeg, ItinerarySnapshot } from './itinerary-snapshot';
import { escapeHtml } from './receipt-template';

/**
 * Correo de reprogramacion de itinerario (US-06A, WF-06A). Los estilos van inline y la
 * estructura en tablas porque los clientes de correo ignoran las hojas de estilo.
 */

export type ItineraryRow = { label: string; before: string; after: string };

/** dd/mm/aaaa en ART, como en el WF-06A. */
const shortDate = (iso: string) => toDateInput(new Date(iso)).split('-').reverse().join('/');

/**
 * Filas de la tabla Anterior / Nuevo: Fecha, Salida y Llegada siempre, como el WF-06A. Vuelo,
 * Ruta y Aeronave solo si cambian (en la US-12B cambia el vuelo; en la US-11B pueden cambiar
 * la ruta o el avion).
 */
export function itineraryRows(before: ItineraryLeg, after: ItineraryLeg): ItineraryRow[] {
  const ifChanged = (label: string, value: (l: ItineraryLeg) => string): ItineraryRow[] =>
    value(before) === value(after) ? [] : [{ label, before: value(before), after: value(after) }];
  return [
    ...ifChanged('Vuelo', (l) => l.flightCode),
    ...ifChanged('Ruta', (l) => `${l.origin.code} → ${l.destination.code}`),
    { label: 'Fecha', before: shortDate(before.departureAt), after: shortDate(after.departureAt) },
    { label: 'Salida', before: formatTime(before.departureAt), after: formatTime(after.departureAt) },
    { label: 'Llegada', before: formatTime(before.arrivalAt), after: formatTime(after.arrivalAt) },
    ...ifChanged('Aeronave', (l) => l.aircraft),
  ];
}

const FONT = "font-family:'DejaVu Sans','Segoe UI',Roboto,Arial,sans-serif";
const HEAD = 'background:#f2f4fc;color:#6b6990;font-size:10.5px;font-weight:bold;text-align:left;padding:8px 10px';
const CELL = 'padding:9px 10px;border-top:1px solid #e3e6f3;font-size:12px;text-align:left';
const OLD = 'text-decoration:line-through;color:#b4234a';
const NEW = 'color:#15803d;font-weight:bold';
const SAME = 'color:#1d1640';

const INTRO = 'El itinerario de tu reserva cambió. Revisá los nuevos horarios.';
const FOOTER = 'AeroGestión UNS · Terminal BHI Cte. Espora · Bahía Blanca, Argentina';
const DISCLAIMER = 'Mensaje automático, no respondas a esta casilla.';

function rowHtml(r: ItineraryRow): string {
  // Lo que no cambio (ej. la fecha si solo cambio la hora) va sin tachar ni resaltar.
  const changed = r.before !== r.after;
  return (
    `<tr><td style="${CELL};color:#6b6990">${escapeHtml(r.label)}</td>` +
    `<td style="${CELL};${changed ? OLD : SAME}">${escapeHtml(r.before)}</td>` +
    `<td style="${CELL};${changed ? NEW : SAME}">${escapeHtml(r.after)}</td></tr>`
  );
}

export function renderItineraryChangeEmail(snapshot: ItinerarySnapshot) {
  const { greetingName, displayCode, bookingUrl, before, after } = snapshot;
  const rows = itineraryRows(before, after);
  const code = escapeHtml(displayCode);

  return {
    subject: `Reserva ${displayCode} — Tu vuelo fue reprogramado`,
    text: [
      `Hola, ${greetingName}:`,
      INTRO,
      `Código de reserva: ${displayCode}`,
      ...rows.map((r) => `${r.label}: ${r.before === r.after ? r.after : `${r.before} → ${r.after}`}`),
      `Ver Mi Reserva: ${bookingUrl}`,
      FOOTER,
      DISCLAIMER,
    ].join('\n'),
    html:
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Reserva ${code}</title></head>` +
      `<body style="margin:0;padding:16px;background:#e8eaf4;color:#1d1640;${FONT}">` +
      `<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #d9ddf0;border-radius:10px;overflow:hidden">` +
      `<tr><td style="background:#2a1060;color:#fff;padding:14px 24px;font-size:20px;font-weight:bold">AeroGestión<span style="color:#ff4f7b;font-size:13px;margin-left:3px">UNS</span></td></tr>` +
      `<tr><td style="background:#fff3dc;color:#b45309;font-weight:bold;font-size:13px;padding:12px 24px">⚠ Tu vuelo fue reprogramado</td></tr>` +
      `<tr><td style="padding:20px 24px">` +
      `<h2 style="margin:0;font-size:17px;color:#2a1060">Hola, ${escapeHtml(greetingName)}:</h2>` +
      `<p style="margin:3px 0 0;font-size:11.5px;color:#5b5880;line-height:1.45">${INTRO}</p>` +
      `<div style="border:2px dashed #5b3fb5;background:#e6eafd;border-radius:9px;text-align:center;padding:8px;margin-top:12px">` +
      `<div style="font-size:11px;color:#6b6990">Código de reserva</div>` +
      `<span style="display:inline-block;background:#2a1060;color:#fff;font-size:22px;font-weight:bold;letter-spacing:7px;padding:6px 18px 6px 25px;border-radius:7px;margin-top:4px">${code}</span></div>` +
      `<table role="presentation" width="100%" style="margin-top:14px;border:1px solid #d9ddf0;border-collapse:collapse">` +
      `<tr><th style="${HEAD}"></th><th style="${HEAD}">Anterior</th><th style="${HEAD}">Nuevo</th></tr>` +
      rows.map(rowHtml).join('') +
      `</table>` +
      `<a href="${escapeHtml(bookingUrl)}" style="display:block;background:#e11d48;color:#fff;text-align:center;font-weight:bold;border-radius:7px;padding:9px;font-size:12.5px;margin-top:10px;text-decoration:none">Ver Mi Reserva</a>` +
      `</td></tr>` +
      `<tr><td style="background:#f2f4fc;text-align:center;font-size:9.5px;color:#6b6990;padding:7px;line-height:1.5">${FOOTER}<br>${DISCLAIMER}</td></tr>` +
      `</table></body></html>`,
  };
}
