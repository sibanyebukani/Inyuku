import { ulid } from 'ulid';

/** Mint a client-side, time-sortable, collision-safe id for offline-created entities. */
export function newClientId(): string {
  return ulid();
}
