export interface SubNavSection {
  id: string;
  label: string;
}

export function renderSubNav(
  sections: SubNavSection[],
  activeId: string,
  onSwitch?: (id: string) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'pill-nav';

  for (const section of sections) {
    const pill = document.createElement('button');
    pill.className = 'pill';
    if (section.id === activeId) pill.classList.add('active');
    pill.textContent = section.label;
    pill.addEventListener('click', () => {
      container.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      onSwitch?.(section.id);
    });
    container.appendChild(pill);
  }

  return container;
}