import { formatFullDate, formatTime } from '../format';
import type { ReceiptSnapshot } from './types';
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function renderReceiptEmail(snapshot: ReceiptSnapshot) {
  const { documents, displayCode, greetingName } = snapshot;
  const rows = documents.passes.map(p => [
    `${p.flightCode} · ${p.origin.code} → ${p.destination.code}`,
    `${formatFullDate(p.departureAt)} · ${formatTime(p.departureAt)} → ${formatTime(p.arrivalAt)} (ART)`,
    `${p.passengerName} · ${p.seat} · ${p.cabinClass}`,
  ]);
  const filenames = [`Pasaje_${displayCode}.pdf`, `Factura_${displayCode}.pdf`];
  const footer = 'AeroGestión UNS · Terminal BHI Cte. Espora · Bahía Blanca, Argentina';
  const disclaimer = 'Proyecto universitario. El comprobante no es una factura fiscal. Este es un mensaje automático, no respondas a esta casilla.';
  return {
    subject: `Reserva ${displayCode} — Pasaje y factura`,
    text: [`Hola, ${greetingName}:`, 'Tu reserva está confirmada.', `Código de reserva: ${displayCode}`,
      ...rows.flat(), 'Archivos adjuntos', ...filenames, footer, disclaimer].join('\n'),
    html: `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reserva ${escapeHtml(displayCode)}</title></head><body style="margin:0;background:#eef0fa;color:#20113e;font-family:Arial,sans-serif;padding:16px"><table role="presentation" style="width:100%;max-width:680px;margin:auto;border-collapse:collapse;background:#fff"><tr><td style="background:#2e1065;color:white;padding:28px"><h1 style="margin:0;font-size:26px">AeroGestión <span style="color:#ff5179">UNS</span></h1><p>Sistema de gestión aérea</p></td></tr><tr><td style="padding:28px"><h2>Hola, ${escapeHtml(greetingName)}:</h2><p>Tu reserva está confirmada. Este es tu código para consultar o reprogramar tu vuelo.</p><div style="border:2px dashed #2e1065;background:#efedff;text-align:center;padding:20px"><p>Código de reserva</p><strong style="font-size:32px;letter-spacing:5px">${escapeHtml(displayCode)}</strong></div><h3>Resumen del itinerario</h3>${rows.map(row => `<div style="border:1px solid #dedbf2;padding:12px;margin-bottom:12px">${row.map(v => `<p style="line-height:1.5">${escapeHtml(v)}</p>`).join('')}</div>`).join('')}<h3>Archivos adjuntos</h3>${filenames.map(f => `<p style="padding:14px;background:#f5f4ff">PDF · ${escapeHtml(f)}</p>`).join('')}</td></tr><tr><td style="padding:24px;background:#f5f4ff;font-size:12px;line-height:1.6">${footer}<br>${disclaimer}</td></tr></table></body></html>`,
  };
}
