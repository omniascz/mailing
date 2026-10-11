'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  VERDICT_TEXT,
  canConfirm,
  criterionLabel,
  describeMetrics,
  groupChecks,
  remedyFor,
  type ApiFailure,
  type Check,
  type PreSendReport,
} from './pre-send-report';

/**
 * What the campaign looks like to the pre-send gate, shown before it is sent.
 *
 * Presentational only: the caller loads the report, keeps the acknowledgement
 * and sends. Every criterion is named with what was measured against which
 * threshold; nothing is cut short.
 */
export function PreSendPanel(props: {
  campaignId: string;
  /** 'send' or 'schedule' — only the wording of the confirm button differs. */
  intent: 'send' | 'schedule';
  /** Shown above the verdict when scheduling: the exact time that will be sent. */
  scheduledAtLabel?: string;
  report: PreSendReport | null;
  loading: boolean;
  /** The report could not be loaded. */
  loadError?: string | null;
  /** The send or schedule request itself failed. */
  failure?: ApiFailure | null;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
  /**
   * Whether this member may send past a no-go verdict. The API accepts the
   * acknowledgement from an owner or admin only; anyone else is not offered it.
   */
  canOverride?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const { report, campaignId } = props;
  const groups = report ? groupChecks(report.checks) : null;
  const enabled = !!report && canConfirm(report.verdict, props.acknowledged);
  const confirmLabel = props.intent === 'send' ? 'Send' : 'Schedule';

  return (
    <section
      aria-label="Pre-send check"
      data-testid="pre-send-panel"
      className="mt-3 w-full max-w-2xl rounded-md border border-secondary-200 bg-white p-4 text-left text-sm"
    >
      <h2 className="text-base font-semibold text-secondary-900">Pre-send check</h2>
      {props.scheduledAtLabel && (
        <p className="mt-1 text-secondary-600">Scheduled for: {props.scheduledAtLabel}</p>
      )}

      {props.loading && <p className="mt-2 text-secondary-600">Checking the campaign…</p>}
      {props.loadError && (
        <p role="alert" className="mt-2 text-red-700">
          The check could not be loaded: {props.loadError}
        </p>
      )}

      {report && groups && (
        <>
          <p
            data-testid="pre-send-verdict"
            data-verdict={report.verdict}
            className={
              'mt-2 font-medium ' +
              (report.verdict === 'no-go'
                ? 'text-red-700'
                : report.verdict === 'caution'
                  ? 'text-amber-700'
                  : 'text-green-700')
            }
          >
            {VERDICT_TEXT[report.verdict]}
          </p>

          <CheckGroup
            title="Blocking"
            testId="pre-send-blocking"
            checks={groups.blocking}
            campaignId={campaignId}
            withRemedy
          />
          <CheckGroup title="Warnings" testId="pre-send-warnings" checks={groups.warnings} />
          <CheckGroup title="Info" testId="pre-send-info" checks={groups.info} />
          {groups.passed.length > 0 && (
            <p className="mt-3 text-secondary-500">
              Passed: {groups.passed.map((c) => criterionLabel(c.id)).join(', ')}.
            </p>
          )}

          {report.verdict === 'no-go' && props.canOverride === false && (
            <p
              data-testid="pre-send-override-not-allowed"
              className="mt-4 rounded-md border border-secondary-200 bg-secondary-50 p-3 text-secondary-800"
            >
              Only an owner or admin can send a campaign the check says “no-go”. Fix what is listed
              above, or ask an owner or admin to send it.
            </p>
          )}
          {report.verdict === 'no-go' && props.canOverride !== false && (
            <label className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
              <input
                type="checkbox"
                data-testid="pre-send-acknowledge"
                checked={props.acknowledged}
                onChange={(e) => props.onAcknowledge(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>
                  I understand the risk and want to {props.intent === 'send' ? 'send' : 'schedule'}{' '}
                  the campaign anyway.
                </strong>{' '}
                The acknowledgement is recorded together with the check result.
              </span>
            </label>
          )}
        </>
      )}

      {props.failure && <FailureView failure={props.failure} campaignId={campaignId} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          data-testid="pre-send-confirm"
          disabled={!enabled || props.confirming}
          loading={props.confirming}
          onClick={props.onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button variant="outline" onClick={props.onCancel}>
          Back
        </Button>
      </div>
    </section>
  );
}

function CheckGroup(props: {
  title: string;
  testId: string;
  checks: Check[];
  campaignId?: string;
  withRemedy?: boolean;
}) {
  if (props.checks.length === 0) return null;
  return (
    <div className="mt-3" data-testid={props.testId}>
      <h3 className="font-semibold text-secondary-800">
        {props.title} ({props.checks.length})
      </h3>
      <ul className="mt-1 space-y-2">
        {props.checks.map((c) => (
          <li key={c.id} data-criterion={c.id} className="rounded border border-secondary-100 p-2">
            <Criterion
              id={c.id}
              title={c.title}
              detail={c.detail}
              metrics={c.metrics}
              campaignId={props.withRemedy ? props.campaignId : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Criterion(props: {
  id: string;
  title: string;
  detail?: string;
  metrics?: Record<string, string | number>;
  /** Given for a blocking criterion: shows what to do and where. */
  campaignId?: string;
}) {
  const lines = describeMetrics(props.metrics);
  const remedy = props.campaignId ? remedyFor(props.id, props.campaignId) : null;
  return (
    <>
      <p className="font-medium text-secondary-900">{criterionLabel(props.id)}</p>
      <p className="text-secondary-700">{props.title}</p>
      {props.detail && <p className="text-secondary-600">{props.detail}</p>}
      {lines.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-secondary-700" data-testid="criterion-metrics">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {remedy && (
        <p className="mt-1 text-secondary-800">
          <span className="font-medium">What to do: </span>
          {remedy.text}{' '}
          {remedy.href && (
            <Link href={remedy.href} className="text-primary-600 underline">
              {remedy.linkLabel}
            </Link>
          )}
        </p>
      )}
    </>
  );
}

/** A failed send or schedule, in full. The gate's refusal lists its criteria with their numbers. */
export function FailureView({ failure, campaignId }: { failure: ApiFailure; campaignId: string }) {
  return (
    <div
      role="alert"
      data-testid="send-failure"
      className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-800"
    >
      {failure.blocking ? (
        <>
          <p className="font-medium">
            The server refused the campaign ({failure.status}): the check now says “no-go”.
          </p>
          <ul className="mt-2 space-y-2">
            {failure.blocking.map((b) => (
              <li key={b.id} data-criterion={b.id}>
                <Criterion id={b.id} title={b.title} metrics={b.metrics} campaignId={campaignId} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          The request failed ({failure.status}
          {failure.code ? `, ${failure.code}` : ''}): {failure.message}
        </p>
      )}
    </div>
  );
}
