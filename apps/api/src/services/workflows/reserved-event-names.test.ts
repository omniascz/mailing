import { describe, it, expect } from 'vitest';
import { isReservedEventName } from './reserved-event-names.js';

describe('isReservedEventName (Z161, Z165)', () => {
  it.each([
    'ticketing.order_paid',
    'ticketing.event_changed',
    'ticketing.day_of_reminder',
    'ticketing.day_of_sms',
    'ticketing.lottery_won',
    'ticketing.',
    'Ticketing.Order_Paid',
    'TICKETING.ORDER_PAID',
    // Z165 (Michal, 15. 10. ~21:30, point 1d, variant a): whole names, any case.
    'payment_pending',
    'pickup_ready',
    'order_shipped',
    'PAYMENT_PENDING',
    'Pickup_Ready',
    'Order_Shipped',
  ])('%s is reserved', (name) => {
    expect(isReservedEventName(name)).toBe(true);
  });

  it.each([
    'viewed_product',
    'order_paid',
    // Z165: the three are reserved now (above); a longer or shorter name is not.
    'order_shipped_late',
    'payment_pending_reminder',
    'pickup_ready_soon',
    'payment',
    'order_shipped.',
    ' payment_pending',
    'payment_pending ',
    'x.order_shipped',
    'checkout_started',
    'ticketing',
    'ticketing_order_paid',
    ' ticketing.order_paid',
    'x.ticketing.order_paid',
  ])('%s is not reserved', (name) => {
    expect(isReservedEventName(name)).toBe(false);
  });
});
