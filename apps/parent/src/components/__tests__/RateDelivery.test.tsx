import { ThemeProvider } from '@lunchbox/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import '../../i18n';
import { api } from '../../lib/api';
import { RateDelivery } from '../RateDelivery';

jest.mock('../../lib/api', () => ({
  api: { orders: { rate: jest.fn() } },
  realtime: {},
}));

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>{node}</ThemeProvider>
    </QueryClientProvider>
  );
}

describe('RateDelivery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submits the selected stars and trimmed comment', async () => {
    (api.orders.rate as jest.Mock).mockResolvedValue({ order: { ratingStars: 4 }, timeline: [] });
    render(wrap(<RateDelivery orderId="o1" rated={null} canRate />));

    fireEvent.press(screen.getByTestId('rate-star-4'));
    fireEvent.changeText(screen.getByLabelText('Anything to add? (optional)'), '  On time  ');
    fireEvent.press(screen.getByTestId('rate-submit'));

    await waitFor(() => expect(api.orders.rate).toHaveBeenCalledWith('o1', { stars: 4, comment: 'On time' }));
  });

  it('shows the existing rating instead of the form', () => {
    render(wrap(<RateDelivery orderId="o1" rated={5} canRate={false} />));
    expect(screen.getByText('Your rating')).toBeTruthy();
    expect(screen.queryByTestId('rate-submit')).toBeNull();
  });

  it('renders nothing when the rating window is closed', () => {
    render(wrap(<RateDelivery orderId="o1" rated={null} canRate={false} />));
    expect(screen.queryByTestId('rate-submit')).toBeNull();
  });
});
