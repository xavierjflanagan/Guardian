import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to the new dashboard page
  redirect('/dashboard');
}