// Right after a submit the database is awake, so Jobs sends the owner email and
// webhooks now instead of at the next sweep. A failed wake loses nothing: the
// submit committed the delivery rows, and the sweep picks them up.
export async function wakeResponseDelivery(service: Pick<Fetcher, 'fetch'>) {
  try {
    const response = await service.fetch(
      new Request('https://jobs.internal/dispatch/responses', {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      }),
    );
    await response.body?.cancel();
    if (!response.ok) throw Error('Wake unavailable');
  } catch {
    console.error(JSON.stringify({ event: 'response_wake_unavailable' }));
  }
}
