'use client';

import { useState } from 'react';
import { Building2, Users, Globe, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const steps = [
  { label: 'Organization', icon: Building2 },
  { label: 'Invite team', icon: Users },
  { label: 'Verify domain', icon: Globe },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState('');
  const [emails, setEmails] = useState('');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);

  function next() {
    if (step < steps.length - 1) setStep(step + 1);
  }
  function prev() {
    if (step > 0) setStep(step - 1);
  }

  async function finish() {
    setLoading(true);
    try {
      await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName,
          inviteEmails: emails.split(',').map((e) => e.trim()).filter(Boolean),
          domain,
        }),
      });
      window.location.href = '/dashboard';
    } catch {
      setLoading(false);
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
                  className={cn(
                    'mx-2 h-px w-8',
                    i < step ? 'bg-primary-500' : 'bg-secondary-200',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent>
          {/* Step 1: Organization */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-secondary-900">Name your organization</h2>
              <p className="text-sm text-secondary-500">
                This will be your workspace name in ForgeMsg.
              </p>
              <Input
                label="Organization name"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
          )}

          {/* Step 2: Invite team */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-secondary-900">Invite your team</h2>
              <p className="text-sm text-secondary-500">
                Add team members by email. Separate multiple emails with commas.
              </p>
              <Input
                label="Email addresses"
                placeholder="alice@company.com, bob@company.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                helperText="You can skip this step and invite people later."
              />
            </div>
          )}

          {/* Step 3: Verify domain */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-secondary-900">Verify your sending domain</h2>
              <p className="text-sm text-secondary-500">
                Enter the domain you&apos;ll use to send emails. We&apos;ll help you set up DNS records.
              </p>
              <Input
                label="Sending domain"
                placeholder="mail.company.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                helperText="You can set this up later in Settings."
              />
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? (
              <Button variant="ghost" onClick={prev}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <div />
            )}
            {step < steps.length - 1 ? (
              <Button onClick={next} disabled={step === 0 && !orgName}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} loading={loading}>
                Get started <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
