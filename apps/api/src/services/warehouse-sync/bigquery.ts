/**
 * BigQuery streaming insert (tabledata.insertAll REST).
 * Expects a pre-minted OAuth access token in config (service-account token
 * minting can be layered on later). Docs:
 * https://cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/insertAll
 */
export interface BigQueryConfig {
  projectId: string;
  datasetId: string;
  /** OAuth2 access token with BigQuery insert scope. */
  accessToken: string;
}

export async function insertAllBigQuery(
  cfg: BigQueryConfig,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const url =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${cfg.projectId}` +
    `/datasets/${cfg.datasetId}/tables/${table}/insertAll`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'bigquery#tableDataInsertAllRequest',
      // Let BigQuery dedupe retries; insertId is best-effort.
      rows: rows.map((json, i) => ({ insertId: `${table}-${i}`, json })),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BigQuery insertAll ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as {
    insertErrors?: Array<{ index: number; errors: unknown[] }>;
  };
  if (data.insertErrors?.length) {
    throw new Error(`BigQuery insert errors: ${JSON.stringify(data.insertErrors).slice(0, 300)}`);
  }
  return rows.length;
}
