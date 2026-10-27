import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { Check } from '../lib/types';
import { cn } from '../lib/cn';

const icons = { ok: CircleCheck, warn: CircleAlert, error: CircleX };
const colors = { ok: 'text-success', warn: 'text-warning', error: 'text-danger' };

export const CheckList = ({ checks }: { checks: Check[] }) => (
  <ul className="divide-y divide-line">
    {checks.map((check) => {
      const Icon = icons[check.status];
      return (
        <li key={check.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <Icon className={cn('mt-0.5 size-5 shrink-0', colors[check.status])} aria-label={check.status} />
          <div className="min-w-0">
            <div className="font-medium">{check.title}</div>
            <div className="text-sm text-muted">{check.detail}</div>
          </div>
        </li>
      );
    })}
  </ul>
);
