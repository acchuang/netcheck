# Probe nameserver

Authoritative nameserver for `p.oilygold.xyz`. The browser resolves
`<token>.p.oilygold.xyz`; every recursive resolver in the visitor's real path
has to ask this box directly, so the source IPs it sees are their resolvers.
The Worker reads results back over HTTP.

This is the only part of netcheck that can observe the visitor's own recursion
path — a DoH client can never see it, because it only ever talks to one
resolver.

## Local run

```bash
PROBE_SECRET=dev node probe-server/server.ts --zone p.oilygold.xyz --dns-port 5354 --http-port 8099
```

Without `PROBE_TLS_CERT`/`PROBE_TLS_KEY` the read-back listener binds to
`127.0.0.1` only — fine locally, unreachable from a deployed Worker. That is
deliberate; see TLS below.

Port 5353 is taken by mDNS on macOS — use 5354 locally. Then:

```bash
dig +short @127.0.0.1 -p 5354 a1b2c3d4e5f60718.p.oilygold.xyz A
```

Read-back is keyed by the read key, not by the queried label — the label is the
key's SHA-256, truncated to 16 hex. Every resolver in the path sees the label,
so if the label were also the credential, watching a query would be enough to
pull that visitor's resolver list:

```bash
KEY=00112233445566778899aabbccddeeff
LABEL=$(printf %s "$KEY" | shasum -a 256 | cut -c1-16)
dig +short @127.0.0.1 -p 5354 "$LABEL.p.oilygold.xyz" A
curl -s -H "x-probe-secret: dev" "http://127.0.0.1:8099/lookup?key=$KEY"
```

## GCP always-free VM

The always-free e2-micro is limited to `us-west1`, `us-central1` and
`us-east1`. Anything else bills.

```bash
gcloud compute instances create netcheck-probe --machine-type=e2-micro --zone=us-central1-a --image-family=debian-12 --image-project=debian-cloud --tags=dns-probe
```

Reserve the address so a stop/start doesn't change it — an ephemeral IP would
silently break the delegation:

```bash
gcloud compute addresses create netcheck-probe-ip --region=us-central1
```

Open UDP/53 from anywhere (resolvers can come from any address), TCP/8443
for read-back, and TCP/80 for certbot's HTTP-01 challenge — every renewal needs
it, not just the first issue. Nothing listens on 80 between renewals:

```bash
gcloud compute firewall-rules create allow-dns-probe --allow=udp:53,tcp:80,tcp:8443 --target-tags=dns-probe --source-ranges=0.0.0.0/0
```

HTTP-01 rather than DNS-01 on purpose: DNS-01 would put a Cloudflare API token
on this box able to edit `oilygold.xyz`, so a compromised probe could rewrite
the whole parent zone.

Get the code onto the VM — the repo is public, and the server imports
`src/shared/dns-wire.ts`, so it needs the checkout, not just this directory:

```bash
sudo git clone https://github.com/acchuang/netcheck.git /opt/netcheck
```

To deploy a change later:

```bash
gcloud compute ssh netcheck-probe --zone us-central1-a -- 'cd /opt/netcheck && sudo git pull --ff-only && sudo systemctl restart netcheck-probe'
```

## Delegation

Two records in the **parent** zone (`oilygold.xyz`), not in `p`:

```
ns-probe.oilygold.xyz.  A   <VM_STATIC_IP>
p.oilygold.xyz.         NS  ns-probe.oilygold.xyz.
```

`oilygold.xyz` is on Cloudflare DNS: both records must be **DNS only (grey
cloud)**. A proxied `ns-probe` resolves to Cloudflare's anycast IPs, so
resolvers send UDP/53 to Cloudflare instead of this box.

Add the delegation only after the service answers locally (see below) —
resolvers cache a lame delegation.

An `AAAA` for `ns-probe` too, if the VM has IPv6 — the v6 listener is useless
to resolvers that cannot find an address to reach it on.

No glue record is needed — `ns-probe` lives in the parent zone, so it resolves
without one.

Verify delegation before wiring the site up:

```bash
dig +trace a1b2c3d4e5f60718.p.oilygold.xyz A
```

## TLS on the read-back endpoint

The read-back request sends `PROBE_SECRET` in a header and gets a visitor's
resolver IPs back. Over plaintext both are visible to every hop between
Cloudflare and this box, and the secret is replayable: whoever reads it can
enumerate any token. So the server serves HTTPS when given a certificate and
binds to loopback when not — there is no "insecure but public" mode.

`ns-probe.oilygold.xyz` already points at this VM, so certbot can use it:

```bash
sudo certbot certonly --standalone -d ns-probe.oilygold.xyz
```

Then in the unit:

```ini
Environment=PROBE_TLS_CERT=/etc/letsencrypt/live/ns-probe.oilygold.xyz/fullchain.pem
Environment=PROBE_TLS_KEY=/etc/letsencrypt/live/ns-probe.oilygold.xyz/privkey.pem
```

`DynamicUser=yes` cannot read `/etc/letsencrypt/live` — either add a
`ReadWritePaths=`/group grant for the renewed files, or copy them to a path the
unit can read from a certbot deploy hook. Renewal restarts nothing by itself;
the certificate is read once at startup, so add `--deploy-hook 'systemctl
restart netcheck-probe'`.

The Worker refuses a plaintext `PROBE_SERVER_URL` (localhost excepted) and
reports the probe as unconfigured rather than sending the secret in the clear.

## systemd

Binding UDP/53 needs the capability, not root — the unit below grants only
that. `DynamicUser` gives the process no home and no shell.

```ini
[Unit]
Description=netcheck probe nameserver
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/netcheck/probe-server/server.ts --zone p.oilygold.xyz --ns ns-probe.oilygold.xyz --http-port 8443
Environment=PROBE_SECRET=CHANGEME
Environment=PROBE_TLS_CERT=/etc/netcheck/tls/fullchain.pem
Environment=PROBE_TLS_KEY=/etc/netcheck/tls/privkey.pem
DynamicUser=yes
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Needs Node 24+ on the VM for native TypeScript execution. Debian 12's packaged
Node is far older — install from nodesource.

## Monitoring

Point a free external HTTPS monitor (UptimeRobot or similar) at
`https://ns-probe.oilygold.xyz:8443/healthz`. That catches a dead VM, a crashed
process, and an expired certificate. It does not catch a lost UDP/53 firewall
rule or a broken delegation — `dig +trace` at setup covers those. If the box
is down, the site shows the probe as unavailable rather than failing.

## Security notes

An authoritative server on open UDP/53 is a reflection candidate, so:

- `ANY` queries are REFUSED — they exist mainly to amplify.
- Out-of-zone names are REFUSED, never recursed. Answering them is what makes
  a box an open resolver.
- Answers use a compression pointer and no DNSSEC, keeping amplification near
  1x. There's a test asserting the response is no larger than the query.
- Per-source rate limit of 200 queries per 10s, over a bounded LRU map (50k
  sources). Source IPs are spoofable and free, so an unbounded counter map is
  itself the attack surface.
- Both UDP/53 v4 and v6 are served: a resolver reaching us over IPv6 would be
  invisible on a v4-only listener, and a missing transport reads as "fewer
  resolvers" rather than as a gap. No TCP listener — every answer fits in 512
  bytes, so nothing ever sets TC=1.
- Negative answers (NXDOMAIN, NODATA) carry the zone SOA so resolvers can cache
  them. That costs ~96 bytes, taking amplification to roughly 3x on the worst
  case; the rate limit, not the packet size, is what makes this useless as a
  reflector.
- The apex answers its own NS and SOA, and NODATAs everything else. NXDOMAIN at
  the apex would be an RFC 8020 cut telling resolvers to stop asking for every
  name below it — which is every name we serve.
- Malformed packets get no reply at all, since the source may be spoofed.
- Sessions are bounded (20k) and expire after 5 minutes. The token space is
  public, so anyone can mint sessions by querying — unbounded growth would be
  a free OOM on a 1GB VM.

`PROBE_SECRET` guards the read-back endpoint. Set a real one; the systemd unit
above ships a placeholder. It is the second of two independent barriers: the
first is that the queried name is only the hash of the read key, so observing
DNS traffic — or reading this server's own logs — never yields something that
can be exchanged for a visitor's resolver list.
