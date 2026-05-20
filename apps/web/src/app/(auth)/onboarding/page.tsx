'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Globe,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const steps = [
  { label: 'Workspace', icon: Building2 },
  { label: 'Invite team', icon: Users },
  { label: 'Sending domain', icon: Globe },
] as const;

interface OrgResponse {
  data: { id: string; name: string };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [orgName, setOrgName] = useState('');
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [emails, setEmails] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteSummary, setInviteSummary] = useState<{ ok: number; failed: number } | null>(null);

  const [domain, setDomain] = useState('');
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainCreated, setDomainCreated] = useState<string | null>(null);

  const [finishing, setFinishing] = useState(false);

  async function saveOrg(): Promise<boolean> {
    if (!orgName.trim()) return true; // step is optional
    setOrgSaving(true);
    setOrgError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/organizations/current`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setOrgError(`Save failed (${res.status}) ${text.slice(0, 120)}`);
        return false;
      }
      return true;
    } finally {
      setOrgSaving(false);
    }
  }

  async function sendInvites(): Promise<boolean> {
    const list = emails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (list.length === 0) return true;

    // Get org id from /auth/me
    let orgId: string;
    try {
      const me = await fetch(`${API_BASE}/api/v1/auth/me`, { credentials: 'include' });
      const mb = (await me.json()) as { orgId: string };
      orgId = mb.orgId;
    } catch {
      setInviteSummary({ ok: 0, failed: list.length });
      return false;
    }

    setInviteSaving(true);
    let ok = 0;
    let failed = 0;
    for (const email of list) {
      try {
        const res = await fetch(`${API_BASE}/api/v1/orgs/${orgId}/members/invite`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'editor' }),
        });
        if (res.ok || res.status === 201) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setInviteSaving(false);
    setInviteSummary({ ok, failed });
    return failed === 0;
  }

  async function addDomain(): Promise<boolean> {
    if (!domain.trim()) return true;
    setDomainSaving(true);
    setDomainError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/domains`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setDomainError(`Failed (${res.status}) ${text.slice(0, 120)}`);
        return false;
      }
      const body = (await res.json()) as OrgResponse;
      setDomainCreated(body.data.id);
      return true;
    } finally {
      setDomainSaving(false);
    }
  }

  async function next() {
    if (step === 0) {
      const ok = await saveOrg();
      if (!ok) return;
    } else if (step === 1) {
      // Run invites in background — don't block the user if some fail
      await sendInvites();
    }
    if (step < steps.length - 1) setStep(step + 1);
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  async function finish() {
    setFinishing(true);
    // Try to add the domain (final-step input) if user typed one.
    await addDomain();
    // Mark onboarding done regardless of domain success — user can verify
    // later from /domains.
    try {
      await fetch(`${API_BASE}/api/v1/organizations/current/complete-onboarding`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore — they can re-enter onboarding from settings later
    }
    // If they added a domain, jump straight to it so they see the DNS
    // records. Otherwise land on insights.
    if (domainCreated) {
      router.push(`/domains/${domainCreated}`);
    } else {
      router.push('/');
    }
  }

  return (
    <div className="w-full max-w-lg">
      {/* Stepper */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors',
                  done && 'bg-primary-600 text-white',
                  active && 'bg-primary-100 text-primary-700 ring-2 ring-primary-500',
                  !done && !active && 'bg-secondary-100 text-secondary-400',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'hidden text-sm sm:inline',
                  active ? 'font-medium text-secondary-900' : 'text-secondary-400',
                )}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={cn('mx-2 h-px w-8', i < step ? 'bg-primary-500' : 'bg-secondary-200')}
                />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent>
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-secondary-900">Name your workspace</h2>
              <p className="text-sm text-secondary-500">
                Shown in the dashboard and on confirmation emails. You can change this later.
              </p>
              <Input
                label="Workspace name"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
              {orgError ? (
                <p className="flex items-center gap-1.5 text-xs text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {orgError}
                </p>
              ) : null}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-secondary-900">Invite your team</h2>
              <p className="text-sm text-secondary-500">
                Comma-separated. Each gets an invite email and lands as{' '}
                <code className="font-mono text-xs">editor</code>. Skip if you're solo.
              </p>
              <Input
                label="Email addresses"
                placeholder="alice@company.com, bob@company.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                helperText="Optional. You can invite more from Settings → Team."
              />
              {inviteSummary ? (
                <p className="text-xs text-secondary-600">
                  Sent {inviteSummary.ok} invite{inviteSummary.ok === 1 ? '' : 's'}
                  {inviteSummary.failed > 0 ? ` · ${inviteSummary.failed} failed` : ''}
                </p>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-secondary-900">Add your sending domain</h2>
              <p className="text-sm text-secondary-500">
                The domain your campaigns send from. We'll show DNS records (SPF, DKIM, DMARC) on
                the next screen. Skip if you're just exploring.
              </p>
              <Input
                label="Domain"
                placeholder="yourdomain.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                helperText="No subdomain prefix — we'll auto-pick mail.yourdomain.com for the mail subdomain."
              />
              {domainError ? (
                <p className="flex items-center gap-1.5 text-xs text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {domainError}
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? (
              <Button variant="ghost" onClick={prev}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <div />
            )}
            {step < steps.length - 1 ? (
              <Button onClick={next} loading={orgSaving || inviteSaving}>
                {step === 1 && !emails.trim() ? 'Skip' : 'Next'}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} loading={finishing || domainSaving}>
                {domain.trim() ? 'Add domain + finish' : 'Skip + finish'}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
