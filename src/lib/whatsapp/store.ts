import { create as createStore } from 'zustand';
import { listConversations, type Conversation } from './api';

interface ConversationState {
  conversations: Conversation[];
  /** True after a fetch failed — the list is in-memory last-good, possibly stale. */
  stale: boolean;
  loading: boolean;
  loaded: boolean;
  lastFetchedAt: string | null;
  /** Initial load (sets loading); refresh() is the silent poll/manual variant. */
  load: (businessId: string) => Promise<void>;
  refresh: (businessId: string) => Promise<void>;
}

const PAGE = { page: 1, limit: 50 };

export const useConversationStore = createStore<ConversationState>((set) => ({
  conversations: [],
  stale: false,
  loading: false,
  loaded: false,
  lastFetchedAt: null,

  async load(businessId) {
    set({ loading: true });
    try {
      const { conversations } = await listConversations(businessId, PAGE);
      set({
        conversations,
        stale: false,
        loading: false,
        loaded: true,
        lastFetchedAt: new Date().toISOString(),
      });
    } catch {
      // Keep last-good in memory; mark stale, never throw to an error boundary.
      set({ loading: false, loaded: true, stale: true });
    }
  },

  async refresh(businessId) {
    try {
      const { conversations } = await listConversations(businessId, PAGE);
      set({
        conversations,
        stale: false,
        loaded: true,
        lastFetchedAt: new Date().toISOString(),
      });
    } catch {
      set({ stale: true });
    }
  },
}));
