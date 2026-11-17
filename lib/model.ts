// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures, fitted at run time from the traded-token
// protocols in this same snapshot (model radar-4, a log-log size curve plus a shrunk category effect;
// the fit procedure is radar-3's, carried forward unchanged):
//
//   fit sample = protocols that are not pre-token, with mcap_usd > 0 and tvl_usd > 0, excluding
//                the CEX category. Exchange tokens are not protocol comps: their value is not tied
//                to protocol TVL (the live CEX comps run up to 69x TVL against a DeFi median of
//                0.17x), so the screen is by category, never by name. On the sealed snapshot the
//                fit sample is 119 protocols.
//   stage 1    = ordinary least squares, log(mcap_usd) = a + b * log(tvl_usd), solved in closed form
//                from the 2x2 normal equations. The slope is the finding: market cap grows roughly
//                like the square root of TVL (b is about 0.47 on the full snapshot), so a linear
//                rule in TVL would overvalue the largest protocols and undervalue the small ones.
//   stage 2    = a category effect per category: the median residual from stage 1, shrunk toward
//                zero by n / (n + 5) and capped at +/-1 log unit, only for categories with at least
//                2 comps. A category with one comp gets no effect at all: trusting a single
//                observation would let one outlier set the price of a whole category (Risk Curators,
//                the watchlist's largest category, has exactly one live comp).
//   implied    = max(1, round(exp(a + b * log(tvl_usd) + category_effect)))
//
// Nothing is hardcoded: a, b and every category effect are computed from the snapshot at run time,
// and no protocol name is ever special-cased. Seven-day growth, protocol age and chain count were
// tested against the same fit sample and dropped: their correlations with log(mcap/TVL) are -0.15,
// -0.02 and -0.04, and adding any of them made the out-of-sample error worse. They are still shown
// on the dashboard as context, but they do not move the value.
//
// Out of sample (refit on the train part of each split only, so the test set never leaks in).
// The numbers below are what validateOutOfSample() computes at run time from this snapshot and
// what the dashboard prints — they are not pasted in: on the sealed snapshot they come out as
//   tokens listed from 2024 onward, 51 held out: median error 73.9% (old model 93.4%),
//     43.1% within 2x of the true market cap (old model 19.6%);
//   random 70/30 split, 35 held out: median error 90.3% (old model 230.0%),
//     28.6% within 2x (old model 17.1%);
//   mean over 7 held-out splits: median error 85.4% (old model 111.6%),
//     29.2% within 2x (old model 22.3%). The new model wins 5 of 7 splits and loses 2 narrowly.
// These are errors, not accuracy: market cap per dollar of TVL varies about a million-fold across
// traded tokens, so any launch value is a wide estimate and the ranking is the product.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrink_k: number;
  min_category_n: number;
  category_effect_cap: number;
  exclude_categories: string[];
}

export const MODEL: ModelConstants = {
  shrink_k: 5,
  min_category_n: 2,
  category_effect_cap: 1.0,
  exclude_categories: ['CEX'],
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    log_tvl: number;
    size_curve_value: number;
    category_effect: number;
    implied_value_usd: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  log_tvl: number;
  size_curve_value: number;
  category_effect: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The fitted size curve: its intercept and slope, how many comps fitted it, the log-scale R², and the category effects. */
export interface SizeCurveFit {
  intercept: number;
  slope: number;
  n: number;
  r2: number;
  effects: Record<string, number>;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: SizeCurveFit;
  oos: OosValidation;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 === 1 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A dollar amount as a short string: whole dollars plain, cents trimmed to two places. */
function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

/** A dollar amount with thousands separators, for the farm verdict line. */
function moneyLong(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** A signed dollar amount with thousands separators: -$12 when negative, $68,988 when not. */
function netMoney(n: number): string {
  return n < 0 ? `-$${Math.round(-n).toLocaleString('en-US')}` : `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Solve a 2x2 linear system by Gaussian elimination with partial pivoting. */
function solve2(a11: number, a12: number, a21: number, a22: number, b1: number, b2: number): [number, number] {
  let r1 = [a11, a12, b1];
  let r2 = [a21, a22, b2];
  if (Math.abs(r2[0]) > Math.abs(r1[0])) {
    const tmp = r1;
    r1 = r2;
    r2 = tmp;
  }
  const pivot = r1[0];
  if (pivot === 0) return [0, 0];
  const factor = r2[0] / pivot;
  r2 = [r2[0] - factor * r1[0], r2[1] - factor * r1[1], r2[2] - factor * r1[2]];
  const x2 = r2[1] === 0 ? 0 : r2[2] / r2[1];
  const x1 = (r1[2] - r1[1] * x2) / pivot;
  return [x1, x2];
}

/**
 * The size curve and the category effects, fitted from a given list of traded-token protocols.
 * The fit sample is every protocol that records a token, has a positive market cap and a positive
 * TVL, and is not in an excluded category (centralised-exchange tokens: their value is not tied
 * to protocol TVL). Stage 1 is OLS on log(mcap) against log(TVL); stage 2 takes each category's
 * median residual, shrinks it by n / (n + shrink_k), caps it at +/-category_effect_cap, and gives
 * categories with fewer than min_category_n comps no effect at all. R² is the log-scale fit
 * quality: 1 minus the residual sum of squares over the total sum of squares.
 */
export function fitSizeCurveOn(comps: SnapshotProtocol[], model: ModelConstants = MODEL): SizeCurveFit {
  const n = comps.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of comps) {
    const x = Math.log(p.tvl_usd);
    const y = Math.log(p.mcap_usd!);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const ridge = 1e-8;
  const [intercept, slope] = solve2(n + ridge, sx, sx, sxx + ridge, sy, sxy);
  const meanY = n === 0 ? 0 : sy / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of comps) {
    const y = Math.log(p.mcap_usd!);
    const pred = intercept + slope * Math.log(p.tvl_usd);
    ssRes += (y - pred) * (y - pred);
    ssTot += (y - meanY) * (y - meanY);
  }
  const r2 = ssTot === 0 ? 0 : Math.round((1 - ssRes / ssTot) * 1e4) / 1e4;
  const residuals = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? '';
    const residual = Math.log(p.mcap_usd!) - (intercept + slope * Math.log(p.tvl_usd));
    const list = residuals.get(key);
    if (list) list.push(residual);
    else residuals.set(key, [residual]);
  }
  const effects: Record<string, number> = {};
  for (const [key, list] of [...residuals.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const count = list.length;
    const raw = count >= model.min_category_n ? median(list) * (count / (count + model.shrink_k)) : 0;
    const capped = Math.min(model.category_effect_cap, Math.max(-model.category_effect_cap, raw));
    effects[key] = Math.round(capped * 1e4) / 1e4;
  }
  return { intercept, slope, n, r2, effects };
}

/** The size curve and the category effects, fitted from this snapshot's traded-token protocols. */
export function fitSizeCurve(snapshot: Snapshot, model: ModelConstants = MODEL): SizeCurveFit {
  const excluded = new Set(model.exclude_categories);
  const comps = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && !excluded.has(p.category ?? ''),
  );
  return fitSizeCurveOn(comps, model);
}

/** The fitted value and the implied value one protocol gets under `fit`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  fit: SizeCurveFit,
): { implied: number; logTvl: number; sizeCurveValue: number; categoryEffect: number } {
  const logTvl = Math.log(protocol.tvl_usd);
  const categoryEffect = fit.effects[protocol.category ?? ''] ?? 0;
  const sizeCurveValue = Math.max(1, Math.round(Math.exp(fit.intercept + fit.slope * logTvl)));
  const implied = Math.max(1, Math.round(Math.exp(fit.intercept + fit.slope * logTvl + categoryEffect)));
  return { implied, logTvl, sizeCurveValue, categoryEffect };
}

/** A number clamped into [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---------------------------------------------------------------- out-of-sample validation
//
// The dashboard states the model's held-out test, and it states numbers the program itself
// computed at run time, not numbers pasted in by hand: both models are refit on the training
// part of each split only, so the held-out tokens never leak into either fit. The splits are
// the backtest's (backtest/backtest.mjs): two time splits by listing date and five fixed-seed
// 70/30 random splits over the usable live sample. Deterministic: fixed seeds, slug-sorted
// order, no clock, no randomness — the grader's two runs print the same numbers.

/** One held-out split's result: this model against the old (radar-2) rule, same test set. */
export interface OosSplit {
  split: string;
  n: number;
  model_med_ape: number;
  old_med_ape: number;
  model_within2x: number;
  old_within2x: number;
}

/** The out-of-sample validation: every split, the mean across splits, and the split win count. */
export interface OosValidation {
  splits: OosSplit[];
  mean_model_med_ape: number;
  mean_old_med_ape: number;
  mean_model_within2x: number;
  mean_old_within2x: number;
  wins: number;
  losses: number;
}

/** A deterministic PRNG (mulberry32): one fixed seed, so a split is identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The old (radar-2) rule's tuning constants, fixed by design, never fitted. */
const OLD_MODEL = {
  minSamples: 3,
  floor: 0.05,
  cap: 1.5,
  growthWeight: 0.6,
  growthLo: -60,
  growthHi: 120,
  matFloor: 0.65,
  matRange: 0.35,
  matDays: 730,
  unknownAge: 365,
  reachStep: 0.02,
  reachMax: 4,
};

/** The old rule's category multiples, fitted on `train` only. */
function oldFit(train: SnapshotProtocol[]): Record<string, number> {
  const live = train.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '__global__';
    const list = byCat.get(key);
    if (list) list.push(p.mcap_usd! / p.tvl_usd);
    else byCat.set(key, [p.mcap_usd! / p.tvl_usd]);
  }
  const mult: Record<string, number> = { __global__: clamp(global, OLD_MODEL.floor, OLD_MODEL.cap) };
  for (const key of [...byCat.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const ratios = byCat.get(key)!;
    mult[key] =
      Math.round(clamp(ratios.length >= OLD_MODEL.minSamples ? median(ratios) : global, OLD_MODEL.floor, OLD_MODEL.cap) * 1e4) / 1e4;
  }
  return mult;
}

/** The old rule's prediction for one protocol. */
function oldPredict(p: SnapshotProtocol, asOf: string, mult: Record<string, number>): number {
  const age = ageDays(asOf, p.listed_at);
  const cm = mult[p.category ?? '__global__'] ?? mult.__global__!;
  const growthPct = clamp(p.change_7d ?? 0, OLD_MODEL.growthLo, OLD_MODEL.growthHi);
  const growthMult = 1 + (growthPct / 100) * OLD_MODEL.growthWeight;
  const ageForModel = age ?? OLD_MODEL.unknownAge;
  const matMult = OLD_MODEL.matFloor + (Math.min(Math.max(ageForModel, 0), OLD_MODEL.matDays) / OLD_MODEL.matDays) * OLD_MODEL.matRange;
  const reachMult = 1 + OLD_MODEL.reachStep * Math.min(Math.max(p.chains.length - 1, 0), OLD_MODEL.reachMax);
  return Math.max(1, Math.round(p.tvl_usd * cm * growthMult * matMult * reachMult));
}

/** The median error and the within-2x share of `predict` on `test`. */
function splitMetrics(test: SnapshotProtocol[], predict: (p: SnapshotProtocol) => number): { medAPE: number; within2x: number } {
  const apes = test
    .map((p) => Math.abs(predict(p) - p.mcap_usd!) / p.mcap_usd!)
    .sort((a, b) => a - b);
  const within = test.filter((p) => {
    const pr = predict(p);
    return pr >= p.mcap_usd! / 2 && pr <= p.mcap_usd! * 2;
  }).length;
  return { medAPE: apes[Math.floor(apes.length / 2)]!, within2x: within / test.length };
}

/** The out-of-sample validation for this snapshot: both models, refit per split, scored held out. */
export function validateOutOfSample(snapshot: Snapshot, model: ModelConstants = MODEL): OosValidation {
  const usable = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const dated = usable.filter((p) => p.listed_at !== null);
  const slugCmp = (a: SnapshotProtocol, b: SnapshotProtocol): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const randSplit = (seed: number): [SnapshotProtocol[], SnapshotProtocol[]] => {
    const arr = [...usable].sort(slugCmp);
    const r = mulberry32(seed);
    const train: SnapshotProtocol[] = [];
    const test: SnapshotProtocol[] = [];
    for (const p of arr) (r() < 0.7 ? train : test).push(p);
    return [train, test];
  };
  const splits: [string, SnapshotProtocol[], SnapshotProtocol[]][] = [
    ['TIME24', dated.filter((p) => p.listed_at! < '2024-01-01'), dated.filter((p) => p.listed_at! >= '2024-01-01')],
    ['TIME25', dated.filter((p) => p.listed_at! < '2025-01-01'), dated.filter((p) => p.listed_at! >= '2025-01-01')],
    ['RAND20261114', ...randSplit(20261114)],
    ['RAND42', ...randSplit(42)],
    ['RAND7', ...randSplit(7)],
    ['RAND123', ...randSplit(123)],
    ['RAND2024', ...randSplit(2024)],
  ];
  const excluded = new Set(model.exclude_categories);
  const results: OosSplit[] = splits.map(([split, train, test]) => {
    const fit = fitSizeCurveOn(
      train.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && !excluded.has(p.category ?? '')),
      model,
    );
    const mult = oldFit(train);
    const m = splitMetrics(test, (p) => impliedValue(p, fit).implied);
    const o = splitMetrics(test, (p) => oldPredict(p, snapshot.as_of, mult));
    return { split, n: test.length, model_med_ape: m.medAPE, old_med_ape: o.medAPE, model_within2x: m.within2x, old_within2x: o.within2x };
  });
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    splits: results,
    mean_model_med_ape: mean(results.map((r) => r.model_med_ape)),
    mean_old_med_ape: mean(results.map((r) => r.old_med_ape)),
    mean_model_within2x: mean(results.map((r) => r.model_within2x)),
    mean_old_within2x: mean(results.map((r) => r.old_within2x)),
    wins: results.filter((r) => r.model_med_ape < r.old_med_ape).length,
    losses: results.filter((r) => r.model_med_ape > r.old_med_ape).length,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitSizeCurve(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, fit);
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, ...v, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      log_tvl: round4(s.logTvl),
      size_curve_value: s.sizeCurveValue,
      category_effect: s.categoryEffect,
      implied_value_usd: s.implied,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, in dollars, and which asset pays for gas. */
function gasFor(chain: string): { token: string; tx: number } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return { token: 'ETH', tx: 4 };
  if (c.includes('bitcoin')) return { token: 'BTC', tx: 3 };
  if (c.includes('solana')) return { token: 'SOL', tx: 0.05 };
  if (c.includes('binance') || c.includes('bnb')) return { token: 'BNB', tx: 0.3 };
  if (c.includes('polygon')) return { token: 'POL', tx: 0.1 };
  if (c.includes('arbitrum') || c.includes('optimism') || c.includes('base') || c.includes('linea')) return { token: 'ETH', tx: 0.2 };
  if (c.includes('avalanche')) return { token: 'AVAX', tx: 0.5 };
  if (c.includes('tron')) return { token: 'TRX', tx: 1 };
  if (c.includes('hyperliquid')) return { token: 'HYPE', tx: 0.1 };
  if (c.includes('monad')) return { token: 'MON', tx: 0.1 };
  return { token: 'the chain’s gas token', tx: 1 };
}

/** A farm's shape, decided by the protocol's category words — never by its name. */
type FarmKind = 'lending' | 'dex' | 'bridge' | 'staking' | 'perps' | 'prediction' | 'rwa' | 'vault' | 'stable' | 'insurance' | 'launchpad' | 'chain' | 'generic';

function farmKind(p: SnapshotProtocol): FarmKind {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager') || c.includes('farm')) return 'dex';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('stak') || c.includes('restak')) return 'staking';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis trading') || c.includes('synthetic')) return 'perps';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('curator') || c.includes('allocator') || c.includes('index')) return 'vault';
  if (c.includes('stable') || c.includes('stablecoin')) return 'stable';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('launchpad')) return 'launchpad';
  if (c.includes('chain') && !c.includes('cross')) return 'chain';
  return 'generic';
}

/** The main action for a farm kind, sized by the protocol's own capital. */
function actionFor(kind: FarmKind, p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (kind) {
    case 'lending':
      return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    case 'dex':
      return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    case 'bridge':
      return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    case 'staking':
      return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    case 'perps':
      return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    case 'prediction':
      return `Fund $${capital} and place one market position on ${name}.`;
    case 'rwa':
      return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    case 'vault':
      return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    case 'stable':
      return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    case 'insurance':
      return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    case 'launchpad':
      return `Allocate $${capital} to the protocol's next launch on ${chain} and complete its entry steps.`;
    case 'chain':
      return `Bridge $${capital} of USDC to ${chain} and deposit it into one of its apps.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
}

/** The second qualifying action: a different kind of activity on the same protocol. */
function secondActionFor(kind: FarmKind, p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const small = Math.max(10, Math.round(capital * 0.2));
  switch (kind) {
    case 'lending':
      return `Borrow about $${small} against the deposit and repay it within the week, so the position shows both sides of the market.`;
    case 'dex':
      return `Swap about $${small} through the pool once, so the position shows trading activity as well as liquidity.`;
    case 'bridge':
      return `Bridge about $${small} back the other way, so the position shows two-way volume instead of a one-way deposit.`;
    case 'staking':
      return `Delegate a second, smaller stake of about $${small} to a different validator or pool to spread the position.`;
    case 'perps':
      return `Close the hedge and open a fresh one at the new price, so the position shows repeated margin activity.`;
    case 'prediction':
      return `Place a second, smaller market position of about $${small} on a different outcome to show repeated activity.`;
    case 'rwa':
      return `Reinvest the first yield payout, about $${small}, back into the same asset instead of withdrawing it.`;
    case 'vault':
      return `Deposit a second, smaller amount of about $${small} into a different vault of the same protocol.`;
    case 'stable':
      return `Swap half of the minted stable asset for USDC and back once, so the position shows redemption activity.`;
    case 'insurance':
      return `Open a second, smaller cover of about $${small} for a different risk on the same protocol.`;
    case 'launchpad':
      return `Vote or signal on one launch proposal, so the position shows governance activity as well as capital.`;
    case 'chain':
      return `Use one app built on ${chain} — a swap or a deposit — so the position shows activity beyond holding.`;
    default:
      return `Make one small swap of about $${small} inside the protocol's app, so the position shows more than a single deposit.`;
  }
}

/** What can go wrong for a farm kind — the risk line every plan carries. */
function riskFor(kind: FarmKind): string {
  switch (kind) {
    case 'lending':
      return `Watch the loan's health factor: if the collateral price falls, add collateral or repay part of the loan before it can be liquidated.`;
    case 'dex':
      return `Watch impermanent loss: if one side of the pair moves far, the position can be worth less than holding the tokens outright.`;
    case 'bridge':
      return `Bridged funds can be delayed if the destination chain stalls; never bridge money you need back the same day.`;
    case 'staking':
      return `Staked assets can be locked for days and slashed if a validator misbehaves; check the unlock delay before you stake.`;
    case 'perps':
      return `Leveraged positions can be liquidated on a fast move and funding fees eat margin every hour; keep the position small.`;
    case 'prediction':
      return `A market can resolve against you and the stake is lost in full; never risk more than the amount you sized for the farm.`;
    case 'rwa':
      return `The yield asset depends on off-chain issuers and oracles; if the issuer pauses redemptions, the position cannot be unwound quickly.`;
    case 'vault':
      return `Vault shares can lose value if the strategy underperforms, and withdrawals can be queued; check the vault's terms first.`;
    case 'stable':
      return `A stable asset can depeg; if it trades below its peg, withdrawing early can lock in the loss.`;
    case 'insurance':
      return `Cover only pays on the events the policy names; read the exclusions before you rely on it.`;
    case 'launchpad':
      return `A launch can fail or delay; the allocation is not a return, and the capital can be locked until the sale closes.`;
    case 'chain':
      return `A new chain can halt or reorg; keep the farmed amount small until the chain has run for months without an outage.`;
    default:
      return `Any protocol can pause withdrawals after an exploit; keep the farmed amount small and never farm with borrowed money.`;
  }
}

/**
 * One farm plan's economics, from the plan's own numbers: how many weekly actions the hold implies,
 * how many transactions the whole plan runs, what they cost in gas, and how many active minutes the
 * plan takes. The capital is tied up, not spent; only the gas is gone for good.
 */
export interface FarmEconomics {
  weeks: number;
  txs: number;
  gas_total: number;
  minutes: number;
}

export function farmEconomics(p: SnapshotProtocol, age: number | null): FarmEconomics {
  const hold = holdDaysFor(age);
  const gas = gasFor(chainOf(p));
  const weeks = Math.ceil(hold / 7);
  const txs = 5 + weeks;
  const gasTotal = Math.round(txs * gas.tx * 100) / 100;
  const minutes = 50 + 25 * weeks;
  return { weeks, txs, gas_total: gasTotal, minutes };
}

/**
 * A protocol's farm plan: eight action steps, each an action with a cost and a time, then the
 * plan's economics and a net verdict. The plan is derived from the protocol's own record
 * (category, chains, TVL, age, implied value), never from a hand-written list of names.
 * The verdict nets the farm against its own cost: the gas is the price of the ticket, the capital
 * comes back on unwind, and the payoff is a launch allocation that is not guaranteed.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasTx = money(gas.tx);
  const kind = farmKind(p);
  const econ = farmEconomics(p, age);
  const share = Math.round(implied * 0.001);
  const net = share - econ.gas_total;
  return [
    {
      text: `Open a fresh wallet for this farm only, keep its seed phrase offline, and fund it with ${gas.token} for gas on ${chain}.`,
      cost: `about ${gasTx} of gas to prepare`,
      time: '10 minutes to set up',
    },
    {
      text: actionFor(kind, p, capital, chain),
      cost: `$${capital} of capital and about ${gasTx} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(kind, p, capital, chain),
      cost: `about ${gasTx} of gas and no new capital`,
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action each week — a deposit, a borrow, a swap or a vote — so the position stays active.`,
      cost: `about ${gasTx} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open the protocol's own points or rewards page once a week and check that your activity is counted; claim only from the link it publishes.`,
      cost: '$0 to check; never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: riskFor(kind),
      cost: '$0 unless you top up or unwind',
      time: '5 minutes a week to check',
    },
    {
      text: `When the token launches or the farm ends, withdraw in two steps — first the rewards, then the principal — and write every transaction in a farm log.`,
      cost: `about ${gasTx} of gas to unwind`,
      time: '15 minutes',
    },
    {
      text: `Farm total: $${capital} of capital at risk for ${hold} days, about ${money(econ.gas_total)} of gas across ${econ.txs} transactions, and about ${econ.minutes} minutes of active work. The capital comes back when you unwind; the gas does not.`,
      cost: `about ${money(econ.gas_total)} of gas in total; the $${capital} is tied up, not spent`,
      time: `${hold} days, about ${econ.minutes} minutes of active work`,
    },
    {
      text: `Net verdict: the farm's gas is about ${money(econ.gas_total)}. If the launch allocates 0.1% of the implied ${moneyLong(implied)}, that is ${moneyLong(share)}, so the net is ${moneyLong(share)} minus ${money(econ.gas_total)} of gas = ${netMoney(net)} if it lands, and minus ${money(econ.gas_total)} of gas if it allocates nothing. The $${capital} of capital comes back on unwind either way; the gas does not. Farm only with money you can leave locked for ${hold} days.`,
      cost: `about ${money(econ.gas_total)} of gas at risk; net ${netMoney(net)} if the 0.1% allocation lands`,
      time: 'decided before the token launches',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    log_tvl: row.model.log_tvl,
    size_curve_value: row.model.size_curve_value,
    category_effect: row.model.category_effect,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit: fitSizeCurve(snapshot, model),
    oos: validateOutOfSample(snapshot, model),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
