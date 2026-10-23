# Evolution Node security image recovery

Scope: image artifacts and offline restore contract only. No application service,
session, environment, canonical VPS stack installation, or deployment is performed
by these instructions. Evolution stays v2.3.7; only its Node executable changes.
The original and patched runtime use Alpine 3.23 and Node ABI 137.

## Immutable references

- Evolution pin: `localhost:5001/clicaepede/evolution-api:2.3.7-node24.22.1-security20261022@sha256:4303aaffa99dd1e03a421cb24e3372dc0af07c8258cf82326aab157dd051c98d`
- Registry runtime: `registry@sha256:01cd312e67026f06f5d89c3e133a4a9adc7cb9eeb9b1194e0b2954dfd770efd2`
- Registry storage archive: `evolution-registry-storage.tar.gz`
- Storage archive SHA-256: `a3240ea88648a7db4e2730823b338f1cdeeaa375d505168814216cd43aaeeaff`
- Registry runtime archive: `registry-runtime.tar`
- Registry runtime archive SHA-256: `43924b8353a152d2f9e7f25e85c88a6781ec6e02940a77f95dfa9f0ee4dd344b`
- Registry runtime configuration digest (classic-store Image ID): `sha256:ab6936a3291f1ddd0e9a88108f4739553a2cfff91489df98c0e24def15701a1c`

Private VPS artifacts are under
`/var/lib/clicaepede/security-node-20261022/` (root-only). The off-VPS copy and
sanitized evidence are outside Git in `D:/ProjetoIA/codex/clicaepede/SECURITY-2026-10-22/`.
Do not commit archives, Docker daemon data, or private logs. Image archives contain
only the prepared public-code image, not mounted application data or credentials.

## Preload from the original artifact

Use a trusted archive copy; verify both hashes above before extraction or load.
On Linux root, use `umask 077` and a fresh root-owned recovery directory. Extract
the storage archive there; it contains the `registry-storage/` directory. Never
extract over an application directory. Load `registry-runtime.tar` using
`docker image load`; on a classic image store, require the configuration digest
above as the loaded Image ID and run that ID with `--pull never`. On a containerd
image store, verify the loaded manifest/configuration chain before choosing its
Image ID. The bootstrap proof used an empty classic store, loaded only this tar,
and ran the verified configuration ID without pulling any image.
Never resolve an unqualified namespace or moving external tag as fallback.

Start the archived registry image as a standalone temporary container, not a
Swarm service, with these controls:

```text
--rm --name clica-security-image-recovery --pull never
--network host
--env REGISTRY_HTTP_ADDR=127.0.0.1:5001
--env REGISTRY_HTTP_DEBUG_ADDR=127.0.0.1:0
--read-only --cap-drop ALL --security-opt no-new-privileges:true
--memory 192m --pids-limit 128 --log-driver none
--mount type=bind,src=<absolute-recovered-registry-storage>,dst=/var/lib/registry
```

Both registry listeners must bind only loopback; verify with `ss` before using
them. No Docker socket mount, public listener, or registry credentials are needed.
The debug address override is necessary: the vendor default debug port is 5001.
Do not change the host Docker daemon's global registry/TLS configuration.

Pull the exact Evolution pin above into every eligible Swarm node's daemon, then
run `docker image inspect` against that same complete literal pin. Stop the
temporary registry and repeat the inspect. Test `node --version` with that pin,
`--pull never --network none --entrypoint node`; require `v24.22.1`.
Registry index digest, platform manifest digest, and image configuration digest
are different identities. Docker's containerd and classic image stores can expose
different values as Image ID; verify the registry manifest chain and RepoDigest,
not an assumed equality between all three hashes.

No application entrypoint, database command, session, secret mount, or application
network is used for image recovery. Do not execute the full restore validator
against production as part of this image-only procedure.

## Recovery proof and release gate

Require both `artifact-recovery-proof.json` and `registry-bootstrap-proof.json`
status `pass` with cleanup verified and
`off-vps-image-artifacts.json` status `pass`. The proof uses the archive extracted
into a fresh directory and an empty separate dockerd data-root, exec-root,
containerd namespaces and Unix socket. It disables bridge, iptables, IPv6 iptables,
IP forwarding setup and masquerading, without stopping the host daemon. It pulls
the literal canonical pin, verifies the manifest chain, stops the registry, then
executes only Node in a network-none container. All temporary processes must exit.
The separate bootstrap proof uses an independently empty daemon, loads the saved
registry runtime without downloads, starts it by verified Image ID with
`--pull never`, and serves the archived Evolution manifest on loopback port 5003.
This closes the gap where a cached registry runtime on the host could hide a
missing or unusable runtime archive.

The repository stack pin does not install the root-owned canonical VPS reference.
Main owns that later installation and any service update. Before release, main
must confirm the exact pin is preloaded on every eligible node, preserve the bot
pause, validate native operations and application health, and retain rollback
artifacts. `--no-resolve-image` only disables manager-side resolution; it does not
guarantee workers can start without a cached image. Re-preload after cache loss,
node replacement, or image pruning. Never fall back to a tag-only service image.

## Rebuild is auxiliary, not exact recovery

`scripts/infra/kan132/security-node-20261022.Dockerfile` records the two original
base digests and the single Node copy. A fresh build can produce a different
manifest/index digest (including provenance metadata). Do not claim it reproduces
the canonical pin unless independently verified. Prefer the archived original
registry storage. Any different rebuilt digest requires review, a new trusted
canonical reference and matching backup metadata; never bypass the restore gate.

The restore gate still uses fullmatch, root-owned trusted-stack equality,
preloaded images and `--pull never`. The sole host:port exception is
`localhost:5001/clicaepede/evolution-api`, and only for the Evolution service.
Historical backups with the old pin fail closed against the new canonical pin;
main must create a consistent new backup after its separately authorized cutover.
