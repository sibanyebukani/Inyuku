import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-12 px-4 rounded-lg text-[15px] bg-cream dark:bg-neutral-900 border border-border-light dark:border-neutral-700 text-text-primary dark:text-neutral-100 outline-none transition-shadow duration-150 focus:ring-2 focus:ring-accent-orange disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
