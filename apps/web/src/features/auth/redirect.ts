const fallback = '/app';
// Only signed-in account pages may be resumed after sign-in. Anything else,
// including other origins, auth pages and encoded traversal, uses the fallback.
const accountPath =
  /^\/(?:app|workspaces\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)(?:\?[A-Za-z0-9_\-=&%.]*)?$/;
export function accountRedirect(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return fallback;
  return accountPath.test(value) ? value : fallback;
}
// Search params for sending a signed-out visitor of an account page to sign-in.
// Only deep account pages are remembered; sign-in pages are never nested.
export function signInSearch(
  pathname: string,
  searchStr: string,
): { redirect?: string } {
  const target = `${pathname}${searchStr}`;
  return target !== fallback && accountRedirect(target) === target
    ? { redirect: target }
    : {};
}
