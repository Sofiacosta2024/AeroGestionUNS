import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/** Raiz: los visitantes van al portal de autenticacion. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? '/vuelos' : '/login');
}
