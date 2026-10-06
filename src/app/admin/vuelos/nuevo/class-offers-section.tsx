'use client';

import type { CabinClass } from '@prisma/client';
import { formatArs } from '@/lib/format';
import { CABIN_LABEL, summarizeCabins } from '@/lib/scheduling/capacity';
import type { FormAircraft, FormClass } from '@/lib/scheduling/form-data';
import type { OfferDraft } from './form-model';
import SectionTitle from './section-title';

type Props = {
  classes: FormClass[];
  aircraft: FormAircraft | null;
  offers: Record<string, OfferDraft>;
  onOfferChange: (fareId: string, patch: Partial<OfferDraft>) => void;
};

const toSeats = (raw: string) => (Number.isFinite(Number(raw)) ? Number(raw) : 0);

/**
 * Card 2 del diseno: asientos y precio por clase (RF-01, US2). Las clases se agrupan por
 * cabina: Economy y Economy Premium comparten la cabina Economy y su tope es comun.
 */
export default function ClassOffersSection({ classes, aircraft, offers, onOfferChange }: Props) {
  const usage = summarizeCabins(
    classes.map((c) => ({ fareId: c.id, price: 0, seats: toSeats(offers[c.id]?.seats ?? '') })),
    classes,
    aircraft?.cabins ?? {},
  );

  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-lg">
      <SectionTitle
        number={2}
        subtitle={
          aircraft
            ? `Aeronave asignada: ${aircraft.model} ${aircraft.registration} (${aircraft.totalSeats} asientos)`
            : 'Elegí un avión para ver los asientos disponibles por cabina.'
        }
        title="Capacidad de cabina y configuración tarifaria"
      />

      {usage.map((cabin) => {
        const cabinClasses = classes.filter((c) => c.cabinClass === cabin.cabinClass);
        const free = cabin.seats - cabin.assigned;
        return (
          <div key={cabin.cabinClass} className="flex flex-col gap-space-sm">
            <div className="flex flex-wrap items-center justify-between gap-space-xs">
              <span className="font-label-md text-label-md text-on-surface font-bold">
                Cabina {CABIN_LABEL[cabin.cabinClass]}
                {cabinClasses.length > 1 && ` · compartida por ${cabinClasses.map((c) => c.name).join(' y ')}`}
              </span>
              {aircraft && (
                <span
                  className={`px-space-sm py-1 rounded font-code-telemetry text-code-telemetry ${
                    free < 0 ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-primary'
                  }`}
                >
                  {cabin.seats} asientos · asignados {cabin.assigned} · {free < 0 ? `excedido en ${-free}` : `libres ${free}`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
              {cabinClasses.map((c) => (
                <ClassCard
                  key={c.id}
                  cabinSeats={aircraft?.cabins[c.cabinClass]}
                  fareClass={c}
                  offer={offers[c.id] ?? { seats: '', price: '' }}
                  onChange={(patch) => onOfferChange(c.id, patch)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

type CardProps = {
  fareClass: FormClass;
  offer: OfferDraft;
  cabinSeats: number | undefined;
  onChange: (patch: Partial<OfferDraft>) => void;
};

/** Primera Clase va en la tarjeta oscura del diseno; las clases de Economy, en la clara. */
const isPremiumCabin = (cabin: CabinClass) => cabin === 'FIRST' || cabin === 'BUSINESS';

function ClassCard({ fareClass, offer, cabinSeats, onChange }: CardProps) {
  const dark = isPremiumCabin(fareClass.cabinClass);
  const priceChanged = offer.price !== '' && Number(offer.price) !== fareClass.basePrice;
  const inputClass = `w-full rounded-xl font-bold text-base border transition-all focus:outline-none focus:ring-2 focus:ring-[#E11D48]/25 ${
    dark
      ? 'bg-[#180938] border-purple-400/30 text-white focus:border-[#E11D48]'
      : 'bg-white border-slate-200 text-slate-800 focus:border-[#E11D48] shadow-sm'
  }`;
  const mutedText = dark ? 'text-purple-200/80' : 'text-slate-500';

  return (
    <div
      className={`rounded-2xl p-space-lg flex flex-col gap-space-md border transition-all ${
        dark
          ? 'bg-[#1F0A43] border-purple-900/60 text-surface-container-lowest shadow-lg shadow-purple-950/20'
          : 'bg-slate-50/70 border-slate-200/80 shadow-sm'
      }`}
    >
      <div className={`flex items-center justify-between border-b pb-space-sm ${dark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="flex flex-col">
          <h3 className={`font-headline-sm text-headline-sm font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{fareClass.name}</h3>
          <span className={`font-mono text-xs font-bold ${dark ? 'text-secondary-fixed' : 'text-[#E11D48]'}`}>
            {fareClass.code} · Cabina {CABIN_LABEL[fareClass.cabinClass]}
          </span>
        </div>
      </div>

      {fareClass.benefits.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {fareClass.benefits.map((b) => {
            const [icon, ...text] = b.split('|');
            return (
              <li key={b} className={`flex items-center gap-1.5 text-xs font-medium ${mutedText}`}>
                {text.length > 0 && <span className="material-symbols-outlined text-[16px] text-[#E11D48]">{icon}</span>}
                <span>{text.length > 0 ? text.join('|') : icon}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-space-sm pt-1">
        <label className={`flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider ${mutedText}`}>
          <span>Asientos a vender</span>
          <div className="relative flex items-center">
            <input
              className={`${inputClass} px-3.5 py-2.5 pr-14`}
              max={cabinSeats}
              min={1}
              onChange={(e) => onChange({ seats: e.target.value })}
              placeholder={cabinSeats !== undefined ? `máx. ${cabinSeats}` : ''}
              type="number"
              value={offer.seats}
            />
            <span className={`absolute right-3 text-[11px] font-semibold pointer-events-none ${dark ? 'text-purple-300' : 'text-slate-400'}`}>
              butacas
            </span>
          </div>
        </label>
        <label className={`flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider ${mutedText}`}>
          <span>Precio por pasaje</span>
          <div className="relative flex items-center">
            <span className={`absolute left-3 text-xs font-bold pointer-events-none ${dark ? 'text-purple-300' : 'text-slate-400'}`}>
              $
            </span>
            <input
              className={`${inputClass} pl-7 pr-3.5 py-2.5`}
              min={1}
              onChange={(e) => onChange({ price: e.target.value })}
              type="number"
              value={offer.price}
            />
          </div>
        </label>
      </div>

      <div className={`flex items-center justify-between text-xs pt-1 ${mutedText}`}>
        <span>Base catálogo: <b className="font-mono">{formatArs(fareClass.basePrice)}</b></span>
        {priceChanged && (
          <button
            className="text-[#E11D48] hover:text-[#BE123C] font-bold text-xs bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md hover:bg-rose-100 transition-colors"
            onClick={() => onChange({ price: String(fareClass.basePrice) })}
            type="button"
          >
            Restablecer precio
          </button>
        )}
      </div>
    </div>
  );
}
