export interface DataTableProps {
  headers: string[];
  rows: string[][];
  monoColumns?: number[];
}

export function renderDataTable(props: DataTableProps): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of props.headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (props.rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = props.headers.length;
    td.className = 'data-table-empty';
    td.textContent = 'No records found';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const row of props.rows) {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement('td');
        if (props.monoColumns?.includes(i)) {
          td.className = 'mono';
          td.style.fontFamily = 'var(--font-mono)';
        }
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);

  return table;
}