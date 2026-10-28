import { reviewResponseSchema } from '@snapform/contracts';
import type { Brief } from '@snapform/contracts';

export async function reviewBrief(brief: Brief): Promise<Brief> {
  const response = await fetch('/api/v1/brief/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brief),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      'We couldn’t check your brief. Your details are still here. Please try again.',
    );
  return reviewResponseSchema.parse(await response.json()).brief;
}
