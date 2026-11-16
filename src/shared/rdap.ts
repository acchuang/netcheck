// RDAP is the registries' own record of who holds an address block, so the
// country is where it's registered — the same thing a site's geo-IP sees.

let nameToCode: Map<string, string> | null = null;

/** "United States" → "US", built from Intl rather than a hand-kept table. */
function countryCode(name: string): string | null {
  if (!nameToCode) {
    nameToCode = new Map();
    const names = new Intl.DisplayNames("en", { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = names.of(code);
        if (n && n !== code) nameToCode.set(n.toLowerCase(), code);
      }
    }
  }
  return nameToCode.get(name.trim().toLowerCase()) ?? null;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, [string, Record<string, unknown>, string, unknown][]];
  entities?: RdapEntity[];
}

function registrantCountry(entities: RdapEntity[] | undefined): string | null {
  for (const e of entities ?? []) {
    if (e.roles?.includes("registrant")) {
      const adr = e.vcardArray?.[1]?.find((p) => p[0] === "adr");
      const label = adr?.[1]?.label;
      if (typeof label === "string") {
        const code = countryCode(label.split("\n").pop() ?? "");
        if (code) return code;
      }
    }
    const nested = registrantCountry(e.entities);
    if (nested) return nested;
  }
  return null;
}

/**
 * APNIC, RIPE, LACNIC and AFRINIC put an ISO code in `country`. ARIN leaves it
 * out and only writes the country name as the last line of the registrant's
 * postal address.
 */
export function rdapCountry(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { country?: unknown; entities?: RdapEntity[] };
  if (typeof b.country === "string" && /^[A-Za-z]{2}$/.test(b.country)) return b.country.toUpperCase();
  return registrantCountry(b.entities);
}
