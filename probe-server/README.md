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

Port 5353 is taken by mDNS on macOS — use 5354 locally. Then:

```bash
dig +short @127.0.0.1 -p 5354 a1b2c3d4e5f60718.p.oilygold.xyz A
```

```bash
curl -s -H "x-probe-secret: dev" "http://127.0.0.1:8099/lookup?token=a1b2c3d4e5f60718"
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

Open UDP/53 from anywhere (resolvers can come from any address) and TCP/8080
for read-back:

```bash
gcloud compute firewall-rules create allow-dns-probe --allow=udp:53,tcp:8080 --target-tags=dns-probe --source-ranges=0.0.0.0/0
```

## Delegation

Two records in the **parent** zone (`oilygold.xyz`), not in `p`:

```
ns-probe.oilygold.xyz.  A   <VM_STATIC_IP>
p.oilygold.xyz.         NS  ns-probe.oilygold.xyz.
```

No glue record is needed — `ns-probe` lives in the parent zone, so it resolves
without one.

Verify delegation before wiring the site up:

```bash
dig +trace a1b2c3d4e5f60718.p.oilygold.xyz A
```

## systemd

Binding UDP/53 needs the capability, not root — the unit below grants only
that. `DynamicUser` gives the process no home and no shell.

```ini
[Unit]
Description=netcheck probe nameserver
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/netcheck/probe-server/server.ts --zone p.oilygold.xyz
Environment=PROBE_SECRET=CHANGEME
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

## Security notes

An authoritative server on open UDP/53 is a reflection candidate, so:

- `ANY` queries are REFUSED — they exist mainly to amplify.
- Out-of-zone names are REFUSED, never recursed. Answering them is what makes
  a box an open resolver.
- Answers use a compression pointer and no DNSSEC, keeping amplification near
  1x. There's a test asserting the response is no larger than the query.
- Per-source rate limit of 200 queries per 10s.
- Malformed packets get no reply at all, since the source may be spoofed.
- Sessions are bounded (20k) and expire after 5 minutes. The token space is
  public, so anyone can mint sessions by querying — unbounded growth would be
  a free OOM on a 1GB VM.

`PROBE_SECRET` guards the read-back endpoint. Without it, anyone who can guess
or observe a token learns a visitor's resolver IPs. Set a real one; the
systemd unit above ships a placeholder.
