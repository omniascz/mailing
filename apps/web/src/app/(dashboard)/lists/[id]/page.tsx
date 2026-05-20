import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock, ExternalLink, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { DeleteListButton } from './delete-list-button';
import { EditListButton } from './edit-list-button';
import { AddMemberByEmail } from './add-member-by-email';
import { RemoveMemberButton } from './remove-member-button';

interface ListDetail {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  liveContactCount: number;
  doubleOptIn: number;
  thankYouUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  createdAt: string;
}

interface ContactListResponse {
  data: ContactRow[];
  hasMore: boolean;
}

export const dynamic = 'force-dynamic';

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [list, membersRes] = await Promise.all([
    apiFetch<ListDetail | null>(`/api/v1/lists/${id}`, { fallback: null }),
    apiFetch<ContactListResponse | ContactRow[]>(`/api/v1/contacts?list_id=${id}&limit=50`, {
      fallback: { data: [], hasMore: false },
    }),
  ]);
  if (!list) notFound();
  const members: ContactRow[] = Array.isArray(membersRes) ? membersRes : membersRes.data;
  const hasMore = Array.isArray(membersRes) ? false : membersRes.hasMore;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/lists"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to lists
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-secondary-900">{list.name}</h1>
            {list.doubleOptIn ? (
              <Badge variant="primary">
                <Lock className="mr-1 h-3 w-3" />
                Double opt-in
              </Badge>
            ) : null}
          </div>
          {list.description ? (
            <p className="mt-2 max-w-2xl text-sm text-secondary-600">{list.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-secondary-500">
            Created {new Date(list.createdAt).toLocaleDateString('cs-CZ')} · Updated{' '}
            {new Date(list.updatedAt).toLocaleDateString('cs-CZ')}
          </p>
        </div>
        <div className="flex gap-2">
          <EditListButton list={list} />
          <DeleteListButton id={list.id} name={list.name} />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Active subscribers" value={list.liveContactCount.toLocaleString('cs-CZ')} />
        <Kpi label="Denormalized count" value={list.contactCount.toLocaleString('cs-CZ')} />
        <Kpi label="Opt-in mode" value={list.doubleOptIn ? 'Double' : 'Single'} />
      </section>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-secondary-400" />
            Members
          </CardTitle>
          <CardDescription>
            Add an existing contact by email (admin add — DOI is skipped). The first 50 are shown
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddMemberByEmail listId={list.id} />

          {members.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-4 text-center text-sm text-secondary-500">
              No members yet. Add by email above, capture via a signup form, or wait for the DOI
              flow.
            </p>
          ) : (
            <div className="mt-6 overflow-hidden rounded-md border border-secondary-200">
              <table className="w-full text-sm">
                <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Added</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {members.map((c) => {
                    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
                    return (
                      <tr key={c.id} className="hover:bg-secondary-50">
                        <td className="px-3 py-2">
                          <Link
                            href={`/contacts/${c.id}`}
                            className="font-medium text-secondary-900 hover:text-primary-700"
                          >
                            {name || c.email || '(no name)'}
                          </Link>
                          {name && c.email ? (
                            <p className="mt-0.5 text-xs text-secondary-500">{c.email}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-secondary-600">{c.status}</td>
                        <td className="px-3 py-2 text-xs text-secondary-500">
                          {new Date(c.createdAt).toLocaleDateString('cs-CZ')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <RemoveMemberButton listId={list.id} contactId={c.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasMore ? (
                <p className="border-t border-secondary-100 bg-secondary-50 px-3 py-2 text-xs text-secondary-500">
                  Showing first 50 — full member browsing comes with the next release.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Signup flow</CardTitle>
          <CardDescription>
            Use this list ID in signup forms and DOI subscribe endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <Row label="List ID" value={<code className="font-mono text-xs">{list.id}</code>} />
            <Row
              label="Subscribe endpoint"
              value={
                <code className="font-mono text-xs">POST /api/v1/lists/{list.id}/subscribe</code>
              }
            />
            <Row
              label="Thank-you URL"
              value={
                list.thankYouUrl ? (
                  <a
                    href={list.thankYouUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-900"
                  >
                    {list.thankYouUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null
              }
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-secondary-500">{label}</dt>
      <dd className="truncate text-secondary-900">
        {value || <span className="text-secondary-400">—</span>}
      </dd>
    </div>
  );
}
