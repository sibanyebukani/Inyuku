import { create as createStore } from 'zustand';
import { authFetch } from '@/lib/session/authFetch';
import { useProductStore, type ProductCreateInput } from '@/lib/products/store';

export type OnboardingStep = 'profile' | 'product' | 'stock' | 'done';

const SKIP_KEY = 'inyuku_onboarding_skipped';

interface OnboardingState {
  step: OnboardingStep;
  businessName: string;
  productClientId: string | null;
  error: string | null;
  setStep: (step: OnboardingStep) => void;
  completeProfile: (businessId: string, name: string) => Promise<void>;
  createFirstProduct: (input: ProductCreateInput) => Promise<string>;
  skip: () => void;
  reset: () => void;
}

export const useOnboardingStore = createStore<OnboardingState>((set) => ({
  step: 'profile',
  businessName: '',
  productClientId: null,
  error: null,

  setStep: (step) => set({ step }),

  completeProfile: async (businessId, name) => {
    await authFetch(`/v1/businesses/${businessId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    set({ businessName: name, step: 'product', error: null });
  },

  createFirstProduct: async (input) => {
    const clientId = await useProductStore.getState().create(input);
    set({ productClientId: clientId, step: 'done', error: null });
    return clientId;
  },

  skip: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SKIP_KEY, '1');
    }
    set({ step: 'done' });
  },

  reset: () => set({ step: 'profile', businessName: '', productClientId: null, error: null }),
}));

export function hasSkippedOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SKIP_KEY) === '1';
}

export function clearOnboardingSkip(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SKIP_KEY);
}
