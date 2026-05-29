import type { SecurityStatus } from '../types';

export interface BadgeProps {
  status: SecurityStatus;
  label: string;
  detail?: string;
}

export function renderBadge(props: BadgeProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `badge-pill badge-pill-${props.status}`;
  el.textContent = props.detail ? `${props.label}: ${props.detail}` : props.label;
  return el;
}