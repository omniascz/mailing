import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { CsvImporter } from './csv-importer';

interface List {
  id: string;
  name: string;
  liveContactCount: number;
}

export const dynamic = 'force-dynamic';

export default async function ImportContactsPage() {
  // Preload lists so the importer can optionally attach imported contacts
  // to one in the same request flow — saves a separate trip after import.
  const lists = await apiFetch<List[]>('/api/v1/lists', { fallback: [] });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/contacts"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to contacts
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Import contacts</CardTitle>
          <CardDescription>
            Upload a CSV. Map columns to contact fields. We import in batches of 500 with email
            validation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImporter lists={lists.map((l) => ({ id: l.id, name: l.name }))} />
        </CardContent>
      </Card>
    </div>
  );
}
