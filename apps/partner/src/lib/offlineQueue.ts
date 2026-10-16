import { ApiError, newIdempotencyKey, type Schemas } from '@lunchbox/api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from './api';

/**
 * Durable queue for state-changing partner actions. Each action gets its Idempotency-Key when it is created, so a
 * replay after reconnecting (or after the app was killed) is de-duplicated by the server.
 */
export type QueuedAction =
  | { kind: 'pickup'; orderId: string; body: Schemas['PickupConfirmRequest'] }
  | { kind: 'pickupFailed'; orderId: string; body: Schemas['FailureRequest'] }
  | { kind: 'handover'; schoolId: string; body: Schemas['HandoverRequest'] }
  | { kind: 'deliveryFailed'; orderId: string; body: Schemas['FailureRequest'] }
  | { kind: 'issue'; body: Schemas['IssueRequest'] };

export interface QueueItem {
  id: string;
  idempotencyKey: string;
  action: QueuedAction;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

interface QueueState {
  items: QueueItem[];
  failed: QueueItem[];
  flushing: boolean;
  enqueue: (action: QueuedAction) => QueueItem;
  flush: () => Promise<void>;
  dismissFailed: (id: string) => void;
}

async function execute(item: QueueItem) {
  const a = item.action;
  const key = item.idempotencyKey;
  switch (a.kind) {
    case 'pickup':
      return api.partner.pickup(a.orderId, a.body, key);
    case 'pickupFailed':
      return api.partner.pickupFailed(a.orderId, a.body, key);
    case 'handover':
      return api.partner.handover(a.schoolId, a.body, key);
    case 'deliveryFailed':
      return api.partner.deliveryFailed(a.orderId, a.body, key);
    case 'issue':
      return api.partner.reportIssue(a.body, key);
  }
}

export const useActionQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      failed: [],
      flushing: false,
      enqueue: (action) => {
        const item: QueueItem = {
          id: newIdempotencyKey(),
          idempotencyKey: newIdempotencyKey(),
          action,
          createdAt: new Date().toISOString(),
          attempts: 0,
        };
        set((s) => ({ items: [...s.items, item] }));
        return item;
      },
      flush: async () => {
        if (get().flushing) return;
        set({ flushing: true });
        try {
          for (const item of [...get().items]) {
            try {
              await execute(item);
              set((s) => ({ items: s.items.filter((i) => i.id !== item.id) }));
            } catch (e) {
              const retryable = !(e instanceof ApiError) || e.retryable;
              if (retryable) {
                set((s) => ({
                  items: s.items.map((i) =>
                    i.id === item.id ? { ...i, attempts: i.attempts + 1, lastError: String((e as Error).message) } : i,
                  ),
                }));
                break; // keep order: later actions often depend on earlier ones
              }
              set((s) => ({
                items: s.items.filter((i) => i.id !== item.id),
                failed: [...s.failed, { ...item, lastError: (e as Error).message }],
              }));
            }
          }
        } finally {
          set({ flushing: false });
        }
      },
      dismissFailed: (id) => set((s) => ({ failed: s.failed.filter((i) => i.id !== id) })),
    }),
    {
      name: 'lunchbox.partner.actions',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items, failed: s.failed }),
    },
  ),
);

/** Flushes whenever connectivity returns. Returns an unsubscribe function. */
export function bindConnectivity(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void useActionQueue.getState().flush();
    }
  });
}

/** Runs an action now; if the device is offline or the server is unreachable it is queued for later. */
export async function runOrQueue(action: QueuedAction): Promise<{ queued: boolean }> {
  const item = useActionQueue.getState().enqueue(action);
  await useActionQueue.getState().flush();
  const stillQueued = useActionQueue.getState().items.some((i) => i.id === item.id);
  const failed = useActionQueue.getState().failed.find((i) => i.id === item.id);
  if (failed) {
    useActionQueue.getState().dismissFailed(item.id);
    throw new Error(failed.lastError ?? 'Action failed');
  }
  return { queued: stillQueued };
}
