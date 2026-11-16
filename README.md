# Token Launch Radar

A token launch radar for make.fun's "Build the best token launch radar" bounty
($1,325 in USDC). It reads a sealed DefiLlama snapshot, ranks pre-token protocols by
implied launch value, and shows a static dashboard with a farm plan for each one.

> TODO before submit: replace `{owner}` / `{repo}` in the badges below with the real
> GitHub owner and repository name. The badges must have no placeholders left.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/{owner}/{repo}/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/{owner}/{repo}/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18 or later, standard library only. Reads the sealed snapshot, writes
`board.json`, the dashboard data, and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
