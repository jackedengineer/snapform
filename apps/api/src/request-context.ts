import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthEnvironment } from './environment.ts';
export const requestScope = new AsyncLocalStorage<{
  environment: Env & AuthEnvironment;
  context: ExecutionContext;
}>();
