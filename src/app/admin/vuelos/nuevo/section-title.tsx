/** Titulo numerado de cada tarjeta del formulario, como en el diseno de Stitch. */
export default function SectionTitle({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-space-sm border-b border-surface-container-high pb-space-sm">
      <span className="w-7 h-7 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center font-bold text-sm shrink-0">
        {number}
      </span>
      <div>
        <h2 className="font-headline-md text-headline-md text-primary">{title}</h2>
        {subtitle && <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>}
      </div>
    </div>
  );
}
