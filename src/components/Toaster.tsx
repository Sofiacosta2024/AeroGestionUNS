'use client';
import { Toaster } from 'react-hot-toast';

/**
 * Alerta flotante global del area de reservas (US-05).
 *
 * Se monta una sola vez en el layout de (booking) y cualquier pantalla puede
 * dispararla con `toast.error(...)`. Sin boton de cierre: se va sola a los 5 s,
 * que es el mismo limite que tiene la descarga del comprobante.
 */
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 5000,
        error: {
          style: {
            background: '#ab0030',
            color: '#fff',
            fontSize: '13px',
            lineHeight: '1.5',
            borderRadius: '10px',
            padding: '12px 16px',
            maxWidth: '480px',
            boxShadow: '0 12px 32px rgba(23, 0, 64, 0.28)',
          },
          ariaProps: { role: 'alert', 'aria-live': 'assertive' },
        },
      }}
    />
  );
}
