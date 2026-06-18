import { t } from './i18n';
import { appState } from './state/shared-state';
import { breachState } from './state/breach-state';

async function sha1Hash(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface BreachResult {
  found: boolean;
  count: number;
}

async function checkBreach(password: string): Promise<BreachResult> {
  const hash = await sha1Hash(password);
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5).toUpperCase();

  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  if (!response.ok) {
    throw new Error(`HIBP API returned ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    const [hashSuffix, countStr] = line.split(':');
    if (hashSuffix.trim() === suffix) {
      return { found: true, count: parseInt(countStr.trim(), 10) };
    }
  }

  return { found: false, count: 0 };
}

function getSeverity(count: number): { label: string; color: string; level: string } {
  if (count === 0) return { label: t('breachCheck.severity.safe'), color: 'var(--emerald)', level: 'safe' };
  if (count < 100) return { label: t('breachCheck.severity.low'), color: 'var(--accent)', level: 'low' };
  if (count < 10000) return { label: t('breachCheck.severity.medium'), color: 'var(--amber)', level: 'medium' };
  return { label: t('breachCheck.severity.high'), color: 'var(--red)', level: 'high' };
}

export function initBreachCheck(): void {
  const input = document.getElementById('breach-password-input') as HTMLInputElement;
  const btn = document.getElementById('breach-check-btn') as HTMLButtonElement;
  const toggleBtn = document.getElementById('breach-toggle-visibility') as HTMLButtonElement;
  const results = document.getElementById('breach-results')!;

  if (!input || !btn || !toggleBtn) return;

  let debounceTimer: ReturnType<typeof setTimeout>;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      btn.disabled = input.value.length === 0;
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.length > 0) {
      btn.click();
    }
  });

  toggleBtn.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggleBtn.innerHTML = isPassword
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  });

  btn.addEventListener('click', async () => {
    const password = input.value;
    if (!password) return;

    btn.disabled = true;
    btn.textContent = t('breachCheck.checking');
    breachState.loading.set(true);
    results.innerHTML = `<div class="breach-loading"><div class="spinner"></div><p>${t('breachCheck.checkingDesc')}</p></div>`;

    try {
      const result = await checkBreach(password);
      const severity = getSeverity(result.count);

      breachState.found.set(result.found);
      breachState.count.set(result.count);
      breachState.error.set(null);

      if (result.found) {
        results.innerHTML = `
          <div class="breach-result-card breach-result-${severity.level}">
            <div class="breach-result-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="${severity.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div class="breach-result-info">
              <div class="breach-result-count" style="color:${severity.color}">${t('breachCheck.found', result.count.toLocaleString())}</div>
              <div class="breach-result-label" style="color:${severity.color}">${severity.label}</div>
              <p class="breach-result-desc">${t('breachCheck.foundDesc')}</p>
            </div>
          </div>
        `;
      } else {
        results.innerHTML = `
          <div class="breach-result-card breach-result-safe">
            <div class="breach-result-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            </div>
            <div class="breach-result-info">
              <div class="breach-result-count" style="color:var(--emerald)">${t('breachCheck.safe')}</div>
              <div class="breach-result-label" style="color:var(--emerald)">${t('breachCheck.safeLabel')}</div>
              <p class="breach-result-desc">${t('breachCheck.safeDesc')}</p>
            </div>
          </div>
        `;
      }

      const current = appState.completedTests.get();
      if (!current.includes('breach')) {
        appState.completedTests.set([...current, 'breach']);
      }
    } catch {
      breachState.error.set(t('breachCheck.error'));
      results.innerHTML = `
        <div class="breach-result-card breach-result-error">
          <p>${t('breachCheck.error')}</p>
          <a href="https://haveibeenpwned.com/Passwords" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="margin-top:8px">${t('breachCheck.errorLink')}</a>
        </div>
      `;
    } finally {
      breachState.loading.set(false);
      input.value = '';
      input.type = 'password';
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      btn.disabled = true;
      btn.textContent = t('breachCheck.check');
    }
  });
}