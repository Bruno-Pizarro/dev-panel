import { Hammer } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import type { NavItem } from '../lib/nav';

export const ComingSoon = ({ item }: { item: NavItem }) => (
  <>
    <PageHeader title={item.label} description={item.description} />
    <EmptyState icon={<Hammer className="size-6" />} title={`Llega en la Fase ${item.phase}`}>
      Esta vista todavía no está construida. El detalle de lo que va a hacer está en docs/PLAN.md.
    </EmptyState>
  </>
);
