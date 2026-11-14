import { redirect } from 'next/navigation';

export default function Page() {
  // Redirect admin login requests to the user login page.
  // Keeps route available but prevents a separate admin login UI.
  redirect('/login');
}
