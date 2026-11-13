// Contracts use Zod's functional build, so browsers receive only the checks a
// schema uses (no method table or JSON Schema output). Unlike `zod`, it installs
// no messages; keep the same English defaults. Its cycle memoizer is not needed:
// every contract schema is finite, without lazy or recursive members.
import * as z from 'zod/mini';
z.config(z.locales.en());
export { z };
