// Kept free of schema code: the sign-in redirect loads it on every account page.
// 32 random bytes as unpadded base64url: 43 characters, the last carrying
// only 4 bits, so a canonical token ends in one of 16 characters.
export const invitationTokenPattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
// The link carries the token in its fragment, which browsers never send to a server.
export function invitationTokenFromFragment(fragment: string) {
  const token = /^#token=([^&=#]*)$/.exec(fragment)?.[1] ?? '';
  return invitationTokenPattern.test(token) ? token : null;
}
