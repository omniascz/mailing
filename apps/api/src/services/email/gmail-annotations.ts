/**
 * Gmail Promotions tab annotations + schema.org email metadata.
 * Injects JSON-LD and Gmail-specific headers to get rich cards in inbox:
 * - Promotion deals (discount %, expiry, promo code)
 * - One-click actions (RSVP, review, view order)
 * - Logo + sender highlight
 *
 * Reference: https://developers.google.com/gmail/promotions/annotations
 */

export interface PromoAnnotation {
  type: 'promotion';
  discount?: string;           // "20%", "€10 off"
  expiryDate?: string;         // ISO date
  promoCode?: string;          // "SUMMER20"
  imageUrl?: string;           // 1200×900 promo image
  badgeLabel?: string;         // "Exclusive" | "Flash Sale" etc.
}

export interface OrderAnnotation {
  type: 'order';
  orderNumber: string;
  orderDate: string;           // ISO date
  orderStatus: 'ORDER_PLACED' | 'ORDER_SHIPPED' | 'ORDER_DELIVERED' | 'ORDER_CANCELLED';
  trackingUrl?: string;
  estimatedArrival?: string;   // ISO date
}

export interface EventAnnotation {
  type: 'event';
  eventName: string;
  startDate: string;           // ISO date-time
  endDate?: string;
  location?: string;
  doorTime?: string;
  organizer?: string;
  rsvpUrl?: string;
}

export type EmailAnnotation = PromoAnnotation | OrderAnnotation | EventAnnotation;

function buildPromoJsonLd(promo: PromoAnnotation): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'http://schema.org',
    '@type': 'EmailMessage',
    potentialAction: {
      '@type': 'ViewAction',
      name: promo.badgeLabel ?? 'View Deal',
      url: '{{campaign_url}}',
    },
  };

  if (promo.discount || promo.promoCode || promo.expiryDate) {
    schema['about'] = {
      '@type': 'Offer',
      ...(promo.discount ? { priceSpecification: { '@type': 'PriceSpecification', description: promo.discount } } : {}),
      ...(promo.promoCode ? { name: `Use code: ${promo.promoCode}` } : {}),
      ...(promo.expiryDate ? { availabilityEnds: promo.expiryDate } : {}),
    };
  }

  return schema;
}

function buildOrderJsonLd(order: OrderAnnotation): Record<string, unknown> {
  return {
    '@context': 'http://schema.org',
    '@type': 'EmailMessage',
    about: {
      '@type': 'Order',
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      orderStatus: `http://schema.org/${order.orderStatus}`,
      ...(order.trackingUrl ? { potentialAction: { '@type': 'TrackAction', name: 'Track Package', url: order.trackingUrl } } : {}),
    },
  };
}

function buildEventJsonLd(event: EventAnnotation): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'http://schema.org',
    '@type': 'EmailMessage',
    about: {
      '@type': 'Event',
      name: event.eventName,
      startDate: event.startDate,
      ...(event.endDate ? { endDate: event.endDate } : {}),
      ...(event.location ? { location: { '@type': 'Place', name: event.location } } : {}),
      ...(event.organizer ? { organizer: { '@type': 'Organization', name: event.organizer } } : {}),
    },
  };

  if (event.rsvpUrl) {
    (jsonLd['about'] as Record<string, unknown>)['potentialAction'] = {
      '@type': 'RsvpAction',
      name: 'RSVP',
      url: event.rsvpUrl,
    };
  }

  return jsonLd;
}

/** Build the JSON-LD <script> block to inject into the <head> of the email. */
export function buildAnnotationScript(annotation: EmailAnnotation): string {
  let schema: Record<string, unknown>;
  switch (annotation.type) {
    case 'promotion': schema = buildPromoJsonLd(annotation); break;
    case 'order':     schema = buildOrderJsonLd(annotation); break;
    case 'event':     schema = buildEventJsonLd(annotation); break;
  }
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

/** Build Gmail Promotions tab header annotations (X-GM-*) as a JSON object. */
export function buildGmailHeaders(promo: PromoAnnotation): Record<string, string> {
  const headers: Record<string, string> = {};
  if (promo.discount) headers['X-GM-DEALS-DISCOUNT'] = promo.discount;
  if (promo.expiryDate) headers['X-GM-DEALS-EXPIRY'] = promo.expiryDate;
  if (promo.promoCode) headers['X-GM-DEALS-CODE'] = promo.promoCode;
  if (promo.imageUrl) headers['X-GM-DEALS-IMAGE-URL'] = promo.imageUrl;
  return headers;
}

/**
 * Inject annotation script into email HTML <head>.
 * Returns modified HTML + extra headers to set on the outbound message.
 */
export function injectAnnotations(
  html: string,
  annotation: EmailAnnotation,
): { html: string; extraHeaders: Record<string, string> } {
  const script = buildAnnotationScript(annotation);
  const extraHeaders = annotation.type === 'promotion' ? buildGmailHeaders(annotation) : {};

  const modified = html.includes('</head>')
    ? html.replace('</head>', `${script}\n</head>`)
    : `${script}\n${html}`;

  return { html: modified, extraHeaders };
}

/** Apple Mail sender image hint (used for rich sender card in Apple Mail). */
export function buildAppleMailHeaders(logoUrl: string): Record<string, string> {
  return { 'X-Apple-Logo': logoUrl };
}
