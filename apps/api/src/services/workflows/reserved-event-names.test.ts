import { describe, it, expect } from 'vitest';
import { isReservedEventName } from './reserved-event-names.js';

describe('isReservedEventName (Z161)', () => {
  it.each([
    'ticketing.order_paid',
    'ticketing.event_changed',
    'ticketing.day_of_reminder',
    'ticketing.day_of_sms',
    'ticketing.lottery_won',
    'ticketing.',
    'Ticketing.Order_Paid',
    'TICKETING.ORDER_PAID',
  ])('%s is reserved', (name) => {
    expect(isReservedEventName(name)).toBe(true);
  });

  it.each([
    'viewed_product',
    'order_paid',
    'payment_pending',
    'pickup_ready',
    'order_shipped',
    'checkout_started',
    'ticketing',
    'ticketing_order_paid',
    ' ticketing.order_paid',
    'x.ticketing.order_paid',
  ])('%s is not reserved', (name) => {
    expect(isReservedEventName(name)).toBe(false);
  });
});
