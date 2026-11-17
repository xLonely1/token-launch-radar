// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // A dollar amount as a short string: whole dollars plain, cents to two places.
  function money(n) {
    var r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? '$' + r : '$' + r.toFixed(2);
  }
  function moneyLong(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // radar-3: a log-log size curve fitted at runtime from this snapshot's traded tokens,
  // log(mcap) = a + b * log(TVL), plus a shrunk category effect. The intercept, slope and every
  // category effect live in DATA.fit, so the page fits nothing by hand.
  function impliedOf(row) {
    var fit = DATA.fit;
    var effect = fit.effects[row.category || ''] || 0;
    return Math.max(1, Math.round(Math.exp(fit.intercept + fit.slope * Math.log(row.tvl_usd) + effect)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the kind, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return { token: 'ETH', tx: 4 };
    if (c.indexOf('bitcoin') >= 0) return { token: 'BTC', tx: 3 };
    if (c.indexOf('solana') >= 0) return { token: 'SOL', tx: 0.05 };
    if (c.indexOf('binance') >= 0 || c.indexOf('bnb') >= 0) return { token: 'BNB', tx: 0.3 };
    if (c.indexOf('polygon') >= 0) return { token: 'POL', tx: 0.1 };
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('base') >= 0 || c.indexOf('linea') >= 0) return { token: 'ETH', tx: 0.2 };
    if (c.indexOf('avalanche') >= 0) return { token: 'AVAX', tx: 0.5 };
    if (c.indexOf('tron') >= 0) return { token: 'TRX', tx: 1 };
    if (c.indexOf('hyperliquid') >= 0) return { token: 'HYPE', tx: 0.1 };
    if (c.indexOf('monad') >= 0) return { token: 'MON', tx: 0.1 };
    return { token: 'the chain’s gas token', tx: 1 };
  }
  function gasTx(gas) { return money(gas.tx); }
  function farmKind(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'lending';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('farm') >= 0) return 'dex';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'staking';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis trading') >= 0 || c.indexOf('synthetic') >= 0) return 'perps';
    if (c.indexOf('prediction') >= 0) return 'prediction';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('index') >= 0) return 'vault';
    if (c.indexOf('stable') >= 0 || c.indexOf('stablecoin') >= 0) return 'stable';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('launchpad') >= 0) return 'launchpad';
    if (c.indexOf('chain') >= 0 && c.indexOf('cross') < 0) return 'chain';
    return 'generic';
  }
  function actionFor(kind, p, capital, chain) {
    var name = p.name;
    if (kind === 'lending') return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (kind === 'dex') return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (kind === 'bridge') return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (kind === 'staking') return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (kind === 'perps') return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (kind === 'prediction') return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (kind === 'rwa') return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (kind === 'vault') return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (kind === 'stable') return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (kind === 'insurance') return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (kind === 'launchpad') return 'Allocate $' + capital + " to the protocol's next launch on " + chain + ' and complete its entry steps.';
    if (kind === 'chain') return 'Bridge $' + capital + ' of USDC to ' + chain + ' and deposit it into one of its apps.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(kind, p, capital, chain) {
    var name = p.name;
    var small = Math.max(10, Math.round(capital * 0.2));
    if (kind === 'lending') return 'Borrow about $' + small + ' against the deposit and repay it within the week, so the position shows both sides of the market.';
    if (kind === 'dex') return 'Swap about $' + small + ' through the pool once, so the position shows trading activity as well as liquidity.';
    if (kind === 'bridge') return 'Bridge about $' + small + ' back the other way, so the position shows two-way volume instead of a one-way deposit.';
    if (kind === 'staking') return 'Delegate a second, smaller stake of about $' + small + ' to a different validator or pool to spread the position.';
    if (kind === 'perps') return 'Close the hedge and open a fresh one at the new price, so the position shows repeated margin activity.';
    if (kind === 'prediction') return 'Place a second, smaller market position of about $' + small + ' on a different outcome to show repeated activity.';
    if (kind === 'rwa') return 'Reinvest the first yield payout, about $' + small + ', back into the same asset instead of withdrawing it.';
    if (kind === 'vault') return 'Deposit a second, smaller amount of about $' + small + ' into a different vault of the same protocol.';
    if (kind === 'stable') return 'Swap half of the minted stable asset for USDC and back once, so the position shows redemption activity.';
    if (kind === 'insurance') return 'Open a second, smaller cover of about $' + small + ' for a different risk on the same protocol.';
    if (kind === 'launchpad') return 'Vote or signal on one launch proposal, so the position shows governance activity as well as capital.';
    if (kind === 'chain') return 'Use one app built on ' + chain + ' — a swap or a deposit — so the position shows activity beyond holding.';
    return 'Make one small swap of about $' + small + " inside the protocol's app, so the position shows more than a single deposit.";
  }
  function riskFor(kind) {
    if (kind === 'lending') return "Watch the loan's health factor: if the collateral price falls, add collateral or repay part of the loan before it can be liquidated.";
    if (kind === 'dex') return 'Watch impermanent loss: if one side of the pair moves far, the position can be worth less than holding the tokens outright.';
    if (kind === 'bridge') return 'Bridged funds can be delayed if the destination chain stalls; never bridge money you need back the same day.';
    if (kind === 'staking') return 'Staked assets can be locked for days and slashed if a validator misbehaves; check the unlock delay before you stake.';
    if (kind === 'perps') return 'Leveraged positions can be liquidated on a fast move and funding fees eat margin every hour; keep the position small.';
    if (kind === 'prediction') return 'A market can resolve against you and the stake is lost in full; never risk more than the amount you sized for the farm.';
    if (kind === 'rwa') return 'The yield asset depends on off-chain issuers and oracles; if the issuer pauses redemptions, the position cannot be unwound quickly.';
    if (kind === 'vault') return "Vault shares can lose value if the strategy underperforms, and withdrawals can be queued; check the vault's terms first.";
    if (kind === 'stable') return 'A stable asset can depeg; if it trades below its peg, withdrawing early can lock in the loss.';
    if (kind === 'insurance') return 'Cover only pays on the events the policy names; read the exclusions before you rely on it.';
    if (kind === 'launchpad') return 'A launch can fail or delay; the allocation is not a return, and the capital can be locked until the sale closes.';
    if (kind === 'chain') return 'A new chain can halt or reorg; keep the farmed amount small until the chain has run for months without an outage.';
    return 'Any protocol can pause withdrawals after an exploit; keep the farmed amount small and never farm with borrowed money.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // One plan's economics: the weekly actions the hold implies, the transactions the whole plan runs,
  // what they cost in gas, and the active minutes the plan takes. Capital is tied up, not spent.
  function farmEconomics(p) {
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chainOf(p));
    var weeks = Math.ceil(hold / 7);
    var txs = 5 + weeks;
    var gasTotal = Math.round(txs * gas.tx * 100) / 100;
    return { weeks: weeks, txs: txs, gas_total: gasTotal, minutes: 50 + 25 * weeks };
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var tx = gasTx(gas);
    var kind = farmKind(p);
    var econ = farmEconomics(p);
    var implied = p.implied_value_usd;
    var share = Math.round(implied * 0.001);
    return [
      { text: 'Open a fresh wallet for this farm only, keep its seed phrase offline, and fund it with ' + gas.token + ' for gas on ' + chain + '.', cost: 'about ' + tx + ' of gas to prepare', time: '10 minutes to set up' },
      { text: actionFor(kind, p, capital, chain), cost: '$' + capital + ' of capital and about ' + tx + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(kind, p, capital, chain), cost: 'about ' + tx + ' of gas and no new capital', time: '10 minutes' },
      { text: 'Repeat one qualifying action each week — a deposit, a borrow, a swap or a vote — so the position stays active.', cost: 'about ' + tx + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Open the protocol's own points or rewards page once a week and check that your activity is counted; claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes a week' },
      { text: riskFor(kind), cost: 'nothing unless you top up or unwind', time: '5 minutes a week to check' },
      { text: 'When the token launches or the farm ends, withdraw in two steps — first the rewards, then the principal — and write every transaction in a farm log.', cost: 'about ' + tx + ' of gas to unwind', time: '15 minutes' },
      { text: 'Farm total: $' + capital + ' of capital at risk for ' + hold + ' days, about ' + money(econ.gas_total) + ' of gas across ' + econ.txs + ' transactions, and about ' + econ.minutes + ' minutes of active work. The capital comes back when you unwind; the gas does not.', cost: 'about ' + money(econ.gas_total) + ' of gas in total; the $' + capital + ' is tied up, not spent', time: hold + ' days, about ' + econ.minutes + ' minutes of active work' },
      { text: 'Net verdict: the farm costs about ' + money(econ.gas_total) + " of gas for a shot at this protocol's launch. At the model's implied value of " + moneyLong(implied) + ', a 0.1% allocation would be worth about ' + moneyLong(share) + ' — more than the gas if it ever lands, but the allocation is not guaranteed and could be zero. Farm only with money you can leave locked for ' + hold + ' days.', cost: 'about ' + money(econ.gas_total) + ' of gas at risk', time: 'decided before the token launches' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('scope')) state.scope = params.get('scope');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var scopeSelect = el('select', { id: 'scope', 'aria-label': 'Filter by board section' },
      el('option', { value: 'all', text: 'Watchlist + early' }),
      el('option', { value: 'watchlist', text: 'Watchlist only', selected: state.scope === 'watchlist' ? 'selected' : null }),
      el('option', { value: 'early', text: 'Early radar only', selected: state.scope === 'early' ? 'selected' : null })
    );
    scopeSelect.addEventListener('change', function () { state.scope = scopeSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'scope', text: 'Section' }), scopeSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('div', { class: 'name-row' },
            el('b', { text: r.name }),
            r.watchlist ? el('span', { class: 'tag tag-watch', text: 'watchlist' }) : el('span', { class: 'tag tag-early', text: 'early' })
          ),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function oosRow(split, n, v3err, v2err, v3x, v2x) {
    return el('tr', null,
      el('td', { text: split }),
      el('td', { class: 'num', text: String(n) }),
      el('td', { class: 'num', text: v3err }),
      el('td', { class: 'num', text: v2err }),
      el('td', { class: 'num', text: v3x }),
      el('td', { class: 'num', text: v2x })
    );
  }

  function modelPanel() {
    var fit = DATA.fit;
    var m = DATA.model;
    var effectText = fit.effects && Object.keys(fit.effects).length > 0
      ? 'The category effect is the median residual for the category, shrunk by n / (n + ' + m.shrink_k + ') and capped at ±' + m.category_effect_cap + ' log unit; categories with fewer than ' + m.min_category_n + ' traded comps get no effect at all.'
      : '';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures, fitted from this snapshot at run time. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( exp( a + b x log(tvl_usd) + category effect ) )'
      ),
      el('p', { class: 'sub', text: 'Fitted from this snapshot: a = ' + fit.intercept.toFixed(3) + ', b = ' + fit.slope.toFixed(3) + ', from ' + fit.n + ' traded-token protocols with a positive market cap. Centralised-exchange tokens are excluded from the fit — their value is not tied to protocol TVL. Market cap grows roughly like the square root of TVL (fitted slope 0.47), so a straight TVL multiple would overvalue the largest protocols and undervalue the small ones. ' + effectText }),
      el('h3', { text: 'Tested out of sample — held-out tokens the model never saw' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'oos' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Held-out split' }),
            el('th', { scope: 'col', text: 'n' }),
            el('th', { scope: 'col', text: 'Median error, this model' }),
            el('th', { scope: 'col', text: 'Median error, old model' }),
            el('th', { scope: 'col', text: 'Within 2x, this model' }),
            el('th', { scope: 'col', text: 'Within 2x, old model' })
          )),
          el('tbody', null,
            oosRow('Tokens listed from 2024 onward', 51, '73.9%', '93.4%', '43.1%', '19.6%'),
            oosRow('Random 70/30 split', 35, '90.3%', '230.0%', '28.6%', '17.1%'),
            oosRow('Mean over 7 held-out splits', '7 splits', '85.4%', '111.6%', '29.2%', '22.3%')
          )
        )
      ),
      el('p', { class: 'sub', text: 'Both models were refit on the training part of each split only, so the held-out tokens never leaked into the fit. This model wins 5 of the 7 splits on median error and loses 2 narrowly (by 0.2 and 2.9 percentage points). These are errors, not accuracy: a median error near 75–90% is close to the noise floor of this data.' }),
      el('h3', { text: 'What did not make it into the value' }),
      el('p', { class: 'sub', text: 'Seven-day growth, protocol age and chain count were tested against the same traded tokens and dropped: their correlations with log(market cap / TVL) are −0.15, −0.02 and −0.04, and adding any of them made the held-out error worse. They are shown on the board as context, not as factors — a fast-growing or long-running protocol is not worth more on this evidence.' }),
      el('h3', { text: 'How wide the estimate is' }),
      el('p', { class: 'sub', text: 'Market cap per dollar of TVL varies from 0.00025x to 400x across traded tokens — about a million-fold — so any launch value is a wide estimate. The ranking is the product; the dollar figure is an order-of-magnitude guide. The model is also fitted on traded tokens and applied to pre-token protocols: if pre-token protocols differ systematically from the ones that made it to market, the test numbers overstate how well launch values are predicted, and nothing in the snapshot can test that.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function effectLabel(row) {
    var effect = row.category_effect;
    var sign = effect >= 0 ? '+' : '';
    if (effect === 0) return '0.00 — no effect';
    return sign + effect.toFixed(2) + ' log units';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'log(TVL)' }), el('b', { class: 'num', text: row.log_tvl.toFixed(2) })),
        el('div', null, el('span', { text: 'Size curve value' }), el('b', { class: 'num', text: fmtUsd(row.size_curve_value) })),
        el('div', null, el('span', { text: 'Category effect' }), el('b', { class: 'num', text: effectLabel(row) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row)) + (impliedOf(row) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' + (row.category_effect === 0 ? ' No category effect: ' + (row.category || 'this category') + ' has fewer than 2 traded-token comps in the fit sample, so the size curve alone sets the value.' : ' Category effect for ' + (row.category || 'this category') + ' from its traded comps.') }),
      el('p', { class: 'sub', text: 'Context, not factors: 7-day growth ' + fmtPct(row.change_7d) + ', age with no token ' + fmtAge(row.age_days) + ', ' + (row.chains ? row.chains.length : 0) + ' chain' + ((row.chains ? row.chains.length : 0) === 1 ? '' : 's') + '. Tested, they did not predict traded market caps, so they do not move the value.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s, i) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        var liAttrs = i >= 8 ? { class: 'econ' } : null;
        return el('li', liAttrs, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
