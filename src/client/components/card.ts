export interface CardProps {
  title: string;
  grade?: string;
  children?: HTMLElement[];
}

export function renderCard(props: CardProps): HTMLElement {
  const el = document.createElement('div');
  el.className = 'result-card';

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement('h3');
  title.className = 'card-title';
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
    for (const child of props.children) {
      body.appendChild(child);
    }
    el.appendChild(body);
  }

  return el;
}
