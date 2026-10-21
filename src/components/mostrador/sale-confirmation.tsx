'use client';
import { useState } from 'react';
import type { CounterSaleResult } from '@/lib/mostrador/types';
import { formatExactArs as formatArs } from '@/lib/format';
export function SaleConfirmation({ sale, onNewSale }: { sale: CounterSaleResult; onNewSale: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function document(kind: 'pasaje' | 'factura', print: boolean) {
    const popup = print ? window.open('', '_blank') : null;
    if (print && !popup) { setError('Permití las ventanas emergentes para imprimir. También podés descargar el PDF.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/v1/reservas/${encodeURIComponent(sale.bookingCode)}/comprobantes/${kind}`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('PDF no disponible');
      const url = URL.createObjectURL(await response.blob());
      if (popup) {
        popup.document.title = `${kind} ${sale.displayCode}`;
        const frame = popup.document.createElement('iframe'); frame.title = kind;
        frame.style.cssText = 'border:0;width:100%;height:100vh'; frame.src = url;
        frame.onload = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { /* El visor PDF ofrece su propio botón de impresión. */ } };
        popup.document.body.style.margin = '0'; popup.document.body.append(frame);
        const timer = window.setInterval(() => { if (popup.closed) { URL.revokeObjectURL(url); window.clearInterval(timer); } }, 1000);
      } else {
        const a = window.document.createElement('a'); a.href = url; a.download = `${kind}_${sale.displayCode}.pdf`; a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch { popup?.close(); setError('Error al generar el comprobante. Por favor reintente la descarga o consulte su reserva.'); }
    finally { setBusy(false); }
  }
  return <section className="counter-panel counter-success" role="status"><h2>¡Venta completada con éxito! Código de reserva: {sale.displayCode}</h2>
    <p>Total abonado: <strong>{formatArs(sale.totalAmount)} {sale.currency}</strong></p><p>{sale.email.message}</p>
    <div className="counter-actions">{(['pasaje', 'factura'] as const).map(kind => <div key={kind}>
      <button type="button" disabled={busy} onClick={() => void document(kind, false)}>Descargar {kind} PDF</button>
      <button type="button" disabled={busy} onClick={() => void document(kind, true)}>Imprimir {kind}</button>
    </div>)}</div>{error && <p className="counter-error" role="alert">{error}</p>}
    <button type="button" className="counter-primary" onClick={onNewSale}>Nueva venta</button>
  </section>;
}
