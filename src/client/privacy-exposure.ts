import { t } from './i18n';
import { privacyExposureState } from './state/privacy-exposure-state';
import type { PrivacyCheck } from './state/privacy-exposure-state';

const GRADE_THRESHOLDS: [number, string][] = [
  [93, 'A+'],
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

function scoreToGrade(score: number): string {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return 'F';
}

async function checkPrivacyExposure(): Promise<{ checks: PrivacyCheck[]; score: number; grade: string }> {
  const checks: PrivacyCheck[] = [];

  const testApi = async (
    name: string,
    api: string,
    test: () => Promise<'available' | 'blocked' | 'permission' | 'unavailable'>,
    risk: 'high' | 'medium' | 'low',
    reveals: string,
    tip: string,
  ) => {
    try {
      const status = await test();
      checks.push({ name, api, status, risk, reveals, tip });
    } catch {
      checks.push({ name, api, status: 'unavailable', risk, reveals, tip });
    }
  };

  await testApi(
    t('privacyExposure.api.webrtc'),
    'webrtc',
    async () => {
      try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise<void>((resolve) => {
          pc.onicecandidate = (e) => {
            if (e.candidate) resolve();
          };
          setTimeout(() => resolve(), 2000);
        });
        pc.close();
        return 'available';
      } catch {
        return 'blocked';
      }
    },
    'high',
    'Real local/public IP addresses',
    'Disable WebRTC in browser settings or use an extension',
  );

  await testApi(
    t('privacyExposure.api.battery'),
    'battery',
    async () => {
      if (!('getBattery' in navigator)) return 'unavailable';
      try {
        const battery = await (navigator as any).getBattery();
        return battery ? 'available' : 'blocked';
      } catch {
        return 'blocked';
      }
    },
    'medium',
    'Battery level and charging status',
    'Firefox/Safari have removed this API; Chrome users can disable via flags',
  );

  await testApi(
    t('privacyExposure.api.deviceMemory'),
    'deviceMemory',
    async () => {
      if (!('deviceMemory' in navigator)) return 'unavailable';
      return (navigator as any).deviceMemory ? 'available' : 'blocked';
    },
    'medium',
    'Approximate device RAM (fingerprinting signal)',
    'Cannot be disabled in most browsers; adds to fingerprint uniqueness',
  );

  await testApi(
    t('privacyExposure.api.bluetooth'),
    'bluetooth',
    async () => {
      if (!('bluetooth' in navigator)) return 'unavailable';
      return 'permission';
    },
    'low',
    'Nearby Bluetooth devices (requires permission)',
    'Deny Bluetooth permission when prompted',
  );

  await testApi(
    t('privacyExposure.api.usb'),
    'usb',
    async () => {
      if (!('usb' in navigator)) return 'unavailable';
      return 'permission';
    },
    'low',
    'Connected USB devices (requires permission)',
    'Deny USB permission when prompted',
  );

  await testApi(
    t('privacyExposure.api.serial'),
    'serial',
    async () => {
      if (!('serial' in navigator)) return 'unavailable';
      return 'permission';
    },
    'low',
    'Serial port devices (requires permission)',
    'Deny serial permission when prompted',
  );

  await testApi(
    t('privacyExposure.api.gamepad'),
    'gamepad',
    async () => {
      if (!('getGamepads' in navigator)) return 'unavailable';
      try {
        const gamepads = (navigator as any).getGamepads();
        return gamepads && gamepads.length > 0 ? 'available' : 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
    'low',
    'Connected game controllers',
    'Disconnect gamepads when not in use',
  );

  await testApi(
    t('privacyExposure.api.geolocation'),
    'geolocation',
    async () => {
      if (!('geolocation' in navigator)) return 'unavailable';
      try {
        const result = await Promise.race([
          new Promise<string>((resolve) => {
            (navigator as any).permissions.query({ name: 'geolocation' }).then((p: any) => {
              if (p.state === 'granted') resolve('available');
              else if (p.state === 'prompt') resolve('permission');
              else resolve('blocked');
            }).catch(() => resolve('blocked'));
          }),
          new Promise<string>((resolve) => setTimeout(() => resolve('permission'), 1000)),
        ]);
        return result as any;
      } catch {
        return 'blocked';
      }
    },
    'high',
    'Physical location coordinates',
    'Deny location permission; use browser settings to revoke existing grants',
  );

  await testApi(
    t('privacyExposure.api.notifications'),
    'notifications',
    async () => {
      if (!('Notification' in window)) return 'unavailable';
      if (Notification.permission === 'granted') return 'available';
      if (Notification.permission === 'denied') return 'blocked';
      return 'permission';
    },
    'low',
    'Notification permission status',
    'Block notification permissions for untrusted sites',
  );

  await testApi(
    t('privacyExposure.api.mediaDevices'),
    'mediaDevices',
    async () => {
      if (!('mediaDevices' in navigator)) return 'unavailable';
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.length > 0 ? 'available' : 'unavailable';
      } catch {
        return 'blocked';
      }
    },
    'medium',
    'Camera/microphone device count without permission',
    'Use browser permission prompts to control access',
  );

  await testApi(
    t('privacyExposure.api.clipboard'),
    'clipboard',
    async () => {
      if (!('clipboard' in navigator)) return 'unavailable';
      return 'permission';
    },
    'low',
    'Clipboard read/write (requires permission)',
    'Deny clipboard permission when prompted',
  );

  await testApi(
    t('privacyExposure.api.dnt'),
    'dnt',
    async () => {
      const dnt = (navigator as any).doNotTrack;
      return dnt === '1' ? 'blocked' : 'available';
    },
    'low',
    t('privacyExposure.api.dnt.reveals'),
    t('privacyExposure.api.dnt.tip'),
  );

  await testApi(
    t('privacyExposure.api.gpc'),
    'gpc',
    async () => {
      const gpc = (navigator as any).globalPrivacyControl;
      return gpc === true ? 'blocked' : 'available';
    },
    'low',
    t('privacyExposure.api.gpc.reveals'),
    t('privacyExposure.api.gpc.tip'),
  );

  let score = 100;
  for (const check of checks) {
    if (check.status === 'available') {
      if (check.risk === 'high') score -= 20;
      else if (check.risk === 'medium') score -= 10;
      else score -= 2;
    } else if (check.status === 'permission') {
      if (check.risk === 'high') score -= 5;
      else if (check.risk === 'medium') score -= 2;
      else score -= 0;
    }
  }
  score = Math.max(0, Math.min(100, score));

  const grade = scoreToGrade(score);

  return { checks, score, grade };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  available: { label: t('privacyExposure.status.available'), color: 'var(--red)' },
  blocked: { label: t('privacyExposure.status.blocked'), color: 'var(--emerald)' },
  permission: { label: t('privacyExposure.status.permission'), color: 'var(--amber)' },
  unavailable: { label: t('privacyExposure.status.unavailable'), color: 'var(--text-tertiary)' },
};

const RISK_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: t('privacyExposure.risk.high'), color: 'var(--red)' },
  medium: { label: t('privacyExposure.risk.medium'), color: 'var(--amber)' },
  low: { label: t('privacyExposure.risk.low'), color: 'var(--accent)' },
};

export async function runPrivacyExposure(): Promise<void> {
  const btn = document.getElementById('privacy-exposure-btn') as HTMLButtonElement;
  const container = document.getElementById('privacy-exposure-results')!;
  if (!container) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = t('privacyExposure.checking');
  }

  privacyExposureState.loading.set(true);

  container.innerHTML = `<div class="breach-loading"><div class="spinner"></div><p>${t('privacyExposure.checkingDesc')}</p></div>`;

  const result = await checkPrivacyExposure();

  privacyExposureState.score.set(result.score);
  privacyExposureState.grade.set(result.grade);
  privacyExposureState.checks.set(result.checks);

  const highRiskCount = result.checks.filter((c) => c.status === 'available' && c.risk === 'high').length;
  privacyExposureState.riskLevel.set(highRiskCount > 0 ? 'high' : result.score >= 80 ? 'low' : 'medium');

  const gradeColors: Record<string, string> = {
    'A+': 'var(--emerald)', A: 'var(--emerald)', B: 'var(--accent)',
    C: 'var(--amber)', D: 'var(--red)', F: 'var(--red)',
  };

  container.innerHTML = `
    <div class="privacy-exposure-results">
      <div class="tls-target-grade">
        <div class="speed-grade" style="color:${gradeColors[result.grade] || 'var(--text-secondary)'}; font-size:2.5rem">${result.grade}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${t('privacyExposure.score')}</div>
      </div>
      <div class="csp-analysis-card" style="margin-top:16px">
        <div class="csp-score-bar">
          <div class="csp-score-fill" style="width:${result.score}%;background:${result.score >= 85 ? 'var(--emerald)' : result.score >= 55 ? 'var(--amber)' : 'var(--red)'}"></div>
          <span class="csp-score-label">${result.score}/100</span>
        </div>
      </div>
      <div class="privacy-checks-list" style="margin-top:12px">
        ${result.checks.map((check) => {
          const status = STATUS_LABELS[check.status];
          const risk = RISK_LABELS[check.risk];
          return `
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:${status.color}20;color:${status.color}">${status.label}</span>
              <span class="csp-issue-directive">${check.name}</span>
              <span class="csp-issue-message">
                <span class="csp-issue-severity" style="background:${risk.color}20;color:${risk.color};font-size:10px;margin-right:4px">${risk.label}</span>
                ${check.reveals}
              </span>
            </div>
          `;
        }).join('')}
      </div>
      ${result.checks.filter((c) => c.status === 'available' && c.risk === 'high').length > 0 ? `
        <div class="csp-analysis-card" style="margin-top:12px;border-color:var(--red)">
          <h4 class="csp-issues-title">${t('privacyExposure.highRiskExposures')}</h4>
          ${result.checks
            .filter((c) => c.status === 'available' && c.risk === 'high')
            .map((c) => `<div class="csp-issue-item"><span class="csp-issue-message">${c.name}: ${c.tip}</span></div>`)
            .join('')}
        </div>
      ` : ''}
    </div>
  `;

  if (btn) {
    btn.disabled = false;
    btn.textContent = t('privacyExposure.check');
  }

  privacyExposureState.loading.set(false);
}

export function initPrivacyExposure(): void {
  const btn = document.getElementById('privacy-exposure-btn') as HTMLButtonElement;
  if (!btn) return;
  btn.addEventListener('click', runPrivacyExposure);
}