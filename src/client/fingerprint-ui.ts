import { FingerprintDetector } from './fingerprint';
import { t } from './i18n';
import { affiliate } from './affiliates';
import { appState } from './state/shared-state';
import { fingerprintState } from './state/fingerprint-state';
import { animateNumber, animateRing } from './ui-utils';

export function initFingerprint(): void {
  document.getElementById('fp-start-btn')?.addEventListener('click', runFingerprintScan);
}

async function runFingerprintScan(): Promise<void> {
  const section = document.getElementById('fingerprint')!;
  section.setAttribute('aria-busy', 'true');
  const btn = document.getElementById('fp-start-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('fp.scanning');

  const result = await FingerprintDetector.runAll();

  const scoreCard = document.getElementById('fp-score-card')!;
  scoreCard.style.display = 'flex';
  const fpScoreEl = document.getElementById('fp-score-number')!;
  animateNumber(fpScoreEl, 0, result.uniquenessScore, 600, (v) => String(Math.round(v)));

  const ring = document.getElementById('fp-score-ring')!;
  animateRing(ring, result.uniquenessScore);
  ring.style.stroke =
    result.uniquenessScore >= 70
      ? 'var(--red)'
      : result.uniquenessScore >= 40
        ? 'var(--amber)'
        : 'var(--emerald)';

  const scoreSummary = document.getElementById('fp-score-summary')!;
  if (result.uniquenessScore < 40) {
    scoreSummary.textContent = t('fp.lowUniqueness');
    ring.style.stroke = 'var(--emerald)';
  } else if (result.uniquenessScore < 70) {
    scoreSummary.textContent = t('fp.mediumUniqueness');
    ring.style.stroke = 'var(--amber)';
  } else {
    scoreSummary.textContent = t('fp.highUniqueness');
    ring.style.stroke = 'var(--red)';
  }

  const totalSignals = result.categories.reduce((sum, cat) => sum + cat.items.length, 0);
  document.getElementById('fp-score-detail')!.textContent = t('fp.signals', totalSignals);

  const driftInfo = document.getElementById('fp-drift-info');
  const driftBadge = document.getElementById('fp-drift-badge');
  const driftText = document.getElementById('fp-drift-text');
  const drift = fingerprintState.fpDrift.get();
  const driftDate = fingerprintState.fpDriftDate.get();
  if (driftInfo && driftBadge && driftText && drift > 0) {
    const driftClass = drift <= 10 ? 'drift-low' : drift <= 30 ? 'drift-medium' : 'drift-high';
    driftBadge.className = `fp-drift-badge ${driftClass}`;
    driftBadge.textContent = `${drift}% ${t('fp.drift.label', 'drift')}`;
    const dateStr = driftDate ? new Date(driftDate).toLocaleDateString() : '';
    driftText.textContent = dateStr ? t('fp.drift.since', `Since ${dateStr}`) : t('fp.drift.changed', 'Fingerprint changed from previous scan');
    driftInfo.classList.remove('hidden');
  } else if (driftInfo) {
    driftInfo.classList.add('hidden');
  }

  const container = document.getElementById('fp-categories')!;
  container.innerHTML = '';
  result.categories.forEach((cat) => {
    if (cat.items.length === 0) return;
    const div = document.createElement('div');
    div.className = 'test-category open';
    const itemsHtml = cat.items
      .map(
        (item) => `
      <div class="fp-category-item">
        <div class="fp-item-entropy ${item.entropy}"></div>
        <span class="fp-item-label">${t(item.i18nKey) || item.label}</span>
        <span class="fp-item-value" title="${item.value}">${item.value}</span>
      </div>
    `,
      )
      .join('');

    div.innerHTML = `
      <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
        <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="test-category-name">${t(cat.i18nKey) || cat.name}</span>
        <span class="test-category-score">${cat.items.length} ${t(cat.i18nKey) || cat.name}</span>
      </div>
      <div class="test-category-body">${itemsHtml}</div>
    `;
    container.appendChild(div);
  });

  if (result.uniquenessScore >= 40) {
    const sugSection = document.getElementById('fp-suggestions')!;
    sugSection.style.display = 'block';
    const grid = document.getElementById('fp-suggestions-grid')!;
    const arrowSvg =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
    const tips = [
      {
        name: 'fp.tip.brave',
        icon: '\u{1f981}',
        type: t('fp.tip.brave.type'),
        desc: t('fp.tip.brave.desc'),
        url: 'https://brave.com',
      },
      {
        name: 'fp.tip.fpp',
        icon: '\u{1f98a}',
        type: t('fp.tip.fpp.type'),
        desc: t('fp.tip.fpp.desc'),
        url: 'https://privacypossum.com',
      },
      {
        name: 'fp.tip.canvas',
        icon: '\u{1f3a8}',
        type: t('fp.tip.canvas.type'),
        desc: t('fp.tip.canvas.desc'),
        url: 'https://canvasblocker.net',
      },
    ];
    grid.innerHTML = tips
      .map((tip, i) => {
        const isTop = i === 0 && result.uniquenessScore >= 70;
        const linkUrl = affiliate(tip.url);
        const linkHtml = linkUrl
          ? `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t('dns.learnMore')} ${arrowSvg}</a>`
          : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t('speed.noSetup')}</span>`;
        return `
        <div class="suggestion-card stagger-item${isTop ? ' recommended' : ''}">
          <div class="suggestion-top">
            <div class="suggestion-icon">${tip.icon}</div>
            <div class="suggestion-info">
              <div class="suggestion-name">${t(tip.name + '.name')}</div>
              <div class="suggestion-type">${tip.type}</div>
            </div>
            ${isTop ? `<span class="suggestion-badge">${t('dns.topFix')}</span>` : ''}
          </div>
          <div class="suggestion-desc">${tip.desc}</div>
          ${linkHtml}
        </div>`;
      })
      .join('');
  }

  btn.disabled = false;
  btn.textContent = t('fp.scan');
  section.setAttribute('aria-busy', 'false');

  const current = appState.completedTests.get();
  if (!current.includes('fingerprint')) {
    appState.completedTests.set([...current, 'fingerprint']);
  }
}

fingerprintState.uniquenessScore.subscribe((score) => {
  const el = document.getElementById('fp-score-number');
  if (el) animateNumber(el, 0, score, 600, (v) => String(Math.round(v)));
  const ring = document.getElementById('fp-score-ring');
  if (ring) {
    animateRing(ring, score);
    ring.style.stroke =
      score >= 70 ? 'var(--red)' : score >= 40 ? 'var(--amber)' : 'var(--emerald)';
  }
  const summary = document.getElementById('fp-score-summary');
  if (summary) {
    if (score < 40) summary.textContent = t('fp.lowUniqueness');
    else if (score < 70) summary.textContent = t('fp.mediumUniqueness');
    else summary.textContent = t('fp.highUniqueness');
  }
});

fingerprintState.categories.subscribe((categories) => {
  const container = document.getElementById('fp-categories');
  if (!container || categories.length === 0) return;
  container.innerHTML = '';
  categories.forEach((cat) => {
    if (cat.items.length === 0) return;
    const div = document.createElement('div');
    div.className = 'test-category open';
    const itemsHtml = cat.items
      .map(
        (item) => `
      <div class="fp-category-item">
        <div class="fp-item-entropy ${item.entropy}"></div>
        <span class="fp-item-label">${t(item.i18nKey) || item.label}</span>
        <span class="fp-item-value" title="${item.value}">${item.value}</span>
      </div>
    `,
      )
      .join('');
    div.innerHTML = `
      <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
        <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="test-category-name">${t(cat.i18nKey) || cat.name}</span>
        <span class="test-category-score">${cat.items.length} ${t(cat.i18nKey) || cat.name}</span>
      </div>
      <div class="test-category-body">${itemsHtml}</div>
    `;
    container.appendChild(div);
  });
});
