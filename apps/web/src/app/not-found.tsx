import Link from 'next/link';
import { Compass, ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Stránka nenalezena — Mailforge' };

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary-50 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white text-primary-600 ring-1 ring-secondary-200">
          <Compass className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium uppercase tracking-wider text-primary-600">404</p>
        <h1 className="mt-2 text-3xl font-semibold text-secondary-900">Tady to nikam nevede.</h1>
        <p className="mt-3 text-sm text-secondary-600">
          Stránku jsme nenašli. Možná ji někdo přejmenoval, smazal, nebo jste sem dorazili ze
          zastaralého odkazu.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Zpět na dashboard
        </Link>
      </div>
    </div>
  );
}
