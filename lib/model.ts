// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures, in four factors:
//
//   category  = the median market-cap-to-TVL multiple of the live-token protocols in the same
//               category, computed from this snapshot at run time (categories with fewer than
//               3 live samples fall back to the global median across all live protocols).
//               Clamped to [0.05, 1.50] so one outlier cannot set the price of a whole category.
//   growth    = clamp(change_7d, -60, 120) per cent; growthMult = 1 + (growth / 100) x 0.6
//   maturity  = 0.65 + min(age_days, 730) / 730 x 0.35   (age unknown: 365 days)
//               A protocol that has run two years with no token is as ripe as the model allows.
//   reach     = 1 + 0.02 x min(chains - 1, 4)   (up to +8% for a protocol live on five chains)
//   implied   = max(1, round(tvl_usd x category x growthMult x maturity x reach))
//
// No protocol name is ever special-cased: the same function scores every row, and the category
// multiples are derived from the snapshot itself, never from a hand-written list.

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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  category_min_samples: number;
  category_multiple_floor: number;
  category_multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_step: number;
  reach_max_extra_chains: number;
}

export const MODEL: ModelConstants = {
  category_min_samples: 3,
  category_multiple_floor: 0.05,
  category_multiple_cap: 1.5,
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 730,
  unknown_age_days: 365,
  reach_step: 0.02,
  reach_max_extra_chains: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

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
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
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
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
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

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_multiples: Record<string, number>;
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

/**
 * The category multiples for this snapshot: for every category with at least
 * `model.category_min_samples` live-token protocols, the median of their market-cap-to-TVL
 * ratios; every other category (and a protocol with no category) uses the global median across
 * all live-token protocols. Every multiple is clamped to [floor, cap]. The key
 * '__global__' holds the global median itself.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Record<string, number> {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const clamp = (v: number): number => Math.min(model.category_multiple_cap, Math.max(model.category_multiple_floor, v));
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '__global__';
    const list = byCategory.get(key);
    if (list) list.push(p.mcap_usd! / p.tvl_usd);
    else byCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
  }
  const out: Record<string, number> = { __global__: Math.round(clamp(global) * 1e4) / 1e4 };
  for (const [key, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    out[key] = Math.round(clamp(ratios.length >= model.category_min_samples ? median(ratios) : global) * 1e4) / 1e4;
  }
  return out;
}

/** The five factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: Record<string, number>,
): { implied: number; categoryMult: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const categoryMult = multiples[protocol.category ?? '__global__'] ?? multiples.__global__!;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + model.reach_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra_chains);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMult * growthMult * maturityMult * reachMult));
  return { implied, categoryMult, growthPct, growthMult, maturityMult, reachMult, age };
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
  const multiples = categoryMultiples(snapshot, model);
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
    const v = impliedValue(p, snapshot.as_of, model, multiples);
    return { p, ...v };
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
      category_multiple: round4(s.categoryMult),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
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
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasTx = gas.tx >= 1 ? `$${gas.tx}` : `$${gas.tx}`;
  const kind = farmKind(p);
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
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: riskFor(kind),
      cost: 'nothing unless you top up or unwind',
      time: '5 minutes a week to check',
    },
    {
      text: `When the token launches or the farm ends, withdraw in two steps — first the rewards, then the principal — and write every transaction in a farm log.`,
      cost: `about ${gasTx} of gas to unwind`,
      time: '15 minutes',
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
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
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
    category_multiples: categoryMultiples(snapshot, model),
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
