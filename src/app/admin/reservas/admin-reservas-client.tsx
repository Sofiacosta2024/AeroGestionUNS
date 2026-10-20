'use client';

import { useMemo, useState, type FormEvent } from 'react';

const EMPTY_MESSAGE = 'No se encontraron reservas con los criterios de búsqueda ingresados.';
const UNAVAILABLE_MESSAGE = 'No pudimos conectar con el servicio de consultas. Intente nuevamente en unos instantes.';

type User = { name: string; role: string } | null;

type BookingRow = {
  id: string;
  bookingCode: string;
  status: string;
  mainPassenger: string;
  documentNumber: string | null;
  flightCode: string | null;
  departureAt: string | null;
  createdAt: string;
  passengers: Array<{ id: string; firstName: string; lastName: string; documentType: string; documentNumber: string; birthDate: string | null; passengerId: string | null }>;
};

type BookingDetail = {
  id: string;
  bookingCode: string;
  status: string;
  totalAmount: number;
  currency: string;
  contactEmail: string;
  contactPhone: string | null;
  notes: string | null;
  passengers: BookingRow['passengers'];
  flights: Array<{
    id: string;
    flight: { code: string; status: string; route: { originAirport: { iataCode: string }; destinationAirport: { iataCode: string } } };
    fare: { name: string; code: string };
    price: number;
    departureAt: string;
  }>;
};

const statusTone: Record<string, string> = {
  CONFIRMED: 'bg-[#DCF5EA] text-[#0F9D6B]',
  PENDING: 'bg-[#E6ECFF] text-[#2D0F63]',
  CANCELLED: 'bg-[#FFE3EA] text-[#E11D48]',
  PAID: 'bg-[#DCF5EA] text-[#0F9D6B]',
  BOARDED: 'bg-[#FFF4E0] text-[#B45309]',
  COMPLETED: 'bg-[#DCF5EA] text-[#0F9D6B]',
  NO_SHOW: 'bg-[#FFE3EA] text-[#E11D48]',
};

const statusLabel: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  PENDING: 'Pendiente',
  CANCELLED: 'Cancelada',
  PAID: 'Pagada',
  BOARDED: 'Abordaje',
  COMPLETED: 'Completada',
  NO_SHOW: 'No Show',
};

export default function AdminReservasClient({ user }: { user: User }) {
  const [form, setForm] = useState({ bookingCode: '', documentNumber: '', lastName: '', flightCode: '' });
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [history, setHistory] = useState<Array<{ action: string; createdAt: string; metadata?: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = useMemo(
    () => Object.values(form).some((value) => value.trim().length > 0),
    [form],
  );

  async function searchReservations(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSearch) {
      setRows([]);
      setError(EMPTY_MESSAGE);
      return;
    }

    setLoading(true);
    setError(null);
    setDetail(null);

    const params = new URLSearchParams();
    if (form.bookingCode.trim()) params.set('bookingCode', form.bookingCode.trim());
    if (form.documentNumber.trim()) params.set('documentNumber', form.documentNumber.trim());
    if (form.lastName.trim()) params.set('lastName', form.lastName.trim());
    if (form.flightCode.trim()) params.set('flightCode', form.flightCode.trim());

    try {
      const response = await fetch(`/api/v1/admin/reservas?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message || UNAVAILABLE_MESSAGE);
      }

      const data = Array.isArray(body.data) ? body.data : [];
      setRows(data);
      if (!data.length) {
        setError(EMPTY_MESSAGE);
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(row: BookingRow) {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/reservas/${encodeURIComponent(row.bookingCode)}`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message || UNAVAILABLE_MESSAGE);
      }
      setDetail(body.data);
      const histRes = await fetch(`/api/v1/admin/reservas/${encodeURIComponent(row.bookingCode)}/historial`);
      const histBody = await histRes.json().catch(() => null);
      if (histRes.ok && histBody?.ok) setHistory(histBody.data ?? []);
      else setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  async function reemit(type: 'PASAJE' | 'FACTURA', bookingCode: string) {
    const response = await fetch(`/api/v1/admin/reservas/${encodeURIComponent(bookingCode)}/comprobantes?type=${type}`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message || UNAVAILABLE_MESSAGE);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${bookingCode.toLowerCase()}-${type.toLowerCase()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#F7F8FD] px-4 py-8 text-[#1A1038]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[28px] font-black tracking-tight text-[#2D0F63]">Gestión de reservas</div>
          </div>
          <div className="rounded-full bg-[#E6ECFF] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2D0F63]">
            Acceso solo para roles Mostrador y Admin
          </div>
        </div>

        <div className="rounded-[16px] border border-[#D5DDF5] bg-white p-4 shadow-sm">
          <form className="grid gap-4 md:grid-cols-[2fr_1.2fr_1fr_auto]" onSubmit={searchReservations}>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6B8A]">Buscar por código, DNI, apellido o código de vuelo</label>
              <input
                value={form.bookingCode || form.documentNumber || form.lastName || form.flightCode}
                onChange={(e) => setForm({ bookingCode: e.target.value, documentNumber: '', lastName: '', flightCode: '' })}
                placeholder="Ej. AG-7F3K9Q o Rodríguez"
                className="h-10 w-full rounded-lg border border-[#D5DDF5] bg-[#F3F6FF] px-3 text-sm outline-none ring-0 placeholder:text-[#6B6B8A] focus:border-[#2D0F63]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6B8A]">Código de reserva</label>
              <input value={form.bookingCode} onChange={(e) => setForm((prev) => ({ ...prev, bookingCode: e.target.value }))} placeholder="AG-XXXXXX" className="h-10 w-full rounded-lg border border-[#D5DDF5] bg-[#F3F6FF] px-3 text-sm outline-none placeholder:text-[#6B6B8A] focus:border-[#2D0F63]" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6B8A]">DNI</label>
              <input value={form.documentNumber} onChange={(e) => setForm((prev) => ({ ...prev, documentNumber: e.target.value }))} placeholder="38.452.190" className="h-10 w-full rounded-lg border border-[#D5DDF5] bg-[#F3F6FF] px-3 text-sm outline-none placeholder:text-[#6B6B8A] focus:border-[#2D0F63]" />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={loading} className="h-10 w-full rounded-lg bg-[#E11D48] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </form>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6B8A]">Apellido</label>
              <input value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} placeholder="Rodríguez" className="h-10 w-full rounded-lg border border-[#D5DDF5] bg-[#F3F6FF] px-3 text-sm outline-none placeholder:text-[#6B6B8A] focus:border-[#2D0F63]" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6B8A]">Código de vuelo</label>
              <input value={form.flightCode} onChange={(e) => setForm((prev) => ({ ...prev, flightCode: e.target.value }))} placeholder="AG-1420" className="h-10 w-full rounded-lg border border-[#D5DDF5] bg-[#F3F6FF] px-3 text-sm outline-none placeholder:text-[#6B6B8A] focus:border-[#2D0F63]" />
            </div>
            <div className="flex items-end justify-end">
              <button type="button" onClick={() => { setForm({ bookingCode: '', documentNumber: '', lastName: '', flightCode: '' }); setRows([]); setError(null); setDetail(null); }} className="h-10 rounded-lg border border-[#D5DDF5] bg-white px-4 text-sm font-bold text-[#2D0F63]">
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[#F4AFBE] bg-[#FFE3EA] p-3 text-sm text-[#9F1239]">
            {error}
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl border border-[#D5DDF5] bg-white">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="bg-[#F3F6FF] text-[#6B6B8A]">
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">Código</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">Pasajero principal</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">DNI</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">Vuelo</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">Fecha</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">Estado</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[0.08em]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[#6B6B8A]">
                    {loading ? 'Buscando reservas...' : 'Sin resultados'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#E3E8F8] align-middle">
                    <td className="px-3 py-3 font-bold text-[#2D0F63]">{row.bookingCode}</td>
                    <td className="px-3 py-3">{row.mainPassenger}</td>
                    <td className="px-3 py-3">{row.documentNumber || '—'}</td>
                    <td className="px-3 py-3">{row.flightCode || '—'}</td>
                    <td className="px-3 py-3">{row.departureAt ? new Date(row.departureAt).toLocaleDateString('es-AR') : '—'}</td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${statusTone[row.status] ?? 'bg-[#E6ECFF] text-[#2D0F63]'}`}>{statusLabel[row.status] ?? row.status}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openDetail(row)} className="rounded-md bg-[#E6ECFF] px-2 py-1 text-[11px] font-bold text-[#2D0F63]">Ver Detalle</button>
                        <button type="button" onClick={() => reemit('PASAJE', row.bookingCode)} className="rounded-md bg-[#E6ECFF] px-2 py-1 text-[11px] font-bold text-[#2D0F63]">Pase</button>
                        <button type="button" onClick={() => reemit('FACTURA', row.bookingCode)} className="rounded-md bg-[#E6ECFF] px-2 py-1 text-[11px] font-bold text-[#2D0F63]">Factura</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {detail && (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <section className="rounded-xl border border-[#D5DDF5] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#2D0F63]">Detalle de reserva {detail.bookingCode}</h2>
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${statusTone[detail.status] ?? 'bg-[#E6ECFF] text-[#2D0F63]'}`}>{statusLabel[detail.status] ?? detail.status}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-[#F3F6FF] p-3"><div className="text-[10px] uppercase text-[#6B6B8A]">Contacto</div><div className="mt-1 font-semibold">{detail.contactEmail}</div></div>
                <div className="rounded-lg bg-[#F3F6FF] p-3"><div className="text-[10px] uppercase text-[#6B6B8A]">Monto total</div><div className="mt-1 font-semibold">${detail.totalAmount.toLocaleString('es-AR')}</div></div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6B8A]">Pasajeros</div>
                <div className="space-y-2">
                  {detail.passengers.map((passenger) => (
                    <div key={passenger.id} className="rounded-lg border border-[#D5DDF5] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-[#2D0F63]">{passenger.firstName} {passenger.lastName}</div>
                        <div className="text-[10px] uppercase text-[#6B6B8A]">{passenger.documentType}</div>
                      </div>
                      <div className="mt-1 text-sm text-[#4A4A5F]">{passenger.documentNumber}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="rounded-xl border border-[#D5DDF5] bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-lg font-bold text-[#2D0F63]">Historial</h3>
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="rounded-lg bg-[#F3F6FF] p-3 text-sm text-[#6B6B8A]">No hay historial disponible.</div>
                ) : (
                  history.map((item, index) => (
                    <div key={`${item.action}-${index}`} className="rounded-lg border border-[#D5DDF5] p-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#6B6B8A]">{item.action}</div>
                      <div className="mt-1 text-sm font-medium text-[#2D0F63]">{new Date(item.createdAt).toLocaleString('es-AR')}</div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
