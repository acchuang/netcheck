export const speedGraphData: {
  download: { time: number; value: number }[];
  upload: { time: number; value: number }[];
} = {
  download: [],
  upload: [],
};

export function addGraphPoint(phase: 'download' | 'upload', time: number, value: number): void {
  speedGraphData[phase].push({ time, value });
}

export function clearGraph(): void {
  speedGraphData.download.length = 0;
  speedGraphData.upload.length = 0;
}

export function drawSpeedGraph(): void {
  const canvas = document.getElementById('speed-graph') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  const pad = { top: 8, right: 12, bottom: 20, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const allVals = [...speedGraphData.download, ...speedGraphData.upload].map((p) => p.value);
  if (allVals.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Run a test to see your speed', w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...allVals, 1) * 1.15;
  const gridColor = 'rgba(255,255,255,0.06)';
  const labelColor = 'rgba(255,255,255,0.3)';

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH - (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round((maxVal * i) / 4)), pad.left - 6, y + 4);
  }

  function drawLine(points: { time: number; value: number }[], color: string): void {
    if (points.length < 2) return;
    const maxTime = Math.max(
      ...speedGraphData.download.concat(speedGraphData.upload).map((p) => p.time),
      1,
    );

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, color + '26');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + (p.time / maxTime) * plotW;
      const y = pad.top + plotH - (p.value / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = pad.left + (points[points.length - 1].time / maxTime) * plotW;
    const firstX = pad.left + (points[0].time / maxTime) * plotW;
    ctx.lineTo(lastX, pad.top + plotH);
    ctx.lineTo(firstX, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + (p.time / maxTime) * plotW;
      const y = pad.top + plotH - (p.value / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawLine(speedGraphData.download, '#5e6ad2');
  drawLine(speedGraphData.upload, '#3ec986');
}

export function drawHistoryChart(
  history: {
    ts: number;
    download: number;
    upload: number;
    latency: number;
    jitter: number;
    bufferbloat: number;
    colo: string;
  }[],
): void {
  const canvas = document.getElementById('speed-graph') as HTMLCanvasElement;
  if (!canvas || !history.length) return;
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 12, right: 16, bottom: 28, left: 44 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const maxMbps = Math.max(...history.map((e) => Math.max(e.download, e.upload)), 1) * 1.1;
  const maxMs = Math.max(...history.map((e) => e.latency), 1) * 1.2;
  const gridColor = 'rgba(255,255,255,0.05)';

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH - (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round((maxMbps * i) / 4)), pad.left - 6, y + 4);
  }

  const timeSpan = history[history.length - 1].ts - history[0].ts || 60000;
  const labelColor = 'rgba(255,255,255,0.3)';
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const x = pad.left + (i / 4) * plotW;
    const minsAgo = Math.round((timeSpan * (1 - i / 4)) / 60000);
    ctx.fillText(minsAgo === 0 ? 'now' : `${minsAgo}m ago`, x, h - 4);
  }

  function drawHistoryLine(
    index: number,
    colour: string,
    yScale: (e: {
      download: number;
      upload: number;
      latency: number;
      jitter: number;
      bufferbloat: number;
    }) => number,
    maxY: number,
  ): void {
    if (history.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    history.forEach((e, i) => {
      const x = pad.left + ((e.ts - history[0].ts) / timeSpan) * plotW;
      const y = pad.top + plotH - (yScale(e) / maxY) * plotH;
      // Opacity decay: oldest = 0.3, newest = 1.0
      const alpha = 0.3 + (i / Math.max(history.length - 1, 1)) * 0.7;
      ctx.globalAlpha = alpha;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawHistoryLine(0, '#5e6ad2', (e) => e.download, maxMbps);
  drawHistoryLine(1, '#3ec986', (e) => e.upload, maxMbps);
  drawHistoryLine(2, '#ffba2e', (e) => e.latency, maxMs);

  // Legend
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'left';
  const legendY = pad.top + 4;
  const legends = [
    { label: 'Download', color: '#5e6ad2', x: w - pad.right - 220 },
    { label: 'Upload', color: '#3ec986', x: w - pad.right - 140 },
    { label: 'Latency', color: '#ffba2e', x: w - pad.right - 72 },
  ];
  for (const l of legends) {
    ctx.fillStyle = l.color;
    ctx.fillRect(l.x, legendY, 10, 10);
    ctx.fillStyle = labelColor;
    ctx.fillText(l.label, l.x + 14, legendY + 10);
  }
}
