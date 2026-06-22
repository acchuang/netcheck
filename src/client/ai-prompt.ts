import type { TestResultsPayload } from './ai-collector';

export function buildPrompt(payload: TestResultsPayload): string {
  const parts: string[] = [];

  parts.push(
    "You are a network security expert analyzing a user's network diagnostic results. Provide a concise, actionable analysis in markdown format.",
  );

  parts.push('## Analysis Request');
  parts.push(`Timestamp: ${payload.timestamp}`);
  parts.push(`Tests completed: ${payload.completedTests.join(', ') || 'none'}`);

  if (payload.ip) {
    parts.push('### IP & Location');
    parts.push(`- IP: ${payload.ip.address}`);
    parts.push(
      `- Location: ${[payload.ip.city, payload.ip.region, payload.ip.country].filter(Boolean).join(', ')}`,
    );
    parts.push(`- ISP: ${payload.ip.asOrganization} (AS${payload.ip.asn})`);
    parts.push(`- Colo: ${payload.ip.colo}`);
    parts.push(`- HTTP Protocol: ${payload.ip.httpProtocol}`);
    parts.push(`- TLS Version: ${payload.ip.tlsVersion}`);
    parts.push(`- TLS Cipher: ${payload.ip.tlsCipher}`);
  }

  parts.push('### DNS');
  parts.push(
    `WebRTC Leak: ${payload.dns.webrtcLeak === null ? 'unknown' : payload.dns.webrtcLeak ? 'detected' : 'not detected'}`,
  );
  parts.push(
    `DNSSEC: ${payload.dns.dnssec === null ? 'unknown' : payload.dns.dnssec ? 'enabled' : 'disabled'}`,
  );
  if (payload.dns.ipv6) {
    parts.push(`IPv4 Connectivity: ${payload.dns.ipv6.ipv4Connectivity ? 'yes' : 'no'}`);
    parts.push(`IPv6 Connectivity: ${payload.dns.ipv6.ipv6Connectivity ? 'yes' : 'no'}`);
    parts.push(`Dual-Stack Preference: ${payload.dns.ipv6.dualStackPreference || 'none'}`);
  }
  parts.push('Security Checks:');
  for (const check of payload.dns.securityChecks) {
    parts.push(`  - ${check.status.toUpperCase()}: ${check.name} — ${check.detail}`);
  }
  parts.push('DNS Resolvers:');
  for (const r of payload.dns.resolvers) {
    parts.push(
      `  - ${r.name}: reachable=${r.reachable}, latency=${r.latency ?? 'N/A'}ms, DNSSEC=${r.dnssec}, malware_filter=${r.filtering}`,
    );
  }

  parts.push('### Speed Test');
  parts.push(`- Download: ${payload.speed.downloadMbps} Mbps`);
  parts.push(`- Upload: ${payload.speed.uploadMbps} Mbps`);
  parts.push(`- Latency: ${payload.speed.latencyMs} ms`);
  parts.push(`- Jitter: ${payload.speed.jitterMs} ms`);
  parts.push(`- Bufferbloat: ${payload.speed.bufferbloatMs} ms`);
  parts.push(`- Grade: ${payload.speed.grade}`);

  if (payload.tls) {
    parts.push('### TLS Inspector');
    parts.push(`- Protocol: ${payload.tls.protocol}`);
    parts.push(`- Cipher: ${payload.tls.cipher}`);
    parts.push(`- Key Exchange: ${payload.tls.keyExchange}`);
    parts.push(`- Forward Secrecy: ${payload.tls.forwardSecrecy ? 'yes' : 'no'}`);
    parts.push(`- Handshake Time: ${payload.tls.handshakeTime ?? 'N/A'}ms`);
    parts.push(`- HTTP Protocol: ${payload.tls.httpProtocol}`);
    parts.push(`- HSTS: ${payload.tls.hstsStatus || 'unknown'}`);
    parts.push(`- Grade: ${payload.tls.grade}`);
  }

  if (payload.adblock) {
    parts.push('### Ad Blocking');
    parts.push(`- Score: ${payload.adblock.score}/100`);
    parts.push(`- Trackers Blocked: ${payload.adblock.blocked}`);
  }

  if (payload.fingerprint) {
    parts.push('### Browser Fingerprint');
    parts.push(`- Uniqueness Score: ${payload.fingerprint.uniquenessScore}/100`);
    parts.push(`- Total Entropy: ${payload.fingerprint.totalEntropy}`);
  }

  parts.push('### Connection Quality');
  parts.push(`- Grade: ${payload.quality.grade}`);
  parts.push(`- Label: ${payload.quality.label}`);

  if (payload.headers) {
    parts.push('### Security Headers');
    parts.push(`- Grade: ${payload.headers.grade}`);
    parts.push(`- Score: ${payload.headers.score}`);
    parts.push(`- URL: ${payload.headers.url}`);
  }

  if (payload.history) {
    parts.push('### History');
    parts.push(`- Tests logged: ${payload.history.testCount}`);
    parts.push(`- Latest Download: ${payload.history.latestDownloadMbps} Mbps`);
    parts.push(`- Latest Latency: ${payload.history.latestLatencyMs} ms`);
  }

  parts.push('');
  parts.push('Provide your analysis in this format:');
  parts.push('');
  parts.push('**Overall Assessment**: A 1-2 sentence summary of the user`s network health.');
  parts.push('');
  parts.push('**Key Findings**:');
  parts.push('- Bullet points of the most important things the user should know.');
  parts.push('');
  parts.push('**Risks**:');
  parts.push('- Any security or privacy concerns identified.');
  parts.push('');
  parts.push('**Recommendations**:');
  parts.push(
    '- Specific, actionable steps to improve. Mention DNS providers, browser settings, VPNs where relevant.',
  );
  parts.push('');
  parts.push('Keep it concise. Use plain language. Do not mention that you are an AI.');

  return parts.join('\n');
}

export function buildShortPrompt(payload: TestResultsPayload): string {
  const prompt = buildPrompt(payload);
  return prompt.replace(
    /\nProvide[\s\S]*$/,
    '\nProvide a brief analysis: overview, key findings, risks, recommendations.',
  );
}
