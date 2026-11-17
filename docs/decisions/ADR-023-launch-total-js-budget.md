# ADR-023: Total JavaScript ceiling for the public-launch screens

Status: accepted by the user on 13 November 2026, during public-launch work.

ADR-022 capped all emitted client JavaScript, including mutually exclusive lazy
routes, at 230 KiB gzip. That ceiling was set before billing, pricing, team
management and invitation acceptance existed. With those four lazy routes
merged, the aggregate measured 238.78 KiB while every per-route budget except
the editor passed.

The user approved raising only the aggregate ceiling to 250 KiB gzip. Every
per-route budget is unchanged: home 125 KiB, collector 170 KiB, editor 190 KiB,
inbox 175 KiB and any other route 200 KiB. CSS 20 KiB, primary font 40 KiB and
all correctness, security and latency gates are also unchanged.

Per-route budgets govern what a visitor downloads for the page they open. The
aggregate counts screens most visitors never load, such as billing and invites,
so it limits total code growth rather than any single page's cost. The editor
route still exceeds its 190 KiB budget; this decision does not change that, and
the editor must be reduced before merge.

The checker's counting rules from ADR-022 are unchanged. No feature code is
bundled eagerly or excluded from the count to fit either limit.
