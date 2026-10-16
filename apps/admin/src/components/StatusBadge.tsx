import { Badge } from './ui/primitives';

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'DELIVERED' || status === 'ACTIVE' || status === 'APPROVED' || status === 'PROCESSED' || status === 'COMPLETED'
      ? 'success'
      : status.includes('FAILED') || status === 'REJECTED' || status === 'REVERSED' || status === 'HALTED' || status === 'OPEN'
        ? 'danger'
        : status === 'CANCELLED' || status === 'EXPIRED'
          ? 'default'
          : 'info';
  return <Badge tone={tone}>{status.replaceAll('_', ' ')}</Badge>;
}
