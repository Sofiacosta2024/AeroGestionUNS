import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ params }: { params: Promise<{ login?: string[] }> }) {
  const { login } = await params;
  if (!login?.length) return <LoginForm />;
  return (
<<<<<<< HEAD
      <SignIn routing="path" path="/login/clerk" signUpUrl="/sign-up"
        forceRedirectUrl="/" appearance={clerkAppearance} />
=======
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
>>>>>>> SofiBrianAnge
  );
}
