export interface ScoreRingProps {
  score: number;
  max?: number;
  label?: string;
  color?: string;
}

export function renderScoreRing(props: ScoreRingProps): HTMLDivElement {
  const max = props.max ?? 100;
  const pct = Math.min(1, Math.max(0, props.score / max));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = props.color ?? 'var(--accent)';

  const container = document.createElement('div');
  container.className = 'score-ring';
  container.setAttribute('role', 'img');
  container.setAttribute(
    'aria-label',
    `${props.label ?? 'Score'}: ${props.score} / ${max}`,
  );

  container.innerHTML = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="score-ring-bg" cx="60" cy="60" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="4"/>
      <circle class="score-ring-fill" cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="4"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 60 60)" style="transition: stroke-dashoffset 0.6s var(--ease-out)"/>
    </svg>
    <div class="score-value">
      <span class="score-number" style="font-family:var(--font-display);font-size:1.75rem;color:var(--text-primary)">${props.score}</span>
      ${props.label ? `<span class="score-label" style="font-size:0.75rem;color:var(--text-muted)">${props.label}</span>` : ''}
    </div>
  `;

  return container;
}