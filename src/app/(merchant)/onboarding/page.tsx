'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useOnline } from '@/lib/offline/useOnline';
import { useProductStore } from '@/lib/products/store';
import { centsToZAR, zarToCents } from '@/lib/offline/money';
import {
  useOnboardingStore,
  hasSkippedOnboarding,
  type OnboardingStep,
} from '@/lib/onboarding/store';
import {
  businessProfileSchema,
  onboardingProductSchema,
  openingStockSchema,
  type BusinessProfileValues,
  type OnboardingProductValues,
  type OpeningStockValues,
} from '@/lib/onboarding/schema';

function StepIndicator({ current }: { current: OnboardingStep }) {
  const steps: { key: OnboardingStep; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'product', label: 'Product' },
    { key: 'stock', label: 'Stock' },
  ];
  const index = steps.findIndex((s) => s.key === current);
  return (
    <div className="mb-6 flex items-center justify-between">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i <= index ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {i + 1}
          </div>
          <span className="ml-2 hidden text-sm sm:inline">{s.label}</span>
          {i < steps.length - 1 && (
            <div className={`mx-2 h-px flex-1 ${i < index ? 'bg-emerald-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ProfileStep({ businessId, onDone }: { businessId: string; onDone: () => void }) {
  const completeProfile = useOnboardingStore((s) => s.completeProfile);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BusinessProfileValues>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: { name: '' },
  });

  async function onSubmit(values: BusinessProfileValues) {
    setApiError(null);
    try {
      await completeProfile(businessId, values.name);
      onDone();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Could not update profile');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium">What is your business called?</h2>
      <div>
        <label htmlFor="businessName" className="block text-sm font-medium">
          Business name
        </label>
        <input
          id="businessName"
          {...register('name')}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>
      {apiError && <p className="text-sm text-red-600">{apiError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
      >
        Continue
      </button>
    </form>
  );
}

function ProductStep({
  businessId,
  onDone,
}: {
  businessId: string;
  onDone: (productValues: OnboardingProductValues) => void;
}) {
  const { hasPerm } = useSession();
  const canSeeCost = hasPerm('catalog:read_cost');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingProductValues>({
    resolver: zodResolver(onboardingProductSchema),
    defaultValues: {
      name: '',
      sellPrice: '',
      costPrice: '',
      lowStockThreshold: '',
    },
  });

  async function onSubmit(values: OnboardingProductValues) {
    onDone(values);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium">Add your first product</h2>
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Product name
        </label>
        <input id="name" {...register('name')} className="mt-1 w-full rounded border px-3 py-2" />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="sellPrice" className="block text-sm font-medium">
          Sell price (R)
        </label>
        <input
          id="sellPrice"
          inputMode="decimal"
          {...register('sellPrice')}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {errors.sellPrice && <p className="text-sm text-red-600">{errors.sellPrice.message}</p>}
      </div>
      {canSeeCost && (
        <div>
          <label htmlFor="costPrice" className="block text-sm font-medium">
            Cost price (R)
          </label>
          <input
            id="costPrice"
            inputMode="decimal"
            {...register('costPrice')}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
      )}
      <div>
        <label htmlFor="lowStockThreshold" className="block text-sm font-medium">
          Low-stock threshold
        </label>
        <input
          id="lowStockThreshold"
          inputMode="numeric"
          {...register('lowStockThreshold')}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {errors.lowStockThreshold && (
          <p className="text-sm text-red-600">{errors.lowStockThreshold.message}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
      >
        Continue
      </button>
    </form>
  );
}

function StockStep({
  productValues,
  onDone,
}: {
  productValues: OnboardingProductValues;
  onDone: (openingStock: number) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OpeningStockValues>({
    resolver: zodResolver(openingStockSchema),
    defaultValues: { openingStock: '' },
  });

  async function onSubmit(values: OpeningStockValues) {
    onDone(Number(values.openingStock));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium">Set opening stock</h2>
      <p className="text-sm text-gray-600">
        How many units of <span className="font-medium">{productValues.name}</span> do you have in stock?
      </p>
      <div>
        <label htmlFor="openingStock" className="block text-sm font-medium">
          Opening stock
        </label>
        <input
          id="openingStock"
          inputMode="numeric"
          {...register('openingStock')}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {errors.openingStock && (
          <p className="text-sm text-red-600">{errors.openingStock.message}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
      >
        Finish
      </button>
    </form>
  );
}

function DoneStep({ productClientId }: { productClientId: string | null }) {
  const router = useRouter();
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-medium">You&apos;re all set</h2>
      <p className="text-sm text-gray-600">
        {productClientId
          ? 'Your first product has been saved and will sync when you are online.'
          : 'Your business profile has been updated.'}
      </p>
      <button
        type="button"
        onClick={() => router.push('/products')}
        className="rounded bg-emerald-600 px-4 py-2 text-white"
      >
        Go to products
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const { activeBusinessId, hasPerm } = useSession();
  const online = useOnline();
  const router = useRouter();
  const products = useProductStore((s) => s.items);
  const loadProducts = useProductStore((s) => s.load);

  const step = useOnboardingStore((s) => s.step);
  const setStep = useOnboardingStore((s) => s.setStep);
  const createFirstProduct = useOnboardingStore((s) => s.createFirstProduct);
  const skip = useOnboardingStore((s) => s.skip);
  const productClientId = useOnboardingStore((s) => s.productClientId);
  const reset = useOnboardingStore((s) => s.reset);

  const [productValues, setProductValues] = useState<OnboardingProductValues | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    // Only auto-redirect on the initial profile step. Once the merchant has
    // started the wizard we stay on the page until they finish or skip.
    if (step !== 'profile') return;
    if (products.length > 0 || hasSkippedOnboarding()) {
      router.replace('/products');
      return;
    }
    setChecking(false);
  }, [products, router, step]);

  useEffect(() => {
    return () => {
      // Reset ephemeral wizard state when the page unmounts so a later visit starts fresh,
      // but keep the localStorage skip flag intact.
      reset();
    };
  }, [reset]);

  async function handleProductSubmit(values: OnboardingProductValues) {
    setProductValues(values);
    setStep('stock');
  }

  async function handleStockSubmit(openingStock: number) {
    if (!productValues) return;
    const input = {
      name: productValues.name,
      sellPriceCents: zarToCents(productValues.sellPrice),
      ...(hasPerm('catalog:read_cost') && productValues.costPrice
        ? { costPriceCents: zarToCents(productValues.costPrice) }
        : {}),
      ...(productValues.lowStockThreshold
        ? { lowStockThreshold: Number(productValues.lowStockThreshold) }
        : {}),
      openingStock,
    };
    await createFirstProduct(input);
  }

  if (checking) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Welcome to Inyuku</h1>
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to Inyuku</h1>
          <p className="text-sm text-gray-600">Let&apos;s get your shop ready in a few steps.</p>
        </div>
        {!online && (
          <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">Offline</span>
        )}
      </div>

      {step !== 'done' && <StepIndicator current={step} />}

      <div className="rounded border p-4">
        {step === 'profile' && (
          <ProfileStep businessId={activeBusinessId} onDone={() => setStep('product')} />
        )}
        {step === 'product' && (
          <ProductStep businessId={activeBusinessId} onDone={handleProductSubmit} />
        )}
        {step === 'stock' && productValues && (
          <StockStep productValues={productValues} onDone={handleStockSubmit} />
        )}
        {step === 'done' && <DoneStep productClientId={productClientId} />}
      </div>

      {step !== 'done' && (
        <div className="text-center">
          <button
            type="button"
            onClick={skip}
            className="text-sm text-gray-600 underline"
          >
            Skip setup for now
          </button>
        </div>
      )}
    </div>
  );
}

