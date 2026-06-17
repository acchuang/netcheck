import { t } from './i18n';

interface NetworkConnection {
  type?: string;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

type ConnectionNavigator = Navigator & {
  readonly connection?: NetworkConnection;
  readonly mozConnection?: NetworkConnection;
  readonly webkitConnection?: NetworkConnection;
};

function getConnection(): NetworkConnection | null {
  const n = navigator as ConnectionNavigator;
  return n.connection || n.mozConnection || n.webkitConnection || null;
}

function effectiveTypeLabel(type: string | undefined): string {
  if (!type) return t('networkChange.unknown', 'Unknown');
  const labels: Record<string, string> = {
    'slow-2g': '2G',
    '2g': '2G',
    '3g': '3G',
    '4g': '4G/LTE',
    wifi: 'WiFi',
    cellular: t('networkChange.cellular', 'Cellular'),
    ethernet: 'Ethernet',
    bluetooth: 'Bluetooth',
    none: t('networkChange.offline', 'Offline'),
  };
  return labels[type] || type;
}

function showToast(message: string): void {
  let container = document.getElementById('network-change-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'network-change-toast-container';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'network-change-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span style="font-size:16px">📡</span> ${message}`;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('network-change-toast-visible'));

  setTimeout(() => {
    toast.classList.remove('network-change-toast-visible');
    toast.classList.add('network-change-toast-exit');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function onConnectionChange(): void {
  const conn = getConnection();
  if (!conn) return;
  const label = effectiveTypeLabel(conn.effectiveType || conn.type);
  showToast(t('networkChange.changed', `Network changed to ${label}`, label));
}

export function initNetworkChange(): void {
  const conn = getConnection();
  if (conn?.addEventListener) {
    conn.addEventListener('change', onConnectionChange);
  }

  window.addEventListener('online', () => {
    showToast(t('networkChange.online', 'Back online'));
  });

  window.addEventListener('offline', () => {
    showToast(t('networkChange.offlineToast', 'You are offline'));
  });
}