import { render, screen } from '@testing-library/react-native';
import { StatusPill, Timeline } from './status';

describe('StatusPill', () => {
  it('announces the status to screen readers', () => {
    render(<StatusPill status="IN_TRANSIT" />);
    expect(screen.getByLabelText('Status: On the way to school')).toBeTruthy();
  });
});

describe('Timeline', () => {
  it('shows times for reached steps and the failure label', () => {
    render(
      <Timeline
        current="DELIVERY_FAILED"
        events={[
          { status: 'ASSIGNED', occurredAt: '2026-10-19T03:00:00Z' },
          { status: 'PICKED_UP', occurredAt: '2026-10-19T04:00:00Z' },
        ]}
        formatTime={(iso) => `t:${iso.slice(11, 16)}`}
      />,
    );
    expect(screen.getByText('t:03:00')).toBeTruthy();
    expect(screen.getByText('t:04:00')).toBeTruthy();
    expect(screen.getByText('Delivery problem')).toBeTruthy();
  });
});
