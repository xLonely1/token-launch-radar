# Token Launch Radar

A token launch radar for make.fun's "Build the best token launch radar" bounty
($1,325 in USDC). It reads a sealed DefiLlama snapshot, ranks pre-token protocols by
implied launch value, and shows a static dashboard with a farm plan for each one.

> Repo name is provisional (`token-launch-radar` under `xlonely1`) until the real
> GitHub repo is created — re-check the badge URLs against the real repo at submit time.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xlonely1/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xlonely1/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## How it ranks (model radar-2)

Implied value is computed only from the snapshot's own figures:

```
implied = round(tvl_usd × category_multiple × growth × maturity × reach)
```

- **category_multiple** — the median market-cap-to-TVL ratio of the live-token
  protocols in the same category, computed from this snapshot (categories with fewer
  than 3 live samples use the global median; every multiple is clamped to
  [0.05, 1.50]). No protocol name is ever special-cased.
- **growth** — `1 + clamp(change_7d, −60, 120) / 100 × 0.6`.
- **maturity** — `0.65 + min(age_days, 730) / 730 × 0.35`; age is the time since the
  protocol was first listed, the best record of how long it has run with no token.
- **reach** — `1 + 0.02 × min(chains − 1, 4)`.

The board covers all 40 watchlist protocols (TVL ≥ $50M, no token on record) plus
186 pre-token protocols below the floor, ranked strongest first. The 24 live-token
protocols are set aside with their market caps shown, never mixed into the ranking.
Every row carries an 8-step farm plan with a cost and a time per step.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18 or later, standard library only. Reads the sealed snapshot, writes
`board.json`, the dashboard data, and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
