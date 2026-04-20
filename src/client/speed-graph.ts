export const speedGraphData: { download: { time: number; value: number }[]; upload: { time: number; value: number }[] } = {
  download: [],
  upload: [],
};

export function addGraphPoint(phase: "download" | "upload", time: number, value: number): void {
  speedGraphData[phase].push({ time, value });
}

export function clearGraph(): void {
  speedGraphData.download = [];
  speedGraphData.upload = [];
}

export function drawSpeedGraph(): void {
  const canvas = document.getElementById("speed-graph") as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const style = getComputedStyle(document.documentElement);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 10, right: 16, bottom: 24, left: 48 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const allVals = [...speedGraphData.download, ...speedGraphData.upload].map((p) => p.value);
  if (allVals.length === 0) return;
  const maxVal = Math.max(...allVals, 1) * 1.15;

  const gridColor = style.getPropertyValue("--border-solid").trim() || "rgba(255,255,255,0.06)";
  const labelColor = style.getPropertyValue("--text-tertiary").trim() || "rgba(255,255,255,0.3)";

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = labelColor;
  ctx.textAlign = "right";
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + plotH - (i / gridLines) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round((maxVal * i) / gridLines)}`, pad.left - 6, y + 4);
  }

  const accentColor = style.getPropertyValue("--accent").trim() || "rgba(94, 106, 210, 1)";
  const emerald = style.getPropertyValue("--emerald").trim() || "rgba(52, 211, 153, 1)";

  function drawLine(points: { time: number; value: number }[], color: string): void {
    if (points.length < 2) return;
    const maxTime = Math.max(...speedGraphData.download.concat(speedGraphData.upload).map((p) => p.time), 1);

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, color.startsWith("rgba") ? color.replace(/[\d.]+\)$/, "0.15)") : `${color}26`);
    grad.addColorStop(1, color.startsWith("rgba") ? color.replace(/[\d.]+\)$/, "0)") : `${color}00`);

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

  drawLine(speedGraphData.download, accentColor);
  drawLine(speedGraphData.upload, emerald);

  ctx.fillStyle = labelColor;
  ctx.textAlign = "center";
  ctx.fillText("Mbps", pad.left + 16, pad.top + plotH + 18);
}