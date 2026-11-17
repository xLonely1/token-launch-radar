# Token Launch Radar

A token launch radar for make.fun's "Build the best token launch radar" bounty
($1,325 in USDC). It reads a sealed DefiLlama snapshot, ranks pre-token protocols by
implied launch value, and shows a static dashboard with a farm plan for each one.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xlonely1/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xlonely1/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## How it ranks (model radar-3)

Implied value is computed only from the snapshot's own figures, fitted at run
time from the snapshot's traded tokens — no hardcoded names, no hardcoded
coefficients:

```
implied = round(exp(a + b × log(tvl_usd) + category_effect))
```

- **Size curve** — ordinary least squares, `log(mcap) = a + b × log(TVL)`,
  fitted on the 119 traded-token protocols with a positive market cap.
  Centralised-exchange tokens are excluded: their value is not tied to
  protocol TVL. On this snapshot the fit is `a = 7.788, b = 0.472` — market
  cap grows roughly like the square root of TVL, so a straight TVL multiple
  would overvalue the largest protocols and undervalue the small ones.
- **Category effect** — each category's median residual from the size curve,
  shrunk by `n / (n + 5)` and capped at ±1 log unit, only for categories with
  at least 2 traded comps. A category with one comp gets no effect: Risk
  Curators, the watchlist's largest category, has exactly one live comp.

**Tested out of sample** (both models refit on the training part of each split
only, so held-out tokens never leak into the fit):

| Held-out split | This model, median error | Old model, median error | This model, within 2x | Old model, within 2x |
| --- | --- | --- | --- | --- |
| Tokens listed from 2024 onward (n=51) | 73.9% | 93.4% | 43.1% | 19.6% |
| Random 70/30 split (n=35) | 90.3% | 230.0% | 28.6% | 17.1% |
| Mean over 7 held-out splits | 85.4% | 111.6% | 29.2% | 22.3% |

This model wins 5 of the 7 splits and loses 2 narrowly (by 0.2 and 2.9
percentage points). These are errors, not accuracy: market cap per dollar of
TVL varies from 0.00025x to 400x across traded tokens, so any launch value is
a wide estimate and the ranking is the product.

**What did not make it into the value** — 7-day growth, protocol age and chain
count were tested against the same traded tokens and dropped: their
correlations with log(market cap / TVL) are −0.15, −0.02 and −0.04, and adding
any of them made the held-out error worse. They are shown on the dashboard as
context, not as factors.

The board covers all 40 watchlist protocols (TVL ≥ $50M, no token on record) plus
186 pre-token protocols below the floor, ranked strongest first. The 24 live-token
protocols are set aside with their market caps shown, never mixed into the ranking.
Every row carries a 10-step farm plan with a cost and a time per step, ending in a
farm cost total and a net verdict that nets the farm against its own gas cost.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18 or later, standard library only. Reads the sealed snapshot, writes
`board.json`, the dashboard data, and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
