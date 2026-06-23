const WORKFLOWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'dns', label: 'DNS' },
  { id: 'speed', label: 'Speed' },
  { id: 'security', label: 'Security' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'ai', label: 'AI' },
] as const;

export function renderWorkflowNav(active: string = 'overview'): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  nav.setAttribute('role', 'tablist');

  for (const wf of WORKFLOWS) {
    const link = document.createElement('a');
    link.href = `#${wf.id}`;
    link.className = 'tab-link';
    link.setAttribute('data-tab', wf.id);
    link.setAttribute('role', 'tab');
    link.textContent = wf.label;
    if (wf.id === active) link.classList.add('active');
    nav.appendChild(link);
  }

  return nav;
}