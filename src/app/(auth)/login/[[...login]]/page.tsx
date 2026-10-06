import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';

export default function LoginPage() {
  return (
      <SignIn routing="path" path="/login" signUpUrl="/sign-up"
        fallbackRedirectUrl="/vuelos" appearance={clerkAppearance} />
  );
}
