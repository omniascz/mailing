/**
 * Subaccounts pure helpers (#273-#276/L4-3).
 *
 * Parent-child org traversal, consolidated usage rollup, and permission
 * inheritance math. Pure: the DB layer in `subaccounts.ts` loads rows and
 * delegates.
 */

export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface OrgNode {
  id: string;
  parentOrgId: string | null;
}

export interface OrgUsage {
  orgId: string;
  emailsSent: number;
  smsSent: number;
  storageBytes: number;
  aiTokensIn: number;
  aiTokensOut: number;
}

export interface ConsolidatedUsage {
  parentOrgId: string;
  childCount: number;
  totals: {
    emailsSent: number;
    smsSent: number;
    storageBytes: number;
    aiTokensIn: number;
    aiTokensOut: number;
  };
  perChild: OrgUsage[];
}

// ─── Tree traversal ─────────────────────────────────────────────────────────

/**
 * Return every descendant org id (transitive), excluding the parent itself.
 * Detects cycles with a visited set.
 */
export function descendantOrgIds(parentOrgId: string, allOrgs: OrgNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const o of allOrgs) {
    if (o.parentOrgId) {
      const arr = children.get(o.parentOrgId) ?? [];
      arr.push(o.id);
      children.set(o.parentOrgId, arr);
    }
  }
  const out: string[] = [];
  const visited = new Set<string>([parentOrgId]);
  const stack: string[] = [parentOrgId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const kids = children.get(cur) ?? [];
    for (const k of kids) {
      if (visited.has(k)) continue;
      visited.add(k);
      out.push(k);
      stack.push(k);
    }
  }
  return out;
}

/** Walk up to find the root org. Loops are short-circuited. */
export function rootOrgId(orgId: string, allOrgs: OrgNode[]): string {
  const byId = new Map(allOrgs.map((o) => [o.id, o]));
  const seen = new Set<string>();
  let cur = byId.get(orgId);
  while (cur && cur.parentOrgId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = byId.get(cur.parentOrgId);
    if (!parent) break;
    cur = parent;
  }
  return cur ? cur.id : orgId;
}

// ─── Consolidated usage rollup ─────────────────────────────────────────────

/**
 * Sum per-child usage up to a parent org. Only direct + indirect descendants
 * of `parentOrgId` are included.
 */
export function rollupUsage(
  parentOrgId: string,
  allOrgs: OrgNode[],
  perOrgUsage: OrgUsage[],
): ConsolidatedUsage {
  const descendants = new Set(descendantOrgIds(parentOrgId, allOrgs));
  const scope = perOrgUsage.filter((u) => descendants.has(u.orgId));

  const totals = scope.reduce(
    (acc, u) => ({
      emailsSent: acc.emailsSent + u.emailsSent,
      smsSent: acc.smsSent + u.smsSent,
      storageBytes: acc.storageBytes + u.storageBytes,
      aiTokensIn: acc.aiTokensIn + u.aiTokensIn,
      aiTokensOut: acc.aiTokensOut + u.aiTokensOut,
    }),
    { emailsSent: 0, smsSent: 0, storageBytes: 0, aiTokensIn: 0, aiTokensOut: 0 },
  );

  return {
    parentOrgId,
    childCount: descendants.size,
    totals,
    perChild: scope,
  };
}

// ─── Permission inheritance ────────────────────────────────────────────────

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

/**
 * When a user has explicit roles in multiple orgs in the same tree, their
 * effective role on a target child is the MIN of:
 *   - their direct role on the child (if any)
 *   - their role on any ancestor of the child
 *
 * This matches HubSpot's "permission inheritance" where agency admins can
 * act on sub-accounts but agency viewers can't escalate.
 */
export function effectiveRole(
  roles: Array<{ orgId: string; role: OrgRole }>,
  targetOrgId: string,
  allOrgs: OrgNode[],
): OrgRole | null {
  const byId = new Map(allOrgs.map((o) => [o.id, o]));
  const ancestry = new Set<string>([targetOrgId]);
  const seen = new Set<string>();
  let cur = byId.get(targetOrgId);
  while (cur && cur.parentOrgId && !seen.has(cur.id)) {
    seen.add(cur.id);
    ancestry.add(cur.parentOrgId);
    cur = byId.get(cur.parentOrgId);
  }

  const applicable = roles.filter((r) => ancestry.has(r.orgId));
  if (applicable.length === 0) return null;

  // Highest-ranked role applicable
  return applicable.reduce<OrgRole>(
    (best, cur) => (ROLE_RANK[cur.role] > ROLE_RANK[best] ? cur.role : best),
    applicable[0]!.role,
  );
}

export function canPerform(userRole: OrgRole | null, requiredRole: OrgRole): boolean {
  if (!userRole) return false;
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}
