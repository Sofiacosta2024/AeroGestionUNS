import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ params }: { params: Promise<{ login?: string[] }> }) {
  const { login } = await params;
  if (!login?.length) return <LoginForm />;
  return (
      <SignIn routing="path" path="/login/clerk" signUpUrl="/sign-up"
        forceRedirectUrl="/" appearance={clerkAppearance} />
  );
}
