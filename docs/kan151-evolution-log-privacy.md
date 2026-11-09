# Evolution log privacy (KAN-151)

## Boundary and limits

Evolution remains 2.3.7 on the exact Node 24.22.1 image pin. Its existing
supervisor filters stdout and stderr **before** Docker's json-file driver.
Known secrets are removed first, followed by identifier pseudonymization.
This is not a change to the app, message payloads, session store, database,
Redis, API authentication, webhook, worker or LLM configuration.

The filter handles JIDs in s.whatsapp.net, c.us, lid and g.us, including device
and group forms. Recognized phone fields include phone/phoneNumber/phone_number,
mobile/mobileNumber, telephone, recipientPhone, senderPhone, contactPhone,
waNumber, remoteJid and remoteJidAlt. The lexer carries sensitive parent context
through arrays/objects and multiline inspect output. Quoted strings, backticks,
Unicode escapes and serialized JSON are data, never evaluated code. ANSI is
normalized both before tokenization and after decoding quoted strings.

Phones in these fields are normalized to digits. Other technical identifiers,
timestamps, error codes and stack locations are retained in normal records.
This is a format-specific control, **not proof that arbitrary free text, custom
classes, Map/Set formatting or every possible obfuscation is free of personal
information**. Do not log message bodies intentionally. Review exports before
sharing, even after this filter.

Pseudonyms are HMAC-SHA256, truncated to 128 bits, with separate phone/JID
domains. The key is derived from the existing runtime API secret using the
domain KAN151/log-privacy/v1. No phone lookup dictionary or plain digest is
stored. Rotating that secret changes pseudonyms; preserve technical event IDs
for correlation across rotations. These values are pseudonymous personal data,
not anonymous data. Keep operator access restricted.

Per stream, retained input is capped at 64 KiB and structural depth at 64.
Oversize/incomplete/lost-context records emit explicit PRIVACY markers, never
an unfiltered fallback. Ambiguous continuations are suppressed; recognized
diagnostics continue with conservative masking. Numeric technical IDs may be
masked after context loss. Such markers require operator investigation of the
producer/format, not a switch back to plain output. Initial crypto failure
prevents child startup; pipeline errors stop the child and retain nonzero exit.

## Rollout and recovery

1. Read current health, image/config digests, full protected ContainerSpec,
   canonical and deploy stack hashes, deploy source hash, provider state and
   worker/webhook pause. Verify the old source bytes match the mounted Docker
   Config's immutable data before taking snapshots or starting backup.
2. Run the reviewed supervisor with synthetic secrets/identifiers in a
   disposable, network-none, read-only container on the exact cached image.
   Inspect Docker stdout/stderr, not only an in-memory regex result.
3. Take the existing consistent encrypted/off-VPS backup before the update.
4. Recheck all three file snapshots immediately before and after backup and
   again before the CAS; recheck the complete service Spec after backup.
   Content, inode, owner, permissions or modification/change-time drift stops
   the rollout. Read-induced access-time changes do not count as drift.
5. Create the immutable v4 Docker Config. Use the Engine API's service version
   compare-and-swap; only the log config ID/name changes. No image rebuild,
   new runtime, password rotation, port or volume changes.
6. Only after CAS acceptance, recheck the old inputs, publish the reviewed
   supervisor to the deploy/backup source, and publish the updated trusted
   canonical stack to both stack paths. A rejected CAS leaves all inputs old.
   Lost acknowledgement is unknown, not safe to retry: reconcile the durable
   intent and observed service config first.
7. Require healthy service, same image/Node, open paired session, unchanged
   protected ContainerSpec, webhook disabled and worker/timer paused. Take and
   verify a post-update encrypted backup containing the new supervisor.

The approved update briefly restarts only Evolution QA. PostgreSQL/Redis data
and session volumes are preserved. The old Docker Config is retained and
original files are snapshotted root-only for recovery; no automatic rollback
to unredacted logging is allowed.
The root maintenance intent is under /var/lib/clicaepede/kan151. On partial
failure, stop and reconcile; do not run deploy.sh or a second stack blindly.

Docker Configs are immutable; use a new reviewed config version for later
changes. Do not remove old configs or recovery data as an incidental cleanup.
See [Docker configs](https://docs.docker.com/engine/swarm/configs/) and the
[Engine service API](https://docs.docker.com/reference/api/engine/version/v1.44/).

### Trusted reference versus backup/deploy inputs

`CANONICAL` is `/opt/clicaepede/kan132`; only its `stack.yaml` is required.
There is no canonical `start-redacted.cjs`. The canonical directories must
resolve without symlinks, belong to root and not be group/world writable.
The canonical stack itself must also belong to root and not be group/world
writable. `DEPLOY_SOURCE` is separately `/home/brunoops/kan132`, whose
`stack.yaml` and `start-redacted.cjs` are collected by the existing root backup.
These user-writable inputs are hash-pinned evidence, not trusted references
for image, environment, credentials, volumes, ports or other runtime behavior.

The payload requires `expectedStackSha256` (canonical),
`expectedDeployStackSha256` (deploy) and `expectedOldSourceSha256` (deploy
supervisor), plus the existing protected ContainerSpec and reviewed-source
hashes. There is no expected canonical-source field. Every input must be a
resolved, non-symlink, single-link regular file, nonempty and at most 1 MiB;
descriptor reads are bounded to 1 MiB + 1 byte and metadata is checked again.

Read-only inspection of the failed attempt confirmed these baseline hashes:

- Canonical stack: `712a40d35154d174b820b775d8c2a9ce5fc72d50a3b83bfc4a67241e152d57cc`.
- Deploy stack: `1eca06cf5131dc099bdfb935bed4382fe561592bd7e849fb024847089d2582b5`.
- Old deploy supervisor: `800aae4423d6e5f75d369049e94065236420ddc86f1c071a3f943e3ed3d132ed`.

Only `services.evolution.image` differed semantically: deploy referenced
`evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339`,
whereas canonical matched the live security/Node image pin. The helper accepts
only that exact known legacy-image difference (or an already matching image)
and otherwise requires equal parsed stack data. Unknown differences fail
before snapshots/backup. Both output stacks derive from the trusted canonical
stack, changing only the log Config reference/key; the historical deploy image
is not propagated. No stack deploy command runs; the live service CAS changes
only the logging Config ID/name in the exact existing Spec.

Original service, canonical stack, deploy stack and supervisor snapshots use
root-private files (0600 inside the 0700 run directory). Publication deliberately
replaces deploy source/stack uid/gid 1000 and mode 0664 with root-managed 0600
files, as deploy.sh and backup require root. Direct non-root reads are no longer
supported. The parent deploy directory remains operator-writable: root-owned
files there are not promoted to a trust boundary. Hash/identity rechecks detect
drift but are not a cross-file transaction or a lock against that operator.
Post-CAS publication/health/backup failure requires root reconciliation from
the private snapshots and durable intent; never retry blindly or auto-rollback.

The earlier failed apply stopped before snapshots, backup or service update;
its run contained only `failure-sanitized.json` and probe files. This helper
correction was tested offline, not applied remotely. Approval remains limited
to the Evolution QA logging restart and up to two controlled manual sends.
It does not authorize a VPS restart or historical-log deletion.

## Historical logs, evidence and retention

- Existing Docker history is **not retroactively sanitized or deleted** by this
  rollout. Treat prior task logs as restricted personal-data records. Do not
  export raw service history, paste it into Jira, or copy it to support bundles.
- Existing operator/root and Docker socket restrictions remain the access
  boundary. No raw customer log was downloaded during this task: inventories
  return counts, hashes and health only, with an enforced byte ceiling.
- Distinguish aggregate service history from the current filtered container.
  audit.py current inspects only the latter; a service-history scan may still
  find old identifiers. Do not relabel those old records as newly sanitized.
- Rotation remains json-file max-size=10m/max-file=3. This is size-based
  retention, not a promise of a time-based expiry. Review old task history
  separately; deletion/archival requires a scoped, approved retention change.
- Do not truncate or rewrite Docker LogPath files, prune containers globally,
  delete audits, remove volumes or disconnect the phone to clean logs. Docker
  owns these files ([json-file driver](https://docs.docker.com/engine/logging/drivers/json-file/)).
- Previously shared evidence is sanitized; newly generated HTML/JSON contains
  counts and technical IDs only. Raw diagnostics and authenticated artifacts
  stay private. Reclassification/export of historical raw logs must use the
  corrected filter in a restricted workflow and a human review before release.

## Acceptance distinctions

Offline unit tests cover splits/one-byte chunks, escapes, inspect containers,
both streams, bounded records, backpressure, signal/exit behavior and regression
repros. Maintenance tests mock Docker/network and prove safety branches; they
are not real rollout evidence. The isolated Docker probe is real but has no
WhatsApp connectivity.

User separately approved up to two controlled messages to the authorized QA
recipient. This check uses the native app client and notification formatter;
it does not activate the bot or create a commercial order/outbox. ACK is not
physical receipt; receipt and peer reply must be confirmed separately. A new
transactional-queue end-to-end test is outside this log-filter correction.
No automatic retry after a send intent, timeout or unknown outcome is allowed.

Publish observed rollout/transport results and limitations in Jira. Keep the
physical criterion unchecked until that authorized check is complete. Never
mark global privacy, KAN-94/KAN-95 or full bot QA approved by this patch alone.
