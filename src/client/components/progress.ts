export interface ProgressProps {
  percent: number;
  label?: string;
  indeterminate?: boolean;
}

export function renderProgress(props: ProgressProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'progress-bar';

  if (props.label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'progress-label';
    labelEl.textContent = props.label;
    el.appendChild(labelEl);
  }

  const fill = document.createElement('div');
  fill.className = `progress-fill${props.indeterminate ? ' indeterminate' : ''}`;
  if (!props.indeterminate) {
    fill.style.width = `${Math.min(100, Math.max(0, props.percent))}%`;
  }
  el.appendChild(fill);

  return el;
}