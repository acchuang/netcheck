import { describe, it, expect } from 'vitest';
import axe from 'axe-core';
import fs from 'fs';
import path from 'path';
import { createCheckItem } from '../ui-utils';

// Phase 2 a11y regression guards. These run in jsdom via `npm test` (no browser needed),
// locking in the work from .opencode/plans/2026-06-17-bugfix-enhancements.md (Issue A + B + C):
//   - every decorative inline SVG is aria-hidden (status stays accessible via adjacent text)
//   - every static button has an accessible name (axe button-name)
//   - createCheckItem's status icon is aria-hidden (status conveyed by the `value` text)
const INDEX_HTML = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('Static accessibility guards (Phase 2)', () => {
  it('every inline SVG in index.html is aria-hidden="true" (decorative)', () => {
    const doc = parseHtml(INDEX_HTML);
    const svgs = Array.from(doc.querySelectorAll('svg'));
    expect(svgs.length).toBeGreaterThan(0);
    const unhidden = svgs.filter((s) => s.getAttribute('aria-hidden') !== 'true');
    expect(unhidden).toEqual([]);
  });

  it('index.html buttons all have an accessible name (axe button-name: 0 violations)', async () => {
    const parsed = parseHtml(INDEX_HTML);
    const doc = document.implementation.createHTMLDocument('');
    const lang = parsed.documentElement.getAttribute('lang');
    if (lang) doc.documentElement.setAttribute('lang', lang);
    doc.body.innerHTML = parsed.body.innerHTML;
    const results = await axe.run(doc as unknown as axe.ElementContext, {
      runOnly: { type: 'rule', values: ['button-name'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('createCheckItem status icon is aria-hidden (status stays in the value text)', () => {
    const item = createCheckItem('pass', 'Cloudflare DNS (1.1.1.1)', 'reachable');
    const svg = item.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
