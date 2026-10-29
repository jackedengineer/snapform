// Covers the collector's 2 MiB answer limit plus bounded field/envelope metadata.
export const MAX_WEBHOOK_BYTES = 3 * 1024 * 1024;
export const MAX_WEBHOOK_ATTEMPTS = 8;
export type WebhookOutcome =
  | { status: 'acknowledged'; httpStatus: number }
  | {
      status: 'retry';
      httpStatus: number;
      reason: 'rate-limited' | 'receiver-unavailable';
      delaySeconds: number;
    }
  | {
      status: 'unknown';
      reason: 'receiver-unconfirmed';
      httpStatus: number | null;
    }
  | {
      status: 'needs_action';
      httpStatus: number | null;
      reason:
        | 'configuration'
        | 'redirect-blocked'
        | 'authorization'
        | 'receiver-rejected'
        | 'retry-later'
        | 'attempts-exhausted';
    };
