import { createFileRoute } from '@tanstack/react-router';
import { Pricing } from '../features/billing/Pricing';
export const Route = createFileRoute('/pricing')({
  component: Pricing,
  head: () => ({ meta: [{ title: 'Pricing · Snapform' }] }),
});
