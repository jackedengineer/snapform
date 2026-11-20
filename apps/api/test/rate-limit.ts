// Miniflare counts every 60-second limiter in windows aligned to the wall
// clock, so a minute boundary between filling a limiter and the request resets
// the count and lets the request through. Fill the limiter until it refuses,
// send, and start again when the minute changed in between: a test then only
// judges a request made while its limiter was still full.
const minute = () => Math.floor(Date.now() / 60_000);
export async function sendWhileFull(
  limiter: RateLimit,
  key: string,
  send: () => Promise<Response>,
): Promise<Response> {
  for (;;) {
    const window = minute();
    let allowed = true;
    while (allowed) allowed = (await limiter.limit({ key })).success;
    const response = await send();
    if (minute() === window) return response;
  }
}
