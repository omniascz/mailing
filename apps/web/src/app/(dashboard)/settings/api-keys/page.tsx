import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { CreateKeyButton } from './create-key-button';
import { RevokeButton } from './revoke-button';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[] | null;
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const keys = await apiFetch<ApiKey[]>('/api/v1/api-keys', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">API keys</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Workspace tokens for the REST API and SDKs. The raw key is shown only once — store it in
            a password manager.
          </p>
        </div>
        <CreateKeyButton />
      </header>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No API keys yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create your first key to authenticate REST API requests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
          <table className="w-full">
            <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 text-sm">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-secondary-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-secondary-900">{k.name}</p>
                    {k.scopes && k.scopes.length > 0 ? (
                      <p className="mt-0.5 text-xs text-secondary-500">
                        Scopes: {k.scopes.join(', ')}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary-600">{k.keyPrefix}…</td>
                  <td className="px-4 py-3">
                    <Badge variant={k.active ? 'success' : 'default'}>
                      {k.active ? 'Active' : 'Revoked'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-secondary-500">
                    {k.lastUsedAt ? (
                      new Date(k.lastUsedAt).toLocaleString('cs-CZ')
                    ) : (
                      <span className="text-secondary-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary-500">
                    {k.expiresAt ? (
                      new Date(k.expiresAt).toLocaleDateString('cs-CZ')
                    ) : (
                      <span className="text-secondary-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {k.active ? <RevokeButton id={k.id} name={k.name} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
