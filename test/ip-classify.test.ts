import test from "node:test";
import assert from "node:assert/strict";
import {
  ipScope, inCidr, sameIp, sameNetwork, encryptedDnsOperator,
  parseIceCandidate, evaluateWebRtc, dohVerdict,
} from "../src/shared/ip-classify.ts";

const candidate = (ip: string, kind = "srflx") =>
  `candidate:842163049 1 udp 1677729535 ${ip} 54321 typ ${kind} raddr 0.0.0.0 rport 0`;

test("IPv4 scope separates RFC1918 and CGNAT from routable addresses", () => {
  assert.equal(ipScope("192.168.1.5"), "private");
  assert.equal(ipScope("10.0.0.1"), "private");
  assert.equal(ipScope("172.16.0.1"), "private");
  assert.equal(ipScope("172.32.0.1"), "public"); // just outside 172.16/12
  assert.equal(ipScope("100.64.0.1"), "private"); // carrier NAT, not the visitor's own
  assert.equal(ipScope("169.254.1.1"), "linkLocal");
  assert.equal(ipScope("127.0.0.1"), "loopback");
  assert.equal(ipScope("203.0.113.5"), "public");
});

test("IPv6 scope separates global from ULA and link-local", () => {
  assert.equal(ipScope("2001:db8::1"), "public");
  assert.equal(ipScope("fd00:1234::5"), "private"); // fc00::/7
  assert.equal(ipScope("fe80::1c2b:aaff:fe00:1"), "linkLocal");
  assert.equal(ipScope("::1"), "loopback");
  assert.equal(ipScope("::"), "unspecified");
});

test("an IPv4-mapped IPv6 address is treated as the IPv4 address it is", () => {
  assert.equal(ipScope("::ffff:192.168.1.5"), "private");
  assert.equal(ipScope("::ffff:203.0.113.5"), "public");
  assert.ok(sameIp("::ffff:203.0.113.5", "203.0.113.5"));
});

test("CIDR matching handles both families and compressed v6", () => {
  assert.ok(inCidr("172.68.3.4", "172.64.0.0/13"));
  assert.ok(!inCidr("172.80.3.4", "172.64.0.0/13"));
  assert.ok(inCidr("2606:4700:0:1::9", "2606:4700::/32"));
  assert.ok(!inCidr("2606:4701::9", "2606:4700::/32"));
  assert.ok(!inCidr("1.1.1.1", "2606:4700::/32")); // family mismatch never matches
});

test("known encrypted-DNS operators match on both anycast and egress ranges", () => {
  assert.equal(encryptedDnsOperator("1.1.1.1"), "Cloudflare");
  assert.equal(encryptedDnsOperator("172.68.24.7"), "Cloudflare"); // resolver egress
  assert.equal(encryptedDnsOperator("2001:4860:4860::8888"), "Google");
  assert.equal(encryptedDnsOperator("9.9.9.10"), "Quad9");
  assert.equal(encryptedDnsOperator("149.112.112.112"), "Quad9");
  assert.equal(encryptedDnsOperator("2620:fe::10"), "Quad9");
  assert.equal(encryptedDnsOperator("203.0.113.5"), null);
});

test("candidate parsing reads host, srflx and relay lines and skips mDNS", () => {
  assert.deepEqual(parseIceCandidate(candidate("203.0.113.5", "srflx")), { ip: "203.0.113.5", kind: "srflx" });
  assert.deepEqual(parseIceCandidate(candidate("192.168.1.5", "host")), { ip: "192.168.1.5", kind: "host" });
  assert.deepEqual(parseIceCandidate(candidate("2001:db8::1", "relay")), { ip: "2001:db8::1", kind: "relay" });
  assert.equal(parseIceCandidate("candidate:1 1 udp 2113937151 e3f.local 1234 typ host"), null);
  assert.equal(parseIceCandidate(""), null);
});

test("a srflx candidate equal to the reported address is not a leak", () => {
  const verdict = evaluateWebRtc(
    [candidate("192.168.1.5", "host"), candidate("203.0.113.5", "srflx")],
    { ipv4: "203.0.113.5", ipv6: null }
  );
  assert.equal(verdict.leak, null);
  assert.deepEqual(verdict.lanIps, ["192.168.1.5"]); // LAN address is informational only
});

test("a srflx candidate different from the reported address is the leak", () => {
  const verdict = evaluateWebRtc(
    [candidate("192.168.1.5", "host"), candidate("198.51.100.9", "srflx")],
    { ipv4: "203.0.113.5", ipv6: null }
  );
  assert.equal(verdict.leak, "198.51.100.9");
});

test("IPv6 leaks are caught too, and matching v6 is not a leak", () => {
  const leaking = evaluateWebRtc([candidate("2001:db8:dead::1", "srflx")], { ipv6: "2001:db8:beef::1" });
  assert.equal(leaking.leak, "2001:db8:dead::1");

  const clean = evaluateWebRtc([candidate("2001:0db8:beef:0:0:0:0:1", "srflx")], { ipv6: "2001:db8:beef::1" });
  assert.equal(clean.leak, null);
});

test("an unknown reported address never manufactures a leak", () => {
  const verdict = evaluateWebRtc([candidate("198.51.100.9", "srflx")], { ipv4: null, ipv6: null });
  assert.equal(verdict.leak, null);
});

test("a loopback reported address is treated as unknown, not as a mismatch", () => {
  const verdict = evaluateWebRtc([candidate("198.51.100.9", "srflx")], { ipv4: "127.0.0.1", ipv6: null });
  assert.equal(verdict.leak, null);
});

test("ULA and link-local candidates are LAN rows, not failures", () => {
  const verdict = evaluateWebRtc(
    [candidate("fd00::5", "host"), candidate("fe80::1", "host")],
    { ipv4: "203.0.113.5", ipv6: "2001:db8::1" }
  );
  assert.equal(verdict.leak, null);
  assert.deepEqual(verdict.lanIps, ["fd00::5", "fe80::1"]);
});

test("the encrypted-DNS verdict never passes without an observation", () => {
  assert.deepEqual(dohVerdict([], { ipv4: "203.0.113.5" }), { kind: "unknown" });
  assert.deepEqual(dohVerdict(["not-an-ip"], {}), { kind: "unknown" });
});

test("the encrypted-DNS verdict passes only on a known operator", () => {
  assert.deepEqual(dohVerdict(["172.68.24.7"], { ipv4: "203.0.113.5" }),
    { kind: "encrypted", operator: "Cloudflare", ip: "172.68.24.7" });
  assert.deepEqual(dohVerdict(["198.51.100.9", "8.8.4.4"], {}),
    { kind: "encrypted", operator: "Google", ip: "8.8.4.4" });
});

test("a resolver inside the visitor's own network is reported as the ISP's", () => {
  assert.deepEqual(dohVerdict(["203.0.113.9"], { ipv4: "203.0.113.5" }), { kind: "isp", ip: "203.0.113.9" });
  assert.deepEqual(dohVerdict(["198.51.100.9"], { ipv4: "203.0.113.5" }),
    { kind: "unrecognized", ip: "198.51.100.9" });
  assert.ok(sameNetwork("203.0.113.9", "203.0.113.5"));
  assert.ok(!sameNetwork("198.51.100.9", "203.0.113.5"));
});
