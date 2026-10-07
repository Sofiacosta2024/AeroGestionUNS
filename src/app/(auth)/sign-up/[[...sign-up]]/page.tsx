import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { clerkAppearance } from '@/lib/clerk-appearance';

export default function SignUpPage() {
  return (
    <AuthShell>
      <Link
        href="/login"
        className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[#2E1065] transition-colors hover:bg-purple-50 hover:text-[#E11D48] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_back</span>
        Volver a login
      </Link>
      <SignUp routing="path" path="/sign-up" signInUrl="/login"
        forceRedirectUrl="/" appearance={clerkAppearance} />
    </AuthShell>
  );
}
