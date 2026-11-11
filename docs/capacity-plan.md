# Capacity and scaling plan

100,000 registered accounts is a storage/account count, not100,000 concurrent users. Capacity depends on activity, requests, upload bandwidth and database/provider limits. No production capacity guarantee follows from this local measurement.

## Planning workloads and targets

| Metric | Small-launch assumption | Growth planning example |
|---|---:|---:|
| Registered accounts |1,000 |100,000 |
| Monthly active accounts |300 |20,000 |
| Daily active accounts |100 |3,000 |
| Peak active sessions |20 |300 |
| Active simultaneous message views |5 |100 |
| Typical request rate |2–5/s |30–100/s peaks, measure before accepting |
| Orders/day |10 |300 |
| Uploads/day |30 |900 |
| Prepared upload maximum |3 MiB |Same limit; do not scale by increasing payloads |

These are assumptions for sizing, not measured user demand. An initial staging target is <500ms p95 for warm bounded catalogue reads, <1second p95 for authenticated ordinary reads/estimates, <2 seconds p95 for order submission excluding cold starts, and <1%unexpected errors at the agreed workload. Provider uploads/email/cold starts require separate budgets. Measure actual geography and mobile connections.

## Reproducible local measurement

```powershell
node scripts/load-local.mjs 1000 20
```

The script only starts its own127.0.0.1fixture; it has no external target option. It exercises the real estimate schema/pricing engine with 40%catalogue, 30%option reads and30%estimates. It does not load environment files, use production data or stress Atlas/ImageKit/Vercel.

Measured10November2026 on Windows x64, Node 24.21.0:1,000 requests,20 concurrent clients,0 errors,0.649 seconds,1,541.58 requests/second; latency p50=11.20ms,p95=19.42 ms,p99=61.80ms. Source: `artifacts/load-local.json`. This is a short local CPU/HTTP fixture measurement, not a sustained production/database/auth/upload benchmark. Test-process competition, JIT, loopback and warm caches affect it. Run staged ramp/soak tests only after an explicit approved test target/workload; never repoint this script at production.

## Current design and limits

- Static frontend/public supplied assets use CDN delivery. ImageKit handles durable images; responsive client preparation avoids function payload excess. No image binary is stored in MongoDB or function-local durable storage.
- Each warm API instance reuses one initialization and a Mongo pool capped at5,min0,idle60 seconds. Aggregate connections still grow with function instances:100instances can require about500application pool connections plus driver monitoring/other consumers. Coordinate platform concurrency with Atlas headroom before load growth.
- Production request/auth/order/upload/message limits use atomic Mongo time buckets and TTL, shared across instances. Hash/image CPU gates remain per-instance resource guards. Vercel firewall/edge limits add protection before expensive database work; per-instance memory is not presented as a global limit.
- Catalogue/options/orders/messages/ledgers/admin lists are paged and bounded. Required unique/order/owner/publication/TTL indexes are explicit migrations. Validate real query plans (`explain`) on a staging dataset; no production query-plan measurement was performed here.
- Private API responses use no-store and authenticated ownership; never share-cache drafts, accounts, quotes, conversations or signed private image links. Public catalogue caching can be added after an explicit revision/invalidation policy; no stale public-price cache is required now.
- Messaging polls only while visible/online and backs off from15 seconds toward60 seconds.100visible conversations at15 seconds mean about6.7polls/second before read-status/other requests.1000would mean about66.7/s. Watch read/write cost and unreads. Realtime/broker infrastructure is justified only after measured polling cost; current Vercel WebSocket beta is not an automatic multi-instance broadcast solution.
- Benefits, idempotency and rewards are transaction-driven. External provider calls cannot join Mongo transactions; failed image compensation has an operator reconciliation path. There is no automatic payment/courier feed or pretend background completion.

## Upgrade triggers

Illustrative storage arithmetic (assumptions, before replication/backups):100,000 account documents at2 KiB each are about195 MiB;200,000 order snapshots at12 KiB are about2.29 GiB;1 million messages at1 KiB are about0.95 GiB. Media metadata, indexes, audit/ledger history and retention add substantially; measure sampled BSON/index sizes rather than assuming a free database tier is sufficient.100,000 image deliveries averaging300 KiB imply about28.6 GiB delivered before cache/transformation behavior. Uploaded image bytes belong in ImageKit, not MongoDB. Recompute these figures from actual order/activity/retention data before choosing plans.

Alert on p95/errors/cold-start delay, Mongo connection/storage headroom, transaction retries, limit-store latency, repeated idempotency conflicts, failed compensation/email delivery, ImageKit bandwidth/storage and Vercel spend. Define owner/on-call and thresholds before launch. Examples requiring investigation: sustained >70%connection/storage capacity, >1%unexpected errors, or p95 breaching targets over multiple windows.

First optimize query plans/projections, pagination and image sizes; cap instance/connection growth, add reviewed caching for public reads, then size database/compute plans to measured demand. Use durable queues/workflows only for demonstrated long work or retry requirements; do not start microservices merely for a registered-user target. Cleanup/backup scheduling must be an explicit protected operator/hosting task rather than a serverless timer.

Commercial Vercel, Atlas limits/backups, static egress/private networking and ImageKit storage/transformation/bandwidth costs require verification in the actual accounts/regions. No purchase or assertion that free tiers support arbitrary scale is made. Sources: [Vercel plans](https://vercel.com/docs/plans), [function limits](https://vercel.com/docs/functions/limitations), [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [ImageKit security](https://imagekit.io/docs/media-delivery-basic-security).
