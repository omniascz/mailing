/**
 * Workflow "What-If" simulator — projects expected outcomes for a workflow
 * before publishing it, using historical campaign data as baseline.
 * Nobody else has this built-in.
 */
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { campaigns } from '../../db/schema/campaigns.js';

export interface WhatIfStep {
  name: string;
  delayDays: number;
  emailSubject?: string;
  conditionType?: 'opened' | 'clicked' | 'not_opened' | 'none';
}

export interface WhatIfResult {
  projectedAudience: number;
  steps: Array<{
    stepName: string;
    projectedSend: number;
    projectedOpen: number;
    projectedClick: number;
    projectedConversion: number;
    projectedUnsubscribe: number;
    audienceAtEnd: number;
  }>;
  totalProjectedRevenue: number;
  totalProjectedConversions: number;
  estimatedDurationDays: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  basedOnCampaigns: number;
}

async function getHistoricalRates(orgId: string): Promise<{
  openRate: number;
  clickRate: number;
  conversionRate: number;
  unsubRate: number;
  avgRevenuePerConversion: number;
  campaignCount: number;
}> {
  const since = new Date(Date.now() - 180 * 86400_000); // last 6 months

  const [rates] = await db
    .select({
      totalSent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
      totalOpened: sql<number>`count(*) filter (where event_type = 'open')::int`,
      totalClicked: sql<number>`count(*) filter (where event_type = 'click')::int`,
      totalUnsub: sql<number>`count(*) filter (where event_type = 'unsubscribe')::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, since)));

  const [camCount] = await db
    .select({ c: count() })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), gte(campaigns.createdAt, since)));

  const sent = Number(rates?.totalSent ?? 0);
  const opened = Number(rates?.totalOpened ?? 0);
  const clicked = Number(rates?.totalClicked ?? 0);
  const unsub = Number(rates?.totalUnsub ?? 0);

  const openRate = sent > 0 ? opened / sent : 0.22;
  const clickRate = opened > 0 ? clicked / opened : 0.12;
  const unsubRate = sent > 0 ? unsub / sent : 0.002;

  return {
    openRate: openRate || 0.22,
    clickRate: clickRate || 0.12,
    conversionRate: clickRate * 0.15, // assumed 15% of clicks convert
    unsubRate: unsubRate || 0.002,
    avgRevenuePerConversion: 45,
    campaignCount: Number(camCount?.c ?? 0),
  };
}

export async function simulateWorkflow(
  orgId: string,
  audienceSize: number,
  steps: WhatIfStep[],
): Promise<WhatIfResult> {
  const hist = await getHistoricalRates(orgId);

  let currentAudience = audienceSize;
  let totalRevenue = 0;
  let totalConversions = 0;
  let totalDays = 0;

  const stepResults: WhatIfResult['steps'] = [];

  for (const step of steps) {
    totalDays += step.delayDays;
    const send = Math.round(currentAudience);
    const open = Math.round(send * hist.openRate);
    const click = Math.round(open * hist.clickRate);
    const conversion = Math.round(click * (hist.conversionRate / hist.clickRate));
    const unsub = Math.round(send * hist.unsubRate);

    const stepRevenue = conversion * hist.avgRevenuePerConversion;
    totalRevenue += stepRevenue;
    totalConversions += conversion;

    let nextAudience = currentAudience - unsub;

    // If condition filters audience for next step
    if (step.conditionType === 'opened') nextAudience = open;
    else if (step.conditionType === 'clicked') nextAudience = click;
    else if (step.conditionType === 'not_opened') nextAudience = send - open - unsub;

    stepResults.push({
      stepName: step.name,
      projectedSend: send,
      projectedOpen: open,
      projectedClick: click,
      projectedConversion: conversion,
      projectedUnsubscribe: unsub,
      audienceAtEnd: Math.max(0, nextAudience),
    });

    currentAudience = Math.max(0, nextAudience);
  }

  const confidenceLevel: WhatIfResult['confidenceLevel'] =
    hist.campaignCount >= 10 ? 'high' : hist.campaignCount >= 3 ? 'medium' : 'low';

  return {
    projectedAudience: audienceSize,
    steps: stepResults,
    totalProjectedRevenue: totalRevenue,
    totalProjectedConversions: totalConversions,
    estimatedDurationDays: totalDays,
    confidenceLevel,
    basedOnCampaigns: hist.campaignCount,
  };
}
