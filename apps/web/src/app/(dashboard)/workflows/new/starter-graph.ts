/**
 * The graph a workflow created from the "New workflow" form starts with:
 * trigger → wait one day → send email.
 *
 * Its own module so the shape can be tested. No `@/` imports: apps/api's
 * integration suite loads this file by path and runs the graph it returns.
 */
import { DEFAULT_WAIT } from '../wait-config';

export function buildStarterGraph(triggerType: string) {
  const nodes = [
    { id: 't', type: 'trigger', config: { triggerType } },
    { id: 'w1', type: 'wait', config: { ...DEFAULT_WAIT } },
    {
      id: 'e1',
      type: 'send_email',
      config: { subject: 'Hello {{contact.first_name|vocative}}' },
    },
  ];
  const edges = [
    { id: 'e0', source: 't', target: 'w1' },
    { id: 'e1', source: 'w1', target: 'e1' },
  ];
  return { nodes, edges };
}
