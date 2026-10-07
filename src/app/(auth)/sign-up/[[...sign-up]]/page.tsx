import { SignUp } from '@clerk/nextjs';
import AuthShell from '@/components/AuthShell';
import { clerkAppearance } from '@/lib/clerk-appearance';

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp routing="path" path="/sign-up" signInUrl="/login"
        forceRedirectUrl="/" appearance={clerkAppearance} />
    </AuthShell>
  );
}
