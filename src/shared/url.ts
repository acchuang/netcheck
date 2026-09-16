// One copy of the scheme test. It lived in the Worker's headers-check, was
// fixed there, and the ad-block custom-URL probe kept its own broken variant —
// which is the usual fate of a two-line helper that gets retyped.

/** True when the input already names a URL scheme (`https://`, `ftp://`, …). */
export function hasScheme(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
}

/**
 * Prefix a bare host with `https://`, leaving anything that already names a
 * scheme untouched so the caller can reject it on its own merits.
 *
 * Replaces `input.startsWith("http")`, which mis-handles both ends: "ftp://x"
 * gets an https:// prefix glued onto a scheme it already has, and "httpfoo.com"
 * is taken for an absolute URL, then resolved as a path against the current
 * origin — a 404 that an ad-block probe reads as "blocked".
 */
export function withHttpsScheme(input: string): string {
  return hasScheme(input) ? input : `https://${input}`;
}
