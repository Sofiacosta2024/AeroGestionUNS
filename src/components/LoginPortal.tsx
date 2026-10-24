'use client'

import AuthShell from './AuthShell';

export default function LoginPortal({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
