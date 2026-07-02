'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function NewCouponBatchPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    codePrefix: '',
    discountType: 'percent',
    discountValue: '10',
    quantity: '1000',
    expiresAt: '',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/coupons/batches`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          codePrefix: form.codePrefix || undefined,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          quantity: Number(form.quantity),
          expiresAt: form.expiresAt || undefined,
        }),
      });
      if (!res.ok) {
        toast('error', `Failed to create batch (${res.status})`);
        return;
      }
      toast('success', 'Coupon batch created');
      router.push('/coupons');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input =
    'h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const label = 'mb-1 block text-sm font-medium text-secondary-700';

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/coupons"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to coupons
      </Link>
      <h1 className="mb-6 text-2xl font-semibold text-secondary-900">New coupon batch</h1>
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={label}>Batch name</label>
              <input
                className={input}
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Spring sale 15%"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Discount type</label>
                <select
                  className={input}
                  value={form.discountType}
                  onChange={(e) => set('discountType', e.target.value)}
                >
                  <option value="percent">Percent (%)</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </div>
              <div>
                <label className={label}>Discount value</label>
                <input
                  className={input}
                  type="number"
                  min="0"
                  required
                  value={form.discountValue}
                  onChange={(e) => set('discountValue', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Quantity</label>
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="100000"
                  required
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Code prefix (optional)</label>
                <input
                  className={input}
                  value={form.codePrefix}
                  onChange={(e) => set('codePrefix', e.target.value)}
                  placeholder="SPRING-"
                />
              </div>
            </div>
            <div>
              <label className={label}>Expires at (optional)</label>
              <input
                className={input}
                type="date"
                value={form.expiresAt}
                onChange={(e) => set('expiresAt', e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create batch'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
