const Fingerprint = {
  async collect() {
    const data = {};

    // Canvas fingerprint
    try { data.canvas = this.getCanvasFingerprint(); }
    catch { data.canvas = { hash: null, available: false }; }

    // WebGL info
    try { data.webgl = this.getWebGLInfo(); }
    catch { data.webgl = { available: false }; }

    // Screen
    try {
      data.screen = {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
      };
    } catch {
      data.screen = { width: 0, height: 0, colorDepth: 0, pixelRatio: 1, availWidth: 0, availHeight: 0 };
    }

    // Navigator
    try {
      data.navigator = {
        userAgent: navigator.userAgent || "unknown",
        language: navigator.language || "unknown",
        languages: Array.from(navigator.languages || []),
        platform: navigator.platform || "unknown",
        hardwareConcurrency: navigator.hardwareConcurrency || "unknown",
        maxTouchPoints: navigator.maxTouchPoints || 0,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        pdfViewerEnabled: navigator.pdfViewerEnabled ?? "unknown",
      };
    } catch {
      data.navigator = {
        userAgent: "unknown", language: "unknown", languages: [],
        platform: "unknown", hardwareConcurrency: "unknown", maxTouchPoints: 0,
        cookieEnabled: false, doNotTrack: null, pdfViewerEnabled: "unknown",
      };
    }

    // Timezone
    try {
      data.timezone = {
        offset: new Date().getTimezoneOffset(),
        name: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } catch {
      data.timezone = { offset: 0, name: "unknown" };
    }

    // Fonts (probe-based detection)
    try { data.fonts = await this.detectFonts(); }
    catch { data.fonts = { detected: [], total: 0 }; }

    // Audio context fingerprint (using OfflineAudioContext — no user gesture needed)
    try { data.audioHash = await this.getAudioFingerprint(); }
    catch { data.audioHash = null; }

    // WebRTC
    data.webrtc = typeof RTCPeerConnection !== "undefined";

    // Storage APIs
    data.storage = {
      localStorage: this.testStorage("localStorage"),
      sessionStorage: this.testStorage("sessionStorage"),
      indexedDB: typeof indexedDB !== "undefined",
    };

    // Compute uniqueness score
    data.uniquenessScore = this.computeUniquenessScore(data);

    return data;
  },

  testStorage(type) {
    try {
      const s = window[type];
      const key = "__fp_test__";
      s.setItem(key, "1");
      s.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  getCanvasFingerprint() {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { hash: null, available: false };

    ctx.fillStyle = "#f60";
    ctx.fillRect(100, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.font = "14px Arial";
    ctx.fillText("NetCheck fp test", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.font = "18px Georgia";
    ctx.fillText("NetCheck fp test", 4, 45);

    ctx.beginPath();
    ctx.arc(200, 30, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#a33";
    ctx.fill();

    const dataUrl = canvas.toDataURL();
    return { hash: this.simpleHash(dataUrl), available: true };
  },

  getWebGLInfo() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return { available: false };

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const info = {
      available: true,
      vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      extensions: gl.getSupportedExtensions()?.length || 0,
    };

    // Clean up context
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();

    return info;
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
    span.style.cssText = `position:absolute;left:-9999px;top:-9999px;font-size:${testSize};visibility:hidden;`;
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
    // Use OfflineAudioContext — doesn't require user gesture, works in all modern browsers
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return null;

    try {
      const ctx = new OfflineCtx(1, 44100, 44100); // 1 channel, 1 second of audio at 44100Hz
      const oscillator = ctx.createOscillator();
      const compressor = ctx.createDynamicsCompressor();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(10000, ctx.currentTime);

      compressor.threshold.setValueAtTime(-50, ctx.currentTime);
      compressor.knee.setValueAtTime(40, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);

      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);

      // Hash a portion of the output
      let sum = 0;
      for (let i = 4500; i < 5000; i++) {
        sum += Math.abs(data[i]);
      }

      return this.simpleHash(sum.toString());
    } catch {
      return null;
    }
  },

  computeUniquenessScore(data) {
    let bits = 0;

    // Screen resolution + pixel ratio: ~5 bits
    if (data.screen.width > 0) bits += 5;

    // Canvas fingerprint: ~10 bits
    if (data.canvas.available) bits += 10;

    // WebGL renderer: ~8 bits
    if (data.webgl.available) bits += 8;

    // Fonts: ~4-8 bits depending on count
    bits += Math.min(8, Math.round((data.fonts.detected?.length || 0) / 3));

    // User agent: ~10 bits
    if (data.navigator.userAgent !== "unknown") bits += 10;

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
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  },
};
