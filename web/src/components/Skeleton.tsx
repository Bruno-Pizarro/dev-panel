import { cn } from '../lib/cn';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-lg bg-surface-2', className)} aria-hidden />
);
