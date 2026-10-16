import { ThemeProvider } from '@lunchbox/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import '../../i18n';
import { api } from '../../lib/api';
import { PickupCode } from '../PickupCode';

jest.mock('../../lib/api', () => ({
  api: { orders: { pickupCode: jest.fn() } },
  realtime: {},
}));

describe('PickupCode', () => {
  it('shows the OTP returned by the API', async () => {
    (api.orders.pickupCode as jest.Mock).mockResolvedValue({
      orderId: 'o1',
      otp: '482913',
      qrToken: 'LB1.o1.1.abc.sig',
      qrExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      otpExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThemeProvider>
          <PickupCode orderId="o1" />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('482913')).toBeTruthy();
  });
});
