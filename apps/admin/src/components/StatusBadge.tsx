import { Badge } from './ui/primitives';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'info';

const SUCCESS = new Set(['DELIVERED', 'ACTIVE', 'APPROVED', 'PROCESSED', 'COMPLETED', 'CAPTURED', 'RESOLVED']);
const DANGER = new Set(['REJECTED', 'REVERSED', 'HALTED', 'OPEN', 'NO_SHOW', 'SUSPENDED']);
const MUTED = new Set(['CANCELLED', 'EXPIRED', 'ENDED', 'SKIPPED', 'DELETED', 'INACTIVE']);
const WAITING = new Set(['SCHEDULED', 'PENDING', 'PENDING_PAYMENT', 'SUBMITTED', 'IN_REVIEW', 'NOT_STARTED', 'PLANNED', 'REASSIGNED']);

function toneOf(status: string): Tone {
  if (SUCCESS.has(status)) return 'success';
  if (status.includes('FAILED') || DANGER.has(status)) return 'danger';
  if (MUTED.has(status)) return 'default';
  if (WAITING.has(status)) return 'warning';
  return 'info';
}

/** SCREAMING_SNAKE status → "Sentence case" so tables read like prose. */
export function statusLabel(status: string): string {
  const words = status.toLowerCase().split('_');
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={toneOf(status)} dot>{statusLabel(status)}</Badge>;
}
