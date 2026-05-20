import Link from 'next/link';
import { Mail } from 'lucide-react';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-secondary-900">
      <header className="border-b border-secondary-200 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/landing" className="flex items-center gap-2 font-semibold">
            <Mail className="h-5 w-5 text-primary-600" />
            Mailforge
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-secondary-600 hover:text-secondary-900">
              Ceny
            </Link>
            <Link href="/login" className="text-secondary-600 hover:text-secondary-900">
              Přihlásit se
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-primary-600 px-3 py-1.5 text-white hover:bg-primary-700"
            >
              Vyzkoušet zdarma
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-secondary-200 bg-secondary-50">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-secondary-500">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} Mailforge. Hosting v EU.</p>
            <div className="flex gap-4">
              <Link href="/pricing" className="hover:text-secondary-900">
                Ceník
              </Link>
              <a href="mailto:hello@mailforge.cz" className="hover:text-secondary-900">
                hello@mailforge.cz
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
