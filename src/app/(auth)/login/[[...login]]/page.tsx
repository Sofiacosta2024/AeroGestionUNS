import { SignIn } from '@clerk/nextjs';
import AuthShell from '@/components/AuthShell';
import { clerkAppearance } from '@/lib/clerk-appearance';

export default function LoginPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path="/login" signUpUrl="/sign-up"
        fallbackRedirectUrl="/vuelos" appearance={clerkAppearance} />
    </AuthShell>
  );
}