import { timingSafeEqual } from "node:crypto";
import type { Settings } from "./settings.js";

// Who may read the numbers. Nobody, unless the site says otherwise: either the
// numbers are public (`public: true`), or the dashboard and the route behind it
// need the token, given as a bearer header, an `x-analytics-token` header, or
// `?token=` for a browser.
//
// A refused request is a 404 rather than a 401: an endpoint that answers
// "wrong password" has told you there is a password.

const same = (a: string, b: string) => {
  const one = Buffer.from(a);
  const two = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch; the length check in front of
  // it is the one thing a caller can learn, and a token's length is no secret.
  return one.length === two.length && timingSafeEqual(one, two);
};

/** Whether this request may see the numbers. */
export function mayRead(
  settings: Settings,
  header: (name: string) => string | null | undefined,
  query?: string | null,
): boolean {
  if (settings.isPublic()) return true;

  const want = settings.token();
  // Private with nothing to check against is nobody, not everybody.
  if (!want) return false;

  const auth = header("authorization") ?? "";
  const given =
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "") ||
    (header("x-analytics-token") ?? "") ||
    query ||
    "";
  return Boolean(given) && same(given, want);
}
