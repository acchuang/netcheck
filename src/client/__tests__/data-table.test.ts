import { describe, it, expect } from 'vitest';
import { renderDataTable } from '../components/data-table';

describe('renderDataTable', () => {
  it('renders a table from headers and rows', () => {
    const el = renderDataTable({
      headers: ['Type', 'Value', 'TTL'],
      rows: [
        ['A', '1.2.3.4', '300'],
        ['MX', 'mail.example.com', '3600'],
      ],
    });
    expect(el.tagName).toBe('TABLE');
    expect(el.querySelectorAll('th').length).toBe(3);
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('renders empty state when no rows', () => {
    const el = renderDataTable({ headers: ['A'], rows: [] });
    expect(el.querySelector('tbody tr')?.textContent).toContain('No records');
  });
});