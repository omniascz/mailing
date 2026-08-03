'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Building, Globe2, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// IANA timezone shortlist. The full list is huge; we surface the
// regional defaults most CZ/SK/EU customers actually pick. They can
// override via the API directly if they need an exotic zone.
const TIMEZONES = [
  'UTC',
  'Europe/Prague',
  'Europe/Bratislava',
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Warsaw',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const LOCALES = ['en', 'cs', 'sk', 'de', 'pl', 'hu'] as const;

const REGION_LABELS: Record<'us' | 'eu' | 'ap', string> = {
  us: 'United States',
  eu: 'European Union',
  ap: 'Asia-Pacific',
};

interface Props {
  orgId: string;
  initialName: string;
  initialSettings: Record<string, unknown>;
  ipRestrictionsEnabled: boolean;
  trackingEuStrict: boolean;
  hipaaMode: boolean;
  slug: string;
  plan: string;
  dataRegion: 'us' | 'eu' | 'ap';
  initialCompanyName: string;
  initialPostalAddress: string;
}

export function WorkspaceForm({
  initialName,
  initialSettings,
  ipRestrictionsEnabled,
  trackingEuStrict,
  hipaaMode,
  slug,
  plan,
  dataRegion,
  initialCompanyName,
  initialPostalAddress,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(
    typeof initialSettings.timezone === 'string' ? initialSettings.timezone : 'Europe/Prague',
  );
  const [locale, setLocale] = useState(
    typeof initialSettings.locale === 'string' ? initialSettings.locale : 'cs',
  );
  const [brandColor, setBrandColor] = useState(
    typeof initialSettings.brandColor === 'string' ? initialSettings.brandColor : '#0ea5e9',
  );
  const [ipRestrict, setIpRestrict] = useState(ipRestrictionsEnabled);
  const [trackingStrict, setTrackingStrict] = useState(trackingEuStrict);
  const [hipaa, setHipaa] = useState(hipaaMode);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [postalAddress, setPostalAddress] = useState(initialPostalAddress);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/organizations/current`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          settings: { timezone, locale, brandColor },
          ipRestrictionsEnabled: ipRestrict,
          trackingEuStrict: trackingStrict,
          hipaaMode: hipaa,
          companyName: companyName.trim(),
          postalAddress: postalAddress.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Save failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Workspace updated');
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-4 w-4 text-secondary-400" />
            Identity
          </CardTitle>
          <CardDescription>
            Name your customers see, color used in tracking-link branding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-secondary-500">Slug</p>
              <code className="font-mono text-xs text-secondary-700">{slug}</code>
              <p className="mt-1 text-xs text-secondary-500">Immutable — used in public URLs.</p>
            </div>
            <div>
              <p className="text-xs text-secondary-500">Plan</p>
              <Badge variant="primary">{plan}</Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">Brand color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-secondary-300"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-32 rounded-md border border-secondary-300 px-3 font-mono text-xs focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-4 w-4 text-secondary-400" />
            Sender identity (CAN-SPAM)
          </CardTitle>
          <CardDescription>
            Legal name + physical postal address auto-appended to every marketing email footer.
            Required by CAN-SPAM and mailbox providers (Gmail/Yahoo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Company / legal name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme s.r.o."
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">Postal address</label>
            <textarea
              value={postalAddress}
              onChange={(e) => setPostalAddress(e.target.value)}
              rows={3}
              placeholder={'Ulice 1\n110 00 Praha\nCzech Republic'}
              className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="text-xs text-secondary-500">
              A P.O. Box is acceptable. Leave blank to disable auto-append (not recommended).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locale + timezone</CardTitle>
          <CardDescription>
            Defaults for new campaigns and dashboard formatting. Per-campaign overrides win.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">Default locale</label>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-secondary-400" />
            Region + compliance
          </CardTitle>
          <CardDescription>
            Toggles affecting how the platform handles consent, tracking, and access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-secondary-200 p-3">
            <div>
              <p className="text-sm font-medium text-secondary-900">Data region</p>
              <p className="mt-0.5 text-xs text-secondary-500">
                Where your contact data physically lives. Contact support to migrate.
              </p>
            </div>
            <Badge variant="default">{REGION_LABELS[dataRegion]}</Badge>
          </div>

          <Toggle
            label="ePrivacy strict tracking"
            checked={trackingStrict}
            onChange={setTrackingStrict}
            description="When on, click/open tracking is only applied to recipients who recorded explicit consent on the 'tracking' channel. EU/CZ regulators may require this."
          />

          <Toggle
            label="IP restrictions"
            checked={ipRestrict}
            onChange={setIpRestrict}
            description="Block sign-ins from IPs outside the org's allow-list. Configure the list in Team settings."
            icon={<Lock className="h-4 w-4 text-secondary-400" />}
          />

          <Toggle
            label="HIPAA mode"
            checked={hipaa}
            onChange={setHipaa}
            description="Enables PHI safeguards: encrypted custom fields, audit-log hardening, longer retention. Requires Business plan and signed BAA."
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 border-t border-secondary-200 pt-4">
        <Button type="submit" loading={saving || pending}>
          <Save className="h-4 w-4" />
          Save workspace
        </Button>
        <p className="ml-auto text-xs text-secondary-500">Owners + admins only.</p>
      </div>
    </form>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-secondary-200 p-3 hover:bg-secondary-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
      />
      <div className="flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-secondary-900">
          {icon}
          {label}
        </p>
        {description ? <p className="mt-0.5 text-xs text-secondary-500">{description}</p> : null}
      </div>
    </label>
  );
}
