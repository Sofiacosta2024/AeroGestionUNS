import { SignIn } from '@clerk/nextjs';
import AuthShell from '@/components/AuthShell';
import { clerkAppearance } from '@/lib/clerk-appearance';

export default function LoginPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path="/login" signUpUrl="/sign-up"
        fallbackRedirectUrl="/vuelos" appearance={clerkAppearance} />
      {/* Salida publica: /reserva esta en isPublic (middleware), no pide sesion. */}
      <p className="pt-2 text-center">
        <a
          className="font-label-md text-label-md text-secondary hover:underline underline-offset-4"
          href="/reserva"
        >
          Consultar reserva sin iniciar sesión
        </a>
      </p>
    </AuthShell>
  );
}