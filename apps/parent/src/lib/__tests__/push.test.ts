import { pushTarget } from '../push';

jest.mock('../api', () => ({ api: { notifications: {} }, realtime: {} }));

describe('pushTarget', () => {
  it('opens the order for order notifications', () => {
    expect(pushTarget({ orderId: 'o1', status: 'PICKED_UP', notificationId: 'n1' })).toBe('/orders/o1');
  });

  it('opens the inbox for broadcasts', () => {
    expect(pushTarget({ broadcastId: 'b1', notificationId: 'n1' })).toBe('/(tabs)/notifications');
  });

  it('stays put for unknown payloads', () => {
    expect(pushTarget(undefined)).toBeNull();
    expect(pushTarget({ category: 'BROADCAST' })).toBeNull();
  });
});
