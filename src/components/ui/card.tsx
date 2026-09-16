import type { HTMLAttributes, HTMLAttributes as HeadingAttrs } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-800',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HeadingAttrs<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-semibold text-text-primary dark:text-neutral-100', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}
