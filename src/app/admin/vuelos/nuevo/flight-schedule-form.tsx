'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FormRoute, ScheduleFormData } from '@/lib/scheduling/form-data';
import type { SerializedSchedule } from '@/lib/scheduling/serializers';
import { ApiRequestError, apiRequest, detailMessages } from '../../api-client';
import CheckPanel from './check-panel';
import ClassOffersSection from './class-offers-section';
import { ActionBar, PublishedPanel } from './form-actions';
import {
  arrivalPreview,
  findRoute,
  initialFormState,
  plannedFlightsCount,
  toScheduleInput,
  type FormState,
  type OfferDraft,
} from './form-model';
import RouteSummary from './route-summary';
import ScheduleSection from './schedule-section';
import { useScheduleCheck } from './use-schedule-check';

type Props = {
  data: ScheduleFormData;
  draft: SerializedSchedule | null;
};

type Feedback = {
  tone: 'success' | 'error';
  message: string;
  details: string[];
  link?: { href: string; label: string };
};

const NEW_FORM_URL = '/admin/vuelos/nuevo';

/**
 * Pantalla de alta y publicacion de vuelos (RF-01). Coordina el estado del formulario,
 * el chequeo en vivo y el guardado; las secciones solo pintan.
 */
export default function FlightScheduleForm({ data, draft }: Props) {
  const [routes, setRoutes] = useState(data.routes);
  const [form, setForm] = useState<FormState>(() => initialFormState(data, draft));
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [submitting, setSubmitting] = useState<'draft' | 'publish' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [published, setPublished] = useState<SerializedSchedule | null>(null);

  const route = findRoute(routes, form.origin, form.destination);
  const aircraft = data.aircraft.find((a) => a.id === form.aircraftId) ?? null;
  const input = useMemo(() => toScheduleInput(form, route), [form, route]);
  const check = useScheduleCheck(input);
  const canSubmit = input !== null && check.result?.canSave === true && !check.loading;

  const update = (patch: Partial<FormState>) => {
    setFeedback(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const updateOffer = (fareId: string, patch: Partial<OfferDraft>) => {
    setFeedback(null);
    setForm((f) => ({ ...f, offers: { ...f.offers, [fareId]: { ...f.offers[fareId]!, ...patch } } }));
  };
  const addRoute = (created: FormRoute) => setRoutes((rs) => [...rs, created]);

  async function save(publish: boolean) {
    if (!input) return;
    setSubmitting(publish ? 'publish' : 'draft');
    setFeedback(null);
    try {
      let schedule: SerializedSchedule;
      if (draftId) {
        schedule = await apiRequest<SerializedSchedule>('PUT', `/api/flight-schedules/${draftId}`, input);
        if (publish) {
          schedule = await apiRequest<SerializedSchedule>('POST', `/api/flight-schedules/${draftId}/publish`);
        }
      } else {
        schedule = await apiRequest<SerializedSchedule>('POST', '/api/flight-schedules', { ...input, publish });
      }

      if (publish) {
        setPublished(schedule);
        window.history.replaceState(null, '', NEW_FORM_URL);
      } else {
        // El formulario queda vacio para cargar otro vuelo; el borrador se retoma desde la planilla.
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setFeedback({
          tone: 'success',
          message: 'Borrador guardado. No es visible en el buscador hasta que se publique. Ya podés cargar otro vuelo.',
          details: [],
          link: { href: '/admin/itinerario#borradores', label: 'Ver borradores' },
        });
      }
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo guardar',
        details: err instanceof ApiRequestError ? detailMessages(err.details) : [],
      });
    } finally {
      setSubmitting(null);
    }
  }

  /** Deja el formulario como recien abierto (equivale a recargar la pagina). */
  function resetForm() {
    setPublished(null);
    setDraftId(null);
    setFeedback(null);
    setForm(initialFormState(data, null));
    window.history.replaceState(null, '', NEW_FORM_URL);
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-space-lg lg:px-margin pt-space-lg flex flex-col gap-space-lg">
      <PageIntro isDraft={draftId !== null} />
      {feedback?.tone === 'success' && <FeedbackBanner feedback={feedback} />}

      {published ? (
        <PublishedPanel onNew={resetForm} schedule={published} />
      ) : (
        <>
          <RouteSummary
            aircraft={aircraft}
            destination={data.airports.find((a) => a.iataCode === form.destination) ?? null}
            origin={data.airports.find((a) => a.iataCode === form.origin) ?? null}
            route={route}
          />
          <ScheduleSection
            aircraft={data.aircraft}
            airports={data.airports}
            arrival={arrivalPreview(form.departureTime, route?.durationMinutes)}
            form={form}
            onChange={update}
            onRouteCreated={addRoute}
            plannedCount={plannedFlightsCount(form)}
            route={route}
            rules={data.rules}
            today={data.today}
          />
          <ClassOffersSection aircraft={aircraft} classes={data.classes} offers={form.offers} onOfferChange={updateOffer} />
          <CheckPanel check={check} ready={input !== null} />
          {feedback?.tone === 'error' && <FeedbackBanner feedback={feedback} />}
          <ActionBar
            canSubmit={canSubmit}
            flightsCount={check.result?.flightsCount ?? plannedFlightsCount(form)}
            isDraft={draftId !== null}
            onPublish={() => save(true)}
            onSaveDraft={() => save(false)}
            submitting={submitting}
          />
        </>
      )}
    </div>
  );
}

function PageIntro({ isDraft }: { isDraft: boolean }) {
  return (
    <div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-lg rounded-xl shadow-md">
      <div className="flex flex-wrap items-center gap-space-xs font-label-md text-label-md text-on-surface-variant">
        <span>Administración</span>
        <span className="text-outline-variant">/</span>
        <span>Programación de vuelos</span>
        <span className="text-outline-variant">/</span>
        <span className="text-secondary font-bold">Alta y publicación</span>
        {isDraft && (
          <span className="ml-space-sm bg-surface-container-high text-primary px-space-sm py-0.5 rounded-full font-label-sm text-label-sm uppercase">
            Borrador
          </span>
        )}
      </div>
      <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
        Alta y publicación de vuelos <span className="font-headline-sm text-headline-sm text-secondary font-bold">(Rol Admin)</span>
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
        Configurá ruta, horario, capacidad por clase y precios. Los choques de horario se verifican mientras cargás.
      </p>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  const tone =
    feedback.tone === 'success' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-error-container text-on-error-container';
  return (
    <div className={`flex flex-col gap-space-xs p-space-md rounded-xl font-label-md text-label-md ${tone}`} role="alert">
      <span className="font-bold">{feedback.message}</span>
      {feedback.link && (
        <Link className="underline font-bold w-fit" href={feedback.link.href}>
          {feedback.link.label}
        </Link>
      )}
      {feedback.details.length > 0 && (
        <ul className="list-disc pl-5 font-body-sm text-body-sm">
          {feedback.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
