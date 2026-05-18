import { callClaude } from '../../lib/ai-client.js';
import { db } from '../../db/client.js';
import { aiAgents, aiAgentRuns } from '../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

export type AgentType =
  | 'campaign_builder'
  | 'contact_cleanup'
  | 'segment_optimizer'
  | 're_engagement'
  | 'custom';

export interface AgentRunInput {
  agentId: string;
  orgId: string;
  context?: Record<string, unknown>;
}

export interface AgentRunOutput {
  runId: string;
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  actions?: AgentAction[];
  error?: string;
}

export interface AgentAction {
  type: 'create_campaign' | 'update_segment' | 'tag_contacts' | 'send_notification' | 'log_insight';
  description: string;
  payload: Record<string, unknown>;
  requiresApproval: boolean;
}

async function runContactCleanupAgent(
  goal: string,
  orgId: string,
  config: Record<string, unknown>,
): Promise<{ actions: AgentAction[]; summary: string }> {
  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-sonnet-4-6',
    feature: 'agent_run',
    system: `You are a list hygiene expert for email marketing. Analyze the provided goal and suggest specific cleanup actions. Output JSON only.`,
    user: `Goal: ${goal}\nConfig: ${JSON.stringify(config)}\n\nSuggest 3-5 specific, actionable cleanup rules. Output:
{
  "actions": [{ "type": "tag_contacts", "description": "...", "payload": {}, "requiresApproval": true }],
  "summary": "..."
}`,
  });

  return JSON.parse(result.text) as { actions: AgentAction[]; summary: string };
}

async function runSegmentOptimizerAgent(
  goal: string,
  orgId: string,
  config: Record<string, unknown>,
): Promise<{ actions: AgentAction[]; summary: string }> {
  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-sonnet-4-6',
    feature: 'agent_run',
    system: `You are a segmentation expert. Suggest audience segments that would improve engagement. Output JSON only.`,
    user: `Goal: ${goal}\nConfig: ${JSON.stringify(config)}\n\nOutput:
{
  "actions": [{ "type": "update_segment", "description": "...", "payload": {}, "requiresApproval": false }],
  "summary": "..."
}`,
  });

  return JSON.parse(result.text) as { actions: AgentAction[]; summary: string };
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const agent = await db.select().from(aiAgents)
    .where(and(eq(aiAgents.id, input.agentId), eq(aiAgents.orgId, input.orgId)))
    .limit(1).then((r) => r[0]);

  if (!agent) return { runId: '', status: 'failed', error: 'Agent not found' };

  // Create run record
  const [run] = await db.insert(aiAgentRuns).values({
    agentId: agent.id,
    orgId: agent.orgId,
    status: 'running',
    input: input.context ?? {},
    startedAt: new Date(),
  }).returning();

  if (!run) return { runId: '', status: 'failed', error: 'Failed to create run' };

  try {
    let agentResult: { actions: AgentAction[]; summary: string };

    switch (agent.agentType as AgentType) {
      case 'contact_cleanup':
        agentResult = await runContactCleanupAgent(agent.goal, agent.orgId, agent.config);
        break;
      case 'segment_optimizer':
        agentResult = await runSegmentOptimizerAgent(agent.goal, agent.orgId, agent.config);
        break;
      default: {
        // Generic agent — pass goal directly to Claude
        const result = await callClaude({
          tenantId: agent.orgId,
          model: 'claude-sonnet-4-6',
          feature: 'agent_run',
          system: `You are a marketing automation AI agent. Execute the given goal and return a structured JSON result.`,
          user: `Goal: ${agent.goal}\nContext: ${JSON.stringify(input.context ?? {})}\n\nOutput: { "actions": [], "summary": "..." }`,
        });
        agentResult = JSON.parse(result.text) as { actions: AgentAction[]; summary: string };
      }
    }

    await db.update(aiAgentRuns)
      .set({ status: 'completed', output: agentResult, completedAt: new Date() })
      .where(eq(aiAgentRuns.id, run.id));

    // Update agent lastRunAt
    await db.update(aiAgents).set({ lastRunAt: new Date() }).where(eq(aiAgents.id, agent.id));

    return { runId: run.id, status: 'completed', result: agentResult, actions: agentResult.actions };
  } catch (err) {
    const error = (err as Error).message;
    await db.update(aiAgentRuns)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(aiAgentRuns.id, run.id));

    return { runId: run.id, status: 'failed', error };
  }
}
