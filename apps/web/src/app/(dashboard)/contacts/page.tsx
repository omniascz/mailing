import Link from 'next/link';
import { Users, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { NewContactButton } from './new-contact-button';
import { ContactsTable, type ContactRow } from './contacts-table';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ContactListResponse {
  data: ContactRow[];
  cursor: string | null;
  hasMore: boolean;
}

interface ListLite {
  id: string;
  name: string;
  liveContactCount: number;
}

interface TagLite {
  id: string;
  name: string;
  color: string | null;
}

export const dynamic = 'force-dynamic';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.cursor) qs.set('cursor', params.cursor);
  qs.set('limit', '50');

  // Contacts route returns { data, cursor, hasMore } at the top level, not
  // wrapped in `{ data: ... }` — so the apiFetch generic unwraps the
  // outer-data already. Wire the typed response directly. Lists + tags
  // are preloaded so bulk pickers are populated server-side.
  const [res, lists, tags] = await Promise.all([
    apiFetch<ContactListResponse | ContactRow[]>(`/api/v1/contacts?${qs.toString()}`, {
      fallback: { data: [], cursor: null, hasMore: false },
    }),
    apiFetch<ListLite[]>('/api/v1/lists', { fallback: [] }),
    apiFetch<TagLite[]>('/api/v1/tags', { fallback: [] }),
  ]);
  const contacts: ContactRow[] = Array.isArray(res) ? res : res.data;
  const hasMore = Array.isArray(res) ? false : res.hasMore;
  const nextCursor = Array.isArray(res) ? null : res.cursor;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Contacts</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Everyone in your audience — imported, synced from integrations, or captured via signup
            forms.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/contacts/import"
            className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
          >
            Import CSV
          </Link>
          <a
            href={`${API_BASE}/api/v1/contacts/export.csv`}
            className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
          >
            Export CSV
          </a>
          <NewContactButton />
        </div>
      </header>

      <form className="mb-4" action="/contacts" method="GET">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
          <input
            type="text"
            name="search"
            defaultValue={params.search ?? ''}
            placeholder="Search by email, name, or phone"
            className="h-10 w-full max-w-md rounded-md border border-secondary-300 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </form>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">
              {params.search ? 'No contacts match' : 'No contacts yet'}
            </p>
            <p className="mt-1 text-sm text-secondary-500">
              {params.search
                ? 'Try a different search.'
                : 'Import a CSV, connect an integration, or wire up a signup form.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ContactsTable
            contacts={contacts}
            lists={lists.map((l) => ({ id: l.id, name: l.name }))}
            tags={tags}
          />
          {hasMore && nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Link
                href={`/contacts?${new URLSearchParams({
                  ...(params.search ? { search: params.search } : {}),
                  cursor: nextCursor,
                }).toString()}`}
                className="rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
              >
                Load more
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
