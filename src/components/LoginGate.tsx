'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import LoginLoading from './LoginLoading';

export default function LoginGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClerkLoading>
        <LoginLoading />
      </ClerkLoading>
      <ClerkLoaded>{children}</ClerkLoaded>
    </>
  );
}
