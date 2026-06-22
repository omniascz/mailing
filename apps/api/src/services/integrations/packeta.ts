/**
 * Zásilkovna / Packeta integration.
 * API v6: https://api.packeta.com/v6/
 * Tracks shipments, syncs status updates, generates tracking links.
 */
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { packetaShipments, type PacketaShipment } from '../../db/schema/packeta-shipments.js';

export interface PacketaSettings {
  apiKey: string;
  senderId?: string;
}

export interface PacketaCreateInput {
  contactId?: string;
  orderId?: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  pickupPointId: string;
  value: number;
  currency?: string;
  cod?: number;
  weight?: number;
}

interface PacketaApiStatus {
  id: string;
  barcode: string;
  trackingUrl: string;
  status: string;
  [key: string]: unknown;
}

async function packetaRequest(
  endpoint: string,
  apiKey: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const base = 'https://api.packeta.com/v6';
  const res = await fetch(`${base}${endpoint}?apiKey=${encodeURIComponent(apiKey)}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Packeta API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createShipment(
  orgId: string,
  settings: PacketaSettings,
  input: PacketaCreateInput,
): Promise<PacketaShipment> {
  const payload = {
    number: input.orderId ?? crypto.randomUUID().slice(0, 8),
    name: input.recipientName,
    email: input.recipientEmail,
    phone: input.recipientPhone,
    addressId: Number(input.pickupPointId),
    value: input.value,
    currency: input.currency ?? 'CZK',
    cod: input.cod ?? 0,
    weight: input.weight ?? 0.5,
    senderLabel: settings.senderId,
  };

  const result = (await packetaRequest('/packet/create', settings.apiKey, 'POST', payload)) as PacketaApiStatus;

  const [row] = await db.insert(packetaShipments).values({
    orgId,
    contactId: input.contactId ?? null,
    orderId: input.orderId ?? null,
    barcode: result.barcode,
    status: result.status ?? 'created',
    trackingUrl: result.trackingUrl,
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail ?? null,
    recipientPhone: input.recipientPhone ?? null,
    pickupPointId: input.pickupPointId,
    weight: input.weight ? String(input.weight) : null,
    cod: input.cod ? String(input.cod) : null,
    currency: input.currency ?? 'CZK',
    rawStatus: result as Record<string, unknown>,
  }).returning();

  return row!;
}

export async function syncShipmentStatus(
  orgId: string,
  settings: PacketaSettings,
  barcode: string,
): Promise<PacketaShipment> {
  const result = (await packetaRequest(`/packet/${barcode}/status`, settings.apiKey)) as PacketaApiStatus;

  const [row] = await db.update(packetaShipments)
    .set({
      status: result.status ?? 'unknown',
      rawStatus: result as Record<string, unknown>,
      deliveredAt: result.status === 'delivered' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(packetaShipments.barcode, barcode), eq(packetaShipments.orgId, orgId)))
    .returning();

  return row!;
}

export async function listShipments(orgId: string, limit = 50): Promise<PacketaShipment[]> {
  return db.select().from(packetaShipments)
    .where(eq(packetaShipments.orgId, orgId))
    .orderBy(desc(packetaShipments.createdAt))
    .limit(limit);
}

export function packetaTrackingUrl(barcode: string): string {
  return `https://tracking.packeta.com/cs/?id=${barcode}`;
}
