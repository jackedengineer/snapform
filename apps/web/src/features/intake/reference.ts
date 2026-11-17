// The inbox lists responses by the same leading characters of the session id.
export function responseReference(sessionId: string) {
  const hex = sessionId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex))
    throw new Error('A response reference needs a session identity.');
  const code = hex.slice(0, 8).toUpperCase();
  return code.slice(0, 4) + '-' + code.slice(4);
}
