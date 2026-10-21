const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** Markup that has already been escaped or is trusted; `html` won't touch it again. */
export class Safe {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export const raw = (markup: string): Safe => new Safe(markup);

function part(v: unknown): string {
  if (v instanceof Safe) return v.value;
  if (Array.isArray(v)) return v.map(part).join("");
  return escapeHtml(v);
}

/** Tagged template: every `${}` is escaped unless it's `Safe` (or an array of values). */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0];
  values.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return new Safe(out);
}

export function setHtml(el: { innerHTML: string }, markup: Safe): void {
  el.innerHTML = markup.value;
}
