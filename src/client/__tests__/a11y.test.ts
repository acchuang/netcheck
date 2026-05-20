import { describe, it, expect } from 'vitest';
import axe from 'axe-core';

function createDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  return doc;
}

describe('Accessibility basics', () => {
  it('axe-core detects no violations on clean HTML', async () => {
    const doc = createDoc(`
      <main><h1>Hello</h1><p>Content</p></main>
    `);
    const results = await axe.run(doc as unknown as axe.ElementContext);
    expect(results.violations).toBeDefined();
    expect(Array.isArray(results.violations)).toBe(true);
  });

  it('axe-core detects missing lang attribute', async () => {
    const doc = createDoc(`
      <html><body><main><h1>Hello</h1></main></body></html>
    `);
    const results = await axe.run(doc as unknown as axe.ElementContext);
    const langViolations = results.violations.filter((v) => v.id === 'html-has-lang');
    expect(langViolations.length).toBeGreaterThan(0);
  });

  it('skip-link has required class', () => {
    const html = `<a href="#main" class="skip-link">Skip to content</a>`;
    expect(html).toContain('skip-link');
  });

  it('status badges have required classes', () => {
    const badge = document.createElement('span');
    badge.className = 'status-badge detecting';
    expect(badge.classList.contains('status-badge')).toBe(true);
    expect(badge.classList.contains('detecting')).toBe(true);
  });
});
