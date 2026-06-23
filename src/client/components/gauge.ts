export interface GaugeProps {
  label: string;
  value: number | string;
  unit: string;
  color?: string;
}

export function renderGauge(props: GaugeProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'gauge';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${props.label}: ${props.value} ${props.unit}`);

  const label = document.createElement('div');
  label.className = 'gauge-label';
  label.textContent = props.label;
  el.appendChild(label);

  const value = document.createElement('div');
  value.className = 'gauge-value';
  value.style.fontFamily = 'var(--font-display)';
  value.style.fontSize = '2rem';
  value.style.color = props.color ?? 'var(--text-primary)';
  value.textContent = String(props.value);
  el.appendChild(value);

  const unit = document.createElement('div');
  unit.className = 'gauge-unit';
  unit.textContent = props.unit;
  el.appendChild(unit);

  return el;
}