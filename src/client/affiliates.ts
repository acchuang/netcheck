const AFFILIATE_LINKS: Record<string, string> = {
  "https://1.1.1.1": "https://1.1.1.1",
  "https://one.one.one.one/family": "https://one.one.one.one/family",
  "https://quad9.net": "https://quad9.net",
  "https://nextdns.io": "https://nextdns.io/?from=netcheck",
  "https://adguard-dns.io": "https://adguard-dns.io/?partner=netcheck",
  "https://pi-hole.net": "https://pi-hole.net",
  "https://brave.com": "https://brave.com/?ref=netcheck",
  "https://privacypossum.com": "https://privacypossum.com",
  "https://canvasblocker.net": "https://canvasblocker.net",
  "https://ublockorigin.com": "https://ublockorigin.com",
  "https://privacybadger.org": "https://privacybadger.org",
  "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/":
    "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/",
  "https://www.cloudflare.com/dns/dnssec/how-dnssec-works/":
    "https://www.cloudflare.com/dns/dnssec/how-dnssec-works/",
  "https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm":
    "https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm",
  "https://addons.mozilla.org/firefox/addon/facebook-container/":
    "https://addons.mozilla.org/firefox/addon/facebook-container/",
  "https://addons.mozilla.org/firefox/addon/canvasblocker/":
    "https://addons.mozilla.org/firefox/addon/canvasblocker/",
  "https://www.i-dont-care-about-cookies.eu":
    "https://www.i-dont-care-about-cookies.eu",
};

export function affiliate(url: string | null | undefined): string | null {
  if (!url) return null;
  const exact = AFFILIATE_LINKS[url];
  if (exact) return exact;
  for (const [key, val] of Object.entries(AFFILIATE_LINKS)) {
    if (url.startsWith(key)) return val + url.slice(key.length);
  }
  return url;
}