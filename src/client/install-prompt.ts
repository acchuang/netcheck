const VISIT_COUNT_KEY = 'netcheck-visits';
const DISMISSED_KEY = 'netcheck-install-dismissed';

let deferredPrompt: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as unknown as typeof deferredPrompt;

    const visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, visits.toString());

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (visits >= 2 && !dismissed) {
      showInstallBanner();
    }
  });

  const existingBanner = document.getElementById('install-banner');
  if (existingBanner) {
    wireBannerButtons(existingBanner);
  }
}

function showInstallBanner(): void {
  if (document.getElementById('install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-banner-content">
      <div class="install-banner-text">
        <strong>Add NetCheck to Home Screen</strong>
        <span>Run speed tests and security checks offline</span>
      </div>
      <div class="install-banner-actions">
        <button class="btn btn-primary btn-sm" id="install-accept">Install</button>
        <button class="btn btn-ghost btn-sm" id="install-dismiss">Not now</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  wireBannerButtons(banner);

  requestAnimationFrame(() => banner.classList.add('install-banner-visible'));
}

function wireBannerButtons(banner: HTMLElement): void {
  const acceptBtn = banner.querySelector('#install-accept');
  const dismissBtn = banner.querySelector('#install-dismiss');

  if (acceptBtn) {
    acceptBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          localStorage.setItem(DISMISSED_KEY, 'true');
        }
        deferredPrompt = null;
      }
      removeBanner(banner);
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      localStorage.setItem(DISMISSED_KEY, 'true');
      removeBanner(banner);
    });
  }
}

function removeBanner(banner: HTMLElement): void {
  banner.classList.remove('install-banner-visible');
  banner.addEventListener('transitionend', () => banner.remove());
  setTimeout(() => banner.remove(), 500);
}