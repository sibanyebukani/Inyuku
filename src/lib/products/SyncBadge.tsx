import type { SyncState } from '@/lib/offline/types';

const LABEL: Record<SyncState, string> = {
  pending: 'Pending', synced: 'Synced', conflict: 'Conflict', error: 'Failed',
};
const COLOR: Record<SyncState, string> = {
  pending: 'bg-amber-100 text-amber-800',
  synced: 'bg-emerald-100 text-emerald-800',
  conflict: 'bg-orange-100 text-orange-800',
  error: 'bg-red-100 text-red-800',
};

export function SyncBadge({ state }: { state: SyncState }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${COLOR[state]}`}>{LABEL[state]}</span>;
}
