export interface CardProps {
  title: string;
  variant?: 'default' | 'hero' | 'compact' | 'wide';
  accent?: 'green' | 'amber' | 'rose' | 'cyan' | 'purple' | 'orange';
  grade?: string;
  children?: HTMLElement[];
}

export function renderCard(props: CardProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'card';
  if (props.variant && props.variant !== 'default') {
    el.classList.add(`card-${props.variant}`);
  }
  if (props.accent) {
    el.classList.add(`card-accent-${props.accent}`);
  }

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement(props.variant === 'hero' ? 'h2' : 'h3');
  title.className = 'card-title';
  title.style.fontFamily = 'var(--font-display)';
  title.textContent = props.title;
  header.appendChild(title);

  if (props.grade) {
    const grade = document.createElement('span');
    grade.className = 'card-grade';
    grade.textContent = props.grade;
    header.appendChild(grade);
  }

  el.appendChild(header);

  if (props.children) {
    const body = document.createElement('div');
    body.className = 'card-body';
    for (const child of props.children) body.appendChild(child);
    el.appendChild(body);
  }

  return el;
}