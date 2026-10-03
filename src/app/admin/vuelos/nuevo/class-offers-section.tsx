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
  const inputClass = `w-full rounded-lg font-headline-sm text-headline-sm font-bold border-0 focus:ring-2 focus:ring-secondary/30 ${
    dark ? 'bg-primary text-surface-container-lowest' : 'bg-surface-container-lowest text-primary'
  }`;
  const mutedText = dark ? 'text-primary-fixed-dim' : 'text-on-surface-variant';

  return (
    <div
      className={`rounded-xl p-space-lg flex flex-col gap-space-md shadow-sm ${
        dark ? 'bg-primary-container text-surface-container-lowest' : 'bg-surface-container-low'
      }`}
    >
      <div className="flex items-center justify-between border-b border-surface-container/40 pb-space-sm">
        <div className="flex flex-col">
          <h3 className={`font-headline-sm text-headline-sm font-bold ${dark ? '' : 'text-primary'}`}>{fareClass.name}</h3>
          <span className={`font-code-telemetry text-code-telemetry text-xs ${dark ? 'text-secondary-fixed' : 'text-secondary'}`}>
            {fareClass.code} · Cabina {CABIN_LABEL[fareClass.cabinClass]}
          </span>
        </div>
      </div>

      {fareClass.benefits.length > 0 && (
        <ul className="flex flex-col gap-space-xs">
          {fareClass.benefits.map((b) => {
            const [icon, ...text] = b.split('|');
            return (
              <li key={b} className={`flex items-center gap-1 font-body-sm text-body-sm ${mutedText}`}>
                {text.length > 0 && <span className="material-symbols-outlined text-[16px]">{icon}</span>}
                {text.length > 0 ? text.join('|') : icon}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-space-sm">
        <label className={`flex flex-col gap-space-xs font-label-sm text-label-sm uppercase ${mutedText}`}>
          Asientos a vender
          <input
            className={`${inputClass} px-space-md py-3`}
            max={cabinSeats}
            min={1}
            onChange={(e) => onChange({ seats: e.target.value })}
            placeholder={cabinSeats !== undefined ? `máx. ${cabinSeats}` : ''}
            type="number"
            value={offer.seats}
          />
        </label>
        <label className={`flex flex-col gap-space-xs font-label-sm text-label-sm uppercase ${mutedText}`}>
          Precio (ARS)
          <input
            className={`${inputClass} px-space-md py-3`}
            min={1}
            onChange={(e) => onChange({ price: e.target.value })}
            type="number"
            value={offer.price}
          />
        </label>
      </div>

      <div className={`flex items-center justify-between font-body-sm text-body-sm ${mutedText}`}>
        <span>Precio de catálogo: {formatArs(fareClass.basePrice)}</span>
        {priceChanged && (
          <button className="underline" onClick={() => onChange({ price: String(fareClass.basePrice) })} type="button">
            Restablecer
          </button>
        )}
      </div>
    </div>
  );
}
