import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full h-12 px-4 rounded-lg text-[15px] bg-cream dark:bg-neutral-900 border border-border-light dark:border-neutral-700 text-text-primary dark:text-neutral-100 outline-none transition-shadow duration-150 focus:ring-2 focus:ring-accent-orange disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
