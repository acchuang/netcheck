export interface FingerprintCategory {
  name: string;
  i18nKey: string;
  items: FingerprintItem[];
}

export interface FingerprintItem {
  label: string;
  i18nKey: string;
  value: string;
  entropy: "low" | "medium" | "high";
}

export interface FingerprintResult {
  categories: FingerprintCategory[];
  totalEntropy: number;
  uniquenessScore: number;
}

async function hashString(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashArray(arr: Float32Array): Promise<string> {
  const raw = new Uint8Array(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
  const hashBuffer = await crypto.subtle.digest("SHA-256", raw.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const FingerprintDetector = {
  results: [] as FingerprintCategory[],

  async runAll(): Promise<FingerprintResult> {
    this.results = [];

    const categories: FingerprintCategory[] = [
      await this.detectCanvas(),
      await this.detectWebGL(),
      await this.detectAudio(),
      this.detectFonts(),
      this.detectScreen(),
      this.detectNavigator(),
    ];

    this.results = categories;

    let totalBits = 0;
    categories.forEach((cat) => {
      const nonFontItems = cat.items.filter((item) => item.i18nKey !== "fp.fontItem");
      nonFontItems.forEach((item) => {
        totalBits += item.entropy === "high" ? 8 : item.entropy === "medium" ? 4 : 1;
      });
      const fontItems = cat.items.filter((item) => item.i18nKey === "fp.fontItem");
      if (fontItems.length > 0) {
        totalBits += fontItems.length >= 10 ? 8 : fontItems.length >= 5 ? 4 : 1;
      }
    });

    const uniquenessScore = Math.min(100, Math.round((totalBits / 50) * 100));

    return { categories, totalEntropy: totalBits, uniquenessScore };
  },

  async detectCanvas(): Promise<FingerprintCategory> {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext("2d")!;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("NetCheck \u{1f310}", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("NetCheck \u{1f310}", 4, 17);

      const dataUrl = canvas.toDataURL();
      const hash = await hashString(dataUrl);

      return {
        name: "Canvas",
        i18nKey: "fp.canvas",
        items: [{ label: "Hash", i18nKey: "fp.canvasHash", value: hash.slice(0, 16) + "\u2026", entropy: "high" }],
      };
    } catch {
      return { name: "Canvas", i18nKey: "fp.canvas", items: [] };
    }
  },

  async detectWebGL(): Promise<FingerprintCategory> {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
      if (!gl) return { name: "WebGL", i18nKey: "fp.webgl", items: [{ label: "Supported", i18nKey: "fp.webglSupport", value: "No", entropy: "low" }] };

      const glCtx = gl as WebGLRenderingContext;
      const debugInfo = glCtx.getExtension("WEBGL_debug_renderer_info");
      const renderer = debugInfo ? glCtx.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "Unknown";
      const vendor = debugInfo ? glCtx.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "Unknown";
      const version = glCtx.getParameter(glCtx.VERSION);

      return {
        name: "WebGL",
        i18nKey: "fp.webgl",
        items: [
          { label: "Renderer", i18nKey: "fp.webglRenderer", value: String(renderer), entropy: "high" },
          { label: "Vendor", i18nKey: "fp.webglVendor", value: String(vendor), entropy: "medium" },
          { label: "Version", i18nKey: "fp.webglVersion", value: String(version), entropy: "low" },
        ],
      };
    } catch {
      return { name: "WebGL", i18nKey: "fp.webgl", items: [] };
    }
  },

  async detectAudio(): Promise<FingerprintCategory> {
    try {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(10000, ctx.currentTime);

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, ctx.currentTime);
      compressor.knee.setValueAtTime(40, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);

      const rendered = await ctx.startRendering();
      const hash = await hashArray(rendered.getChannelData(0));

      return {
        name: "Audio",
        i18nKey: "fp.audio",
        items: [{ label: "Hash", i18nKey: "fp.audioHash", value: hash.slice(0, 16) + "\u2026", entropy: "medium" }],
      };
    } catch {
      return { name: "Audio", i18nKey: "fp.audio", items: [] };
    }
  },

  detectFonts(): FingerprintCategory {
    const testFonts = [
      "Arial", "Arial Black", "Comic Sans MS", "Courier New", "Georgia",
      "Helvetica", "Impact", "Palatino", "Times New Roman", "Trebuchet MS",
      "Verdana", "Segoe UI", "Roboto", "San Francisco", "Helvetica Neue",
      "Lucida Grande", "Menlo", "Monaco", "Consolas", "Fira Code",
    ];

    const baseFonts = ["monospace", "serif", "sans-serif"];
    const testString = "mmmmmmmmmmlli";
    const testSize = "72px";

    const span = document.createElement("span");
    span.style.position = "absolute";
    span.style.left = "-9999px";
    span.style.fontSize = testSize;
    span.style.lineHeight = "normal";
    span.textContent = testString;

    const baseWidths: Record<string, number> = {};
    for (const base of baseFonts) {
      span.style.fontFamily = base;
      document.body.appendChild(span);
      baseWidths[base] = span.offsetWidth;
      document.body.removeChild(span);
    }

    const detected: string[] = [];
    for (const font of testFonts) {
      let found = false;
      for (const base of baseFonts) {
        span.style.fontFamily = `'${font}', ${base}`;
        document.body.appendChild(span);
        if (span.offsetWidth !== baseWidths[base]) {
          found = true;
          document.body.removeChild(span);
          break;
        }
        document.body.removeChild(span);
      }
      if (found) detected.push(font);
    }

    return {
      name: "Fonts",
      i18nKey: "fp.fonts",
      items: detected.slice(0, 12).map((f) => ({
        label: f, i18nKey: "fp.fontItem", value: "\u2713", entropy: "low" as const,
      })),
    };
  },

  detectScreen(): FingerprintCategory {
    const items: FingerprintItem[] = [
      { label: "Resolution", i18nKey: "fp.screenRes", value: `${screen.width}\u00d7${screen.height}`, entropy: "medium" },
      { label: "Color Depth", i18nKey: "fp.colorDepth", value: `${screen.colorDepth}-bit`, entropy: "low" },
      { label: "Pixel Ratio", i18nKey: "fp.pixelRatio", value: `${window.devicePixelRatio}x`, entropy: "medium" },
      { label: "Timezone", i18nKey: "fp.timezone", value: Intl.DateTimeFormat().resolvedOptions().timeZone, entropy: "medium" },
    ];
    return { name: "Screen", i18nKey: "fp.screen", items };
  },

  detectNavigator(): FingerprintCategory {
    const nav = navigator as any;
    const items: FingerprintItem[] = [
      { label: "User Agent", i18nKey: "fp.userAgent", value: navigator.userAgent.slice(0, 80) + "\u2026", entropy: "high" },
      { label: "Platform", i18nKey: "fp.platform", value: navigator.platform, entropy: "medium" },
      { label: "Language", i18nKey: "fp.language", value: navigator.language, entropy: "low" },
      { label: "Cores", i18nKey: "fp.cores", value: String(nav.hardwareConcurrency ?? "\u2014"), entropy: "medium" },
      { label: "Memory", i18nKey: "fp.memory", value: nav.deviceMemory ? `${nav.deviceMemory} GB` : "\u2014", entropy: "medium" },
      { label: "Touch", i18nKey: "fp.touch", value: nav.maxTouchPoints > 0 ? `${nav.maxTouchPoints} points` : "None", entropy: "medium" },
    ];
    return { name: "Navigator", i18nKey: "fp.navigator", items };
  },
};