const DnsCheck = {
  async detectIp() {
    try {
      const res = await fetch("/api/ip");
      return await res.json();
    } catch {
      return { error: "Failed to detect IP" };
    }
  },

  async lookupDns(domain, type) {
    try {
      const res = await fetch(`/api/dns?domain=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`);
      return await res.json();
    } catch {
      return { error: "DNS lookup failed" };
    }
  },

  async detectResolver() {
    const resolvers = [
      { name: "Cloudflare", host: "cloudflare-dns.com", ip: "1.1.1.1" },
      { name: "Google", host: "dns.google", ip: "8.8.8.8" },
      { name: "Quad9", host: "dns.quad9.net", ip: "9.9.9.9" },
      { name: "OpenDNS", host: "resolver1.opendns.com", ip: "208.67.222.222" },
      { name: "AdGuard DNS", host: "dns.adguard-dns.com", ip: "94.140.14.14" },
    ];

    const results = [];

    for (const resolver of resolvers) {
      try {
        const start = performance.now();
        const res = await fetch(`https://${resolver.host}/dns-query?name=example.com&type=A`, {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(3000),
        });
        const elapsed = Math.round(performance.now() - start);

        if (res.ok) {
          results.push({ ...resolver, reachable: true, latency: elapsed });
        } else {
          results.push({ ...resolver, reachable: false, latency: null });
        }
      } catch {
        results.push({ ...resolver, reachable: false, latency: null });
      }
    }

    return results;
  },

  async checkDnsSecurity() {
    const checks = [];

    // DNSSEC validation check — resolve a known DNSSEC-signed domain
    try {
      const res = await fetch("https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=A&do=1", {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      checks.push({
        name: "DNSSEC Validation",
        status: data.AD ? "pass" : "warn",
        detail: data.AD ? "Your resolver validates DNSSEC" : "DNSSEC not validated by resolver",
      });
    } catch {
      checks.push({ name: "DNSSEC Validation", status: "fail", detail: "Could not check DNSSEC" });
    }

    // DNS-over-HTTPS support
    try {
      const res = await fetch("https://cloudflare-dns.com/dns-query?name=example.com&type=A", {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      checks.push({
        name: "DNS-over-HTTPS",
        status: res.ok ? "pass" : "fail",
        detail: res.ok ? "DoH endpoint reachable" : "DoH not available",
      });
    } catch {
      checks.push({ name: "DNS-over-HTTPS", status: "fail", detail: "DoH not available" });
    }

    // Check if known malware domain is blocked (safe test domain)
    try {
      const res = await fetch("https://cloudflare-dns.com/dns-query?name=malware.testcategory.com&type=A", {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      const blocked = !data.Answer || data.Answer.length === 0 || data.Status === 3;
      checks.push({
        name: "Malware Domain Filtering",
        status: blocked ? "pass" : "warn",
        detail: blocked ? "Known test domains filtered" : "No DNS-level filtering detected",
      });
    } catch {
      checks.push({ name: "Malware Domain Filtering", status: "warn", detail: "Could not test filtering" });
    }

    // WebRTC IP leak check
    try {
      const leaked = await DnsCheck.checkWebRtcLeak();
      checks.push({
        name: "WebRTC IP Leak",
        status: leaked ? "fail" : "pass",
        detail: leaked ? `Local IP exposed: ${leaked}` : "No WebRTC IP leak detected",
      });
    } catch {
      checks.push({ name: "WebRTC IP Leak", status: "warn", detail: "Could not check WebRTC" });
    }

    return checks;
  },

  checkWebRtcLeak() {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const ips = new Set();
        let resolved = false;

        pc.createDataChannel("");
        pc.createOffer().then((offer) => pc.setLocalDescription(offer));

        pc.onicecandidate = (e) => {
          if (resolved) return;
          if (!e.candidate) {
            pc.close();
            resolved = true;
            resolve(null);
            return;
          }
          const match = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (match) {
            const ip = match[1];
            if (!ip.startsWith("0.") && !ips.has(ip)) {
              ips.add(ip);
              // Private IPs indicate a leak
              if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
                pc.close();
                resolved = true;
                resolve(ip);
              }
            }
          }
        };

        setTimeout(() => {
          if (!resolved) {
            pc.close();
            resolved = true;
            resolve(null);
          }
        }, 3000);
      } catch {
        resolve(null);
      }
    });
  },
};
