/**
 * The report for the polls embedded in a campaign.
 *
 * #87 built the whole poll feature — the block, the one-click vote route, the
 * answer stored on the contact, and GET /api/v1/campaigns/:id/poll-results —
 * and then no page called that last endpoint, so the report could not be
 * opened. This is the page.
 *
 * Renders NOTHING when the campaign has no poll block. `pollResultsForCampaign`
 * returns `[]` in exactly that case and a list of questions with `votes: 0`
 * when a poll exists but nobody has answered yet, so the two are distinguished
 * at the source and an empty card never has to stand in for "no poll here".
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export interface PollOptionResult {
  index: number;
  label: string;
  votes: number;
}

export interface PollResult {
  blockId: string;
  question: string;
  options: PollOptionResult[];
  totalVotes: number;
}

/**
 * Share of the vote for one option, as a percentage of the poll's own total.
 *
 * Zero votes gives zero rather than NaN — a poll that has been sent and not
 * yet answered is the normal state for the first hours of a campaign, not an
 * error, and `NaN%` on the screen is how that state gets reported as a bug.
 */
export function votePercent(votes: number, totalVotes: number): number {
  if (totalVotes <= 0) return 0;
  return (votes / totalVotes) * 100;
}

export function PollResultsCard({ results }: { results: PollResult[] }) {
  if (results.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Poll results</CardTitle>
        <CardDescription>
          {results.length === 1
            ? 'One poll in this campaign.'
            : `${results.length} polls in this campaign.`}{' '}
          Each recipient&apos;s answer is counted once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {results.map((poll) => (
            <div key={poll.blockId}>
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-medium text-secondary-900">
                  {poll.question || <span className="text-secondary-400">Untitled poll</span>}
                </h3>
                <span className="shrink-0 text-xs tabular-nums text-secondary-500">
                  {poll.totalVotes.toLocaleString('cs-CZ')}{' '}
                  {poll.totalVotes === 1 ? 'vote' : 'votes'}
                </span>
              </div>

              {poll.options.length === 0 ? (
                <p className="text-xs text-secondary-500">This poll has no options.</p>
              ) : (
                <ul className="space-y-2">
                  {poll.options.map((option) => {
                    const pct = votePercent(option.votes, poll.totalVotes);
                    return (
                      <li key={option.index}>
                        <div className="flex items-baseline justify-between gap-4 text-sm">
                          <span className="text-secondary-700">{option.label}</span>
                          <span className="shrink-0 tabular-nums text-secondary-500">
                            {option.votes.toLocaleString('cs-CZ')} · {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div
                          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary-100"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-primary-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
