import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';
import LoginForm from '@/components/LoginForm';
import AuthShell from '@/components/AuthShell';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';
import PublicReservaLink from '@/components/PublicReservaLink';
import { CLERK_SIGN_IN_PATH } from '@/lib/auth-routes';

export default async function LoginPage({ params }: { params: Promise<{ login?: string[] }> }) {
  const { login } = await params;
  // El login propio (`/login`) y los pasos de Clerk (`/login/clerk`) ofrecen la
  // misma salida publica hacia la consulta de reservas.
  if (!login?.length) {
    return (
      <>
        <LoginForm />
        <PublicReservaLink />
      </>
    );
  }
  if (login.length === 1 && login[0] === 'recuperar-clave') return <ForgotPasswordForm />;
  return (
    <AuthShell>
      <SignIn
        routing="path"
        path={CLERK_SIGN_IN_PATH}
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        forceRedirectUrl="/"
        appearance={clerkAppearance}
      />
      {/* Salida publica: /reserva esta en isPublic (middleware), no pide sesion. */}
      <PublicReservaLink />
    </AuthShell>
  );
}
