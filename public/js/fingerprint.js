const Fingerprint = {
  async collect() {
    const data = {};

    // Canvas fingerprint
    data.canvas = this.getCanvasFingerprint();

    // WebGL info
    data.webgl = this.getWebGLInfo();

    // Screen
    data.screen = {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
    };

    // Navigator
    data.navigator = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: Array.from(navigator.languages || []),
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || "unknown",
      maxTouchPoints: navigator.maxTouchPoints || 0,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      pdfViewerEnabled: navigator.pdfViewerEnabled ?? "unknown",
    };

    // Timezone
    data.timezone = {
      offset: new Date().getTimezoneOffset(),
      name: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    // Fonts (probe-based detection)
    data.fonts = await this.detectFonts();

    // Audio context fingerprint
    data.audioHash = await this.getAudioFingerprint();

    // WebRTC
    data.webrtc = typeof RTCPeerConnection !== "undefined";

    // Storage APIs
    data.storage = {
      localStorage: typeof localStorage !== "undefined",
      sessionStorage: typeof sessionStorage !== "undefined",
      indexedDB: typeof indexedDB !== "undefined",
    };

    // Compute uniqueness score
    data.uniquenessScore = this.computeUniquenessScore(data);

    return data;
  },

  getCanvasFingerprint() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 280;
      canvas.height = 60;
      const ctx = canvas.getContext("2d");

      // Draw text with various fonts and styles
      ctx.fillStyle = "#f60";
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.font = "14px Arial";
      ctx.fillText("NetCheck fp 🖥️", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.font = "18px Georgia";
      ctx.fillText("NetCheck fp 🖥️", 4, 45);

      // Draw geometric shapes
      ctx.beginPath();
      ctx.arc(200, 30, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#a33";
      ctx.fill();

      const dataUrl = canvas.toDataURL();
      return { hash: this.simpleHash(dataUrl), available: true };
    } catch {
      return { hash: null, available: false };
    }
  },

  getWebGLInfo() {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return { available: false };

      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        available: true,
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        extensions: gl.getSupportedExtensions()?.length || 0,
      };
    } catch {
      return { available: false };
    }
  },

  async detectFonts() {
    const testFonts = [
      "Arial", "Verdana", "Helvetica", "Times New Roman", "Georgia",
      "Courier New", "Trebuchet MS", "Palatino", "Garamond", "Bookman",
      "Comic Sans MS", "Impact", "Lucida Console", "Tahoma",
      "Monaco", "Menlo", "Consolas", "SF Pro", "Segoe UI",
      "Roboto", "Inter", "Fira Code", "JetBrains Mono",
      "Noto Sans", "Source Code Pro", "Ubuntu", "Cantarell",
      "Papyrus", "Brush Script MT",
    ];

    const baseFonts = ["monospace", "sans-serif", "serif"];
    const testString = "mmmmmmmmmmlli";
    const testSize = "72px";

    const span = document.createElement("span");
    span.style.cssText = "position:absolute;left:-9999px;top:-9999px;font-size:" + testSize;
    span.textContent = testString;
    document.body.appendChild(span);

    // Get base widths
    const baseWidths = {};
    for (const base of baseFonts) {
      span.style.fontFamily = base;
      baseWidths[base] = span.offsetWidth;
    }

    const detected = [];
    for (const font of testFonts) {
      let found = false;
      for (const base of baseFonts) {
        span.style.fontFamily = `"${font}", ${base}`;
        if (span.offsetWidth !== baseWidths[base]) {
          found = true;
          break;
        }
      }
      if (found) detected.push(font);
    }

    span.remove();
    return { detected, total: testFonts.length };
  },

  async getAudioFingerprint() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      const gain = ctx.createGain();
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      gain.gain.value = 0; // mute
      oscillator.type = "triangle";
      oscillator.frequency.value = 10000;

      oscillator.connect(analyser);
      analyser.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(0);

      return new Promise((resolve) => {
        processor.onaudioprocess = (e) => {
          const data = new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatFrequencyData(data);
          const sum = data.reduce((acc, val) => acc + Math.abs(val), 0);
          oscillator.stop();
          processor.disconnect();
          ctx.close();
          resolve(this.simpleHash(String(sum)));
        };

        setTimeout(() => {
          try { oscillator.stop(); processor.disconnect(); ctx.close(); } catch {}
          resolve(null);
        }, 2000);
      });
    } catch {
      return null;
    }
  },

  computeUniquenessScore(data) {
    let bits = 0;

    // Screen resolution + pixel ratio: ~5 bits
    bits += 5;

    // Canvas fingerprint: ~10 bits
    if (data.canvas.available) bits += 10;

    // WebGL renderer: ~8 bits
    if (data.webgl.available) bits += 8;

    // Fonts: ~4-8 bits depending on count
    bits += Math.min(8, Math.round(data.fonts.detected.length / 3));

    // User agent: ~10 bits
    bits += 10;

    // Language + timezone: ~5 bits
    bits += 5;

    // Audio fingerprint: ~6 bits
    if (data.audioHash) bits += 6;

    // Hardware concurrency: ~3 bits
    if (data.navigator.hardwareConcurrency !== "unknown") bits += 3;

    // Touch points: ~2 bits
    bits += 2;

    // Color depth: ~2 bits
    bits += 2;

    // Total entropy estimate
    // Higher = more unique = more trackable
    const maxBits = 66;
    const percentage = Math.min(100, Math.round((bits / maxBits) * 100));

    let level;
    if (percentage >= 80) level = "Very Unique";
    else if (percentage >= 60) level = "Somewhat Unique";
    else if (percentage >= 40) level = "Moderate";
    else level = "Common";

    return { bits, percentage, level };
  },

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32-bit int
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  },
};
