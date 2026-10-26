// compare two drivers
(async function () {
  const { $, el } = PF;
  let people;
  try {
    people = await PF.json('/data/people.json');
  } catch (e) {
    $('pickers').after(el('p', { class: 'dim' }, 'The driver list could not be loaded right now.'));
    return;
  }
  PF.stamp();

  // accents off so "raikkonen" finds Räikkönen
  const plain = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const byId = new Map();
  people.drivers.forEach(([id, name, code, first, last, races, wins, titles]) =>
    byId.set(id, { id, name, code, titles, key: plain(name) }));
  let grid = [];
  try {
    grid = (await PF.json('/data/drivers.json')).drivers.map(d => d.id).filter(id => byId.has(id));
  } catch (e) { /* the search still works without it */ }

  const cache = new Map();
  const load = id => {
    if (!cache.has(id)) cache.set(id, PF.json('/data/results/' + encodeURIComponent(id) + '.json'));
    return cache.get(id);
  };

  // everything the page shows comes from this, and it all lives in the address
  const q = new URLSearchParams(location.search);
  const num = k => (q.get(k) && /^\d+$/.test(q.get(k)) ? +q.get(k) : null);
  const st = {
    a: byId.has(q.get('a')) ? q.get('a') : null,
    b: byId.has(q.get('b')) ? q.get('b') : null,
    mode: ['same', 'own', 'stage'].includes(q.get('p')) ? q.get('p') : 'same',
    races: ['all', 'shared', 'mates'].includes(q.get('r')) ? q.get('r') : 'all',
    pts: q.get('pts') === 'now' ? 'now' : 'real',
    from: num('from'), to: num('to'),
    afrom: num('af'), ato: num('at'), bfrom: num('bf'), bto: num('bt'),
    sfrom: num('sf'), sto: num('st'),
  };
  // default to this season's top two
  if (!st.a && grid.length) st.a = grid[0];
  if (!st.b && grid.length) st.b = grid.find(id => id !== st.a);

  const inputs = { a: $('pick-a'), b: $('pick-b') };
  const choose = (side, id) => {
    if (!id || id === st[side]) { inputs[side].value = byId.get(st[side]).name; return; }
    st[side] = id;
    // a new driver means new years, so start from their whole careers again
    Object.assign(st, { from: null, to: null, afrom: null, ato: null, bfrom: null, bto: null, sfrom: null, sto: null });
    show();
  };
  ['a', 'b'].forEach(side => combo(side, inputs[side]));

  // a search box with our own dropdown, the browser's datalist can't be styled
  function combo(side, input) {
    const box = el('ul', { class: 'combo combo-' + side, id: 'combo-' + side, role: 'listbox', hidden: '' });
    input.parentNode.append(box);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', box.id);
    input.setAttribute('aria-expanded', 'false');
    let items = [], at = -1;

    const matches = text => {
      const t = plain(text.trim());
      if (!t) return { groups: [['On the grid', grid], ['Most races', people.drivers.slice(0, 40).map(p => p[0]).filter(id => !grid.includes(id))]] };
      const starts = [], inside = [];
      for (const p of people.drivers) {
        const d = byId.get(p[0]);
        if (d.key.startsWith(t) || d.key.includes(' ' + t) || d.code.toLowerCase() === t) starts.push(d.id);
        else if (d.key.includes(t)) inside.push(d.id);
        if (starts.length >= 40) break;
      }
      return { groups: [[null, [...starts, ...inside].slice(0, 40)]], t };
    };

    const mark = (name, t) => {
      if (!t) return [name];
      const i = plain(name).indexOf(t);
      return i < 0 ? [name] : [name.slice(0, i), el('mark', null, name.slice(i, i + t.length)), name.slice(i + t.length)];
    };

    const render = () => {
      const { groups, t } = matches(input.value === (byId.get(st[side]) || {}).name ? '' : input.value);
      items = [];
      box.replaceChildren();
      groups.forEach(([title, ids]) => {
        if (!ids.length) return;
        if (title) box.append(el('li', { class: 'combo-head mono', role: 'presentation' }, title));
        ids.forEach(id => {
          const d = byId.get(id);
          const li = el('li', { class: 'combo-item' + (id === st[side] ? ' current' : ''), role: 'option',
            id: 'opt-' + side + '-' + items.length, 'aria-selected': 'false' },
            el('span', { class: 'combo-code mono' }, d.code),
            el('span', { class: 'combo-name' }, ...mark(d.name, t)),
            d.titles ? el('span', { class: 'combo-crown', title: d.titles + (d.titles === 1 ? ' title' : ' titles') }, '★'.repeat(Math.min(d.titles, 7))) : null);
          li.addEventListener('mousedown', e => { e.preventDefault(); close(); choose(side, id); input.blur(); });
          li.addEventListener('mousemove', () => move(items.indexOf(id)));
          items.push(id);
          box.append(li);
        });
      });
      if (!items.length) box.append(el('li', { class: 'combo-none', role: 'presentation' }, 'No driver by that name'));
      move(t && items.length ? 0 : items.indexOf(st[side]));
    };

    const move = i => {
      at = i;
      box.querySelectorAll('.combo-item').forEach((li, j) => {
        li.classList.toggle('active', j === at);
        li.setAttribute('aria-selected', j === at);
        if (j === at) li.scrollIntoView({ block: 'nearest' });
      });
      if (at >= 0) input.setAttribute('aria-activedescendant', 'opt-' + side + '-' + at);
      else input.removeAttribute('aria-activedescendant');
    };
    const open = () => { render(); box.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };

    input.addEventListener('focus', () => { input.select(); open(); });
    input.addEventListener('click', () => { if (box.hidden) open(); });
    input.addEventListener('input', open);
    input.addEventListener('blur', () => { close(); input.value = byId.get(st[side]) ? byId.get(st[side]).name : ''; });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (box.hidden) open();
        const n = items.length;
        if (n) move(e.key === 'ArrowDown' ? (at + 1) % n : (at - 1 + n) % n);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!box.hidden && at >= 0) { const id = items[at]; close(); input.blur(); choose(side, id); }
      } else if (e.key === 'Escape') {
        close(); input.blur();
      }
    });
  }

  $('pickers').addEventListener('submit', e => e.preventDefault());
  $('swap').addEventListener('click', () => {
    [st.a, st.b] = [st.b, st.a];
    [st.afrom, st.bfrom, st.ato, st.bto] = [st.bfrom, st.afrom, st.bto, st.ato];
    show();
  });

  const segs = { mode: 'data-mode', races: 'data-races', pts: 'data-pts' };
  Object.entries(segs).forEach(([key, attr]) => {
    document.querySelectorAll('[' + attr + ']').forEach(btn => btn.addEventListener('click', () => {
      st[key] = btn.getAttribute(attr);
      show();
    }));
  });

  let A, B;
  show();

  async function show() {
    if (st.a && document.activeElement !== inputs.a) inputs.a.value = byId.get(st.a).name;
    if (st.b && document.activeElement !== inputs.b) inputs.b.value = byId.get(st.b).name;
    if (!st.a || !st.b) return;
    const want = [st.a, st.b];
    try {
      [A, B] = await Promise.all([load(st.a), load(st.b)]);
    } catch (e) {
      $('result').hidden = false;
      $('totals').textContent = 'Their results could not be loaded right now.';
      return;
    }
    if (A.id !== want[0] || B.id !== want[1] || st.a !== want[0] || st.b !== want[1]) return;  // a newer pick came in
    document.title = A.name + ' vs ' + B.name + ' · Parc Fermé';
    $('result').hidden = false;
    Object.entries(segs).forEach(([key, attr]) => document.querySelectorAll('[' + attr + ']').forEach(b => {
      const on = b.getAttribute(attr) === st[key];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    }));
    ranges();
    const [ra, rb] = pickRows();
    url();
    head();
    const sa = stats(A, ra), sb = stats(B, rb);
    summary(ra, rb);
    boards(sa, sb);
    chart(ra, rb);
    against(ra, rb);
  }

  function url() {
    const p = new URLSearchParams({ a: st.a, b: st.b });
    if (st.mode !== 'same') p.set('p', st.mode);
    if (st.races !== 'all') p.set('r', st.races);
    if (st.pts !== 'real') p.set('pts', st.pts);
    const put = (k, v) => { if (v !== null) p.set(k, v); };
    if (st.mode === 'same') { put('from', st.from); put('to', st.to); }
    if (st.mode === 'own') { put('af', st.afrom); put('at', st.ato); put('bf', st.bfrom); put('bt', st.bto); }
    if (st.mode === 'stage') { put('sf', st.sfrom); put('st', st.sto); }
    history.replaceState(null, '', '/compare?' + p.toString());
  }

  const yearsOf = d => d.seasons.map(s => s.year);
  const span = d => [d.seasons[0].year, d.seasons[d.seasons.length - 1].year];

  // the selects for whichever period mode is on
  function ranges() {
    const box = $('range');
    box.replaceChildren();
    const select = (label, opts, value, onPick, cls) => {
      const s = el('select', { 'aria-label': label, class: 'pick-sel' + (cls ? ' ' + cls : '') },
        ...opts.map(([v, t]) => el('option', { value: v, selected: v === value ? '' : null }, t)));
      s.addEventListener('change', () => { onPick(+s.value); show(); });
      return s;
    };
    const yearOpts = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, String(lo + i)]);
    const clamp = (v, lo, hi, dflt) => (v === null || v < lo || v > hi ? dflt : v);

    if (st.mode === 'same') {
      const lo = Math.min(span(A)[0], span(B)[0]), hi = Math.max(span(A)[1], span(B)[1]);
      st.from = clamp(st.from, lo, hi, lo);
      st.to = clamp(st.to, st.from, hi, hi);
      const both = [Math.max(span(A)[0], span(B)[0]), Math.min(span(A)[1], span(B)[1])];
      box.append(
        select('From', yearOpts(lo, hi), st.from, v => { st.from = v; if (st.to < v) st.to = v; }),
        el('span', { class: 'deck-dash' }, 'to'),
        select('To', yearOpts(lo, hi), st.to, v => { st.to = v; if (st.from > v) st.from = v; }),
        quick('Whole careers', st.from === lo && st.to === hi, () => { st.from = lo; st.to = hi; }),
        both[0] <= both[1] ? quick('Years they overlapped', st.from === both[0] && st.to === both[1],
          () => { st.from = both[0]; st.to = both[1]; }) : null);
    } else if (st.mode === 'own') {
      [['a', A], ['b', B]].forEach(([side, d]) => {
        const [lo, hi] = span(d);
        const f = side + 'from', t = side + 'to';
        st[f] = clamp(st[f], lo, hi, lo);
        st[t] = clamp(st[t], st[f], hi, hi);
        box.append(el('span', { class: 'deck-who deck-who-' + side + ' mono' }, d.code),
          select(d.name + ' from', yearOpts(lo, hi), st[f], v => { st[f] = v; if (st[t] < v) st[t] = v; }, 'sel-' + side),
          el('span', { class: 'deck-dash' }, 'to'),
          select(d.name + ' to', yearOpts(lo, hi), st[t], v => { st[t] = v; if (st[f] > v) st[f] = v; }, 'sel-' + side));
      });
    } else {
      const most = Math.max(A.seasons.length, B.seasons.length);
      st.sfrom = clamp(st.sfrom, 1, most, 1);
      st.sto = clamp(st.sto, st.sfrom, most, Math.min(most, Math.max(5, st.sfrom)));
      const opts = Array.from({ length: most }, (_, i) => [i + 1, 'Season ' + (i + 1)]);
      box.append(
        select('From season', opts, st.sfrom, v => { st.sfrom = v; if (st.sto < v) st.sto = v; }),
        el('span', { class: 'deck-dash' }, 'to'),
        select('To season', opts, st.sto, v => { st.sto = v; if (st.sfrom > v) st.sfrom = v; }),
        ...[3, 5, 10].filter(n => n <= most).map(n =>
          quick('First ' + n, st.sfrom === 1 && st.sto === n, () => { st.sfrom = 1; st.sto = n; })));
    }
  }

  function quick(label, on, act) {
    const b = el('button', { type: 'button', class: 'quick' + (on ? ' on' : '') }, label);
    b.addEventListener('click', () => { act(); show(); });
    return b;
  }

  // [year, round, team, grid, quali, finish, order, classified, points, pole]
  const key = r => r[0] + '-' + r[1];

  function pickRows() {
    const inPeriod = (d, side) => {
      if (st.mode === 'same') return d.races.filter(r => r[0] >= st.from && r[0] <= st.to);
      if (st.mode === 'own') return d.races.filter(r => r[0] >= st[side + 'from'] && r[0] <= st[side + 'to']);
      const yrs = yearsOf(d).slice(st.sfrom - 1, st.sto);
      return d.races.filter(r => yrs.includes(r[0]));
    };
    let ra = inPeriod(A, 'a'), rb = inPeriod(B, 'b');
    if (st.races !== 'all') {
      const ma = new Map(ra.map(r => [key(r), r])), mb = new Map(rb.map(r => [key(r), r]));
      const keep = (r, other) => {
        const o = other.get(key(r));
        return o && (st.races === 'shared' || o[2] === r[2]);
      };
      ra = ra.filter(r => keep(r, mb));
      rb = rb.filter(r => keep(r, ma));
    }
    return [ra, rb];
  }

  const NOW = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const nowPts = r => (/^\d+$/.test(r[5]) ? NOW[+r[5] - 1] || 0 : 0);

  function stats(d, rows) {
    const n = rows.length;
    const yrs = [...new Set(rows.map(r => r[0]))];
    const seasons = d.seasons.filter(s => yrs.includes(s.year));
    const fin = rows.filter(r => r[7]);
    const whole = st.races === 'all';
    const points = st.pts === 'now' ? rows.reduce((t, r) => t + nowPts(r), 0)
      : whole ? seasons.reduce((t, s) => t + (s.points || 0), 0)
      : rows.reduce((t, r) => t + r[8], 0);
    const s = {
      seasons: seasons.length,
      races: n,
      titles: seasons.filter(x => x.pos === '1' && x.year < people.season).length,
      wins: rows.filter(r => r[5] === '1').length,
      podiums: rows.filter(r => ['1', '2', '3'].includes(r[5])).length,
      poles: rows.filter(r => r[9]).length,
      points: Math.round(points * 10) / 10,
      best: seasons.reduce((m, x) => (+x.pos && (!m || +x.pos < m) ? +x.pos : m), null),
      front: rows.filter(r => r[3] > 0 && r[3] <= 2).length,
    };
    s.winRate = n ? s.wins / n : null;
    s.podiumRate = n ? s.podiums / n : null;
    s.poleRate = n ? s.poles / n : null;
    s.pointsRate = n ? rows.filter(r => (st.pts === 'now' ? nowPts(r) : r[8]) > 0).length / n : null;
    s.finishRate = n ? fin.length / n : null;
    s.avgFinish = fin.length ? fin.reduce((t, r) => t + r[6], 0) / fin.length : null;
    s.ppr = n ? points / n : null;
    const gained = rows.filter(r => r[7] && r[3] > 0);
    s.gained = gained.length ? gained.reduce((t, r) => t + (r[3] - r[6]), 0) / gained.length : null;
    return s;
  }

  const yearsText = (lo, hi) => (lo === hi ? String(lo) : lo + '–' + hi);
  function summary(ra, rb) {
    const yrs = rows => (rows.length ? yearsText(rows[0][0], rows[rows.length - 1][0]) : 'nothing');
    const races = { all: 'all races', shared: 'only races they both started', mates: 'only races as teammates' }[st.races];
    const pts = st.pts === 'now' ? 'points on today\'s system' : 'points as scored';
    $('deck-sum').textContent = A.name + ', ' + ra.length + ' races ' + yrs(ra) + ', against ' + B.name + ', ' + rb.length + ' races ' + yrs(rb) +
      '. Counting ' + races + ', ' + pts + '.';
    const empty = [ra.length ? null : A.name, rb.length ? null : B.name].filter(Boolean);
    $('deck-sum').classList.toggle('warn', empty.length > 0);
    if (empty.length) {
      $('deck-sum').textContent += '. No races match for ' + empty.join(' or ') +
        (st.races !== 'all' ? ', their periods may not overlap' : '') + ', try a wider period';
    }
  }

  function head() {
    const side = (d, cls) => el('a', { class: 'vs-side ' + cls, href: '/drivers/' + encodeURIComponent(d.id) },
      el('span', { class: 'vs-ghost', 'aria-hidden': 'true' }, d.code),
      el('span', { class: 'vs-code' }, d.code),
      el('span', { class: 'vs-name' }, d.name),
      el('span', { class: 'vs-sub' }, yearsText(...span(d)) + (d.nat ? ', ' + d.nat : '') +
        (d.titles ? ', ' + d.titles + (d.titles === 1 ? ' title' : ' titles') : '')));
    $('vs-head').replaceChildren(side(A, 'vs-a'), el('span', { class: 'vs-x', 'aria-hidden': 'true' }, 'vs'), side(B, 'vs-b'),
      el('div', { class: 'vs-share' }, PF.shareButton(() => ({ title: A.name + ' vs ' + B.name, text: A.name + ' vs ' + B.name + ', head to head', url: location.pathname + location.search }), 'Share this comparison')));
  }

  const pct = v => (v * 100).toFixed(1) + '%';
  const plus = v => (v > 0 ? '+' : '') + v.toFixed(1);
  let score = [0, 0];

  // one line per stat: big numbers out wide, the winner lit up, a split bar under the label
  function board(box, items) {
    box.replaceChildren(...items.map(([label, va, vb, fmt, lowerWins]) => {
      const has = v => v !== null && v !== undefined && !Number.isNaN(v);
      const ok = has(va) && has(vb);
      const show = v => (has(v) ? (fmt ? fmt(v) : v.toLocaleString()) : '–');
      const aWins = ok && va !== vb && (lowerWins ? va < vb : va > vb);
      const bWins = ok && va !== vb && !aWins;
      if (aWins) score[0]++;
      if (bWins) score[1]++;
      // share of the bar: bigger is better unless lower wins, then flip
      let share = 50;
      if (ok && va !== vb) {
        const x = lowerWins ? 1 / Math.max(va, 0.01) : Math.max(va, 0);
        const y = lowerWins ? 1 / Math.max(vb, 0.01) : Math.max(vb, 0);
        share = x + y > 0 ? (100 * x) / (x + y) : 50;
        if (label === 'Places gained') share = va > vb ? 65 : 35;
      }
      return el('div', { class: 'duel' + (aWins ? ' a-wins' : bWins ? ' b-wins' : ' even') },
        el('span', { class: 'duel-v duel-a' }, show(va)),
        el('span', { class: 'duel-mid' },
          el('span', { class: 'duel-label' }, label),
          el('span', { class: 'duel-bar' },
            el('span', { class: 'duel-fa', style: 'width:' + share.toFixed(1) + '%' }),
            el('span', { class: 'duel-fb', style: 'width:' + (100 - share).toFixed(1) + '%' }))),
        el('span', { class: 'duel-v duel-b' }, show(vb)));
    }));
  }

  function boards(sa, sb) {
    score = [0, 0];
    const ptsLabel = st.pts === 'now' ? 'Points (today)' : st.races === 'all' ? 'Points' : 'Race points';
    board($('totals'), [
      ['Seasons', sa.seasons, sb.seasons],
      ['Races', sa.races, sb.races],
      ['Titles', sa.titles, sb.titles],
      ['Wins', sa.wins, sb.wins],
      ['Podiums', sa.podiums, sb.podiums],
      ['Poles', sa.poles, sb.poles],
      [ptsLabel, sa.points, sb.points],
      ['Best title finish', sa.best, sb.best, v => 'P' + v, true],
    ]);
    board($('rates'), [
      ['Win rate', sa.winRate, sb.winRate, pct],
      ['Podium rate', sa.podiumRate, sb.podiumRate, pct],
      ['Pole rate', sa.poleRate, sb.poleRate, pct],
      ['Points per race', sa.ppr, sb.ppr, v => v.toFixed(1)],
      ['Scoring rate', sa.pointsRate, sb.pointsRate, pct],
      ['Finish rate', sa.finishRate, sb.finishRate, pct],
      ['Average finish', sa.avgFinish, sb.avgFinish, v => 'P' + v.toFixed(1), true],
      ['Places gained', sa.gained, sb.gained, plus],
    ]);
    const total = score[0] + score[1] || 1;
    $('tally').replaceChildren(
      el('span', { class: 'tally-n tally-a' }, score[0]),
      el('span', { class: 'tally-mid' },
        el('span', { class: 'tally-label' }, 'Stats won'),
        el('span', { class: 'tally-bar' },
          el('span', { class: 'tally-fa', style: 'width:' + (100 * score[0] / total).toFixed(1) + '%' }),
          el('span', { class: 'tally-fb', style: 'width:' + (100 * score[1] / total).toFixed(1) + '%' }))),
      el('span', { class: 'tally-n tally-b' }, score[1]));
  }

  // championship finish per season, on calendar years or on career season number
  function chart(ra, rb) {
    const box = $('seasons-chart');
    box.textContent = '';
    const stage = st.mode === 'stage';
    const pts = (d, rows) => {
      const yrs = new Set(rows.map(r => r[0]));
      const all = yearsOf(d);
      return d.seasons.filter(s => yrs.has(s.year) && +s.pos)
        .map(s => ({ ...s, x: stage ? all.indexOf(s.year) + 1 : s.year }));
    };
    const pa = pts(A, ra), pb = pts(B, rb);
    if (!pa.length && !pb.length) {
      $('chart-note').textContent = 'Nothing to chart for this selection.';
      return;
    }
    const xs = [...pa, ...pb].map(p => p.x);
    const first = Math.min(...xs), last = Math.max(...xs);
    const width = last - first + 1;
    const worst = Math.min(25, Math.max(10, ...[...pa, ...pb].map(s => +s.pos)));
    const step = 34, padL = 44, padR = 24, padT = 20, padB = 34;
    const w = Math.max(box.clientWidth || 600, padL + padR + (width - 1) * step);
    const h = 300;
    const x = v => padL + (width === 1 ? (w - padL - padR) / 2 : (v - first) * (w - padL - padR) / (width - 1));
    const y = p => padT + (Math.min(p, worst) - 1) * (h - padT - padB) / (worst - 1);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img',
      'aria-label': 'Championship position by season for ' + A.name + ' and ' + B.name });
    [1, 3, 5, 10, 15, 20, 25].filter(p => p <= worst).forEach(p => {
      root.append(svg('line', { x1: padL, x2: w - padR, y1: y(p), y2: y(p), class: 'grid-line' }));
      root.append(svg('text', { x: padL - 12, y: y(p) + 4, class: 'axis', 'text-anchor': 'end' }, 'P' + p));
    });
    const every = width > 40 ? 10 : width > 20 ? 5 : width > 10 ? 2 : 1;
    for (let v = first; v <= last; v++) {
      if ((v - first) % every === 0 || v === last) {
        root.append(svg('text', { x: x(v), y: h - 12, class: 'axis', 'text-anchor': 'middle' }, stage ? 'S' + v : String(v)));
      }
    }
    [[A, pa, 'a'], [B, pb, 'b']].forEach(([d, list, cls]) => {
      let run = [];
      const flush = () => {
        if (run.length > 1) root.append(svg('polyline', { class: 'cline cline-' + cls,
          points: run.map(s => x(s.x) + ',' + y(+s.pos)).join(' ') }));
        run = [];
      };
      list.forEach((s, i) => {
        if (i && s.x !== list[i - 1].x + 1) flush();
        run.push(s);
      });
      flush();
      list.forEach(s => {
        const champ = s.pos === '1' && s.year < people.season;
        const dot = svg('circle', { cx: x(s.x), cy: y(+s.pos), r: champ ? 6 : 4,
          class: 'cdot cdot-' + cls + (champ ? ' cdot-champ' : '') });
        dot.append(svg('title', {}, d.name + ', ' + s.year + ': P' + s.pos + ', ' + s.points + ' pts'));
        root.append(dot);
      });
    });
    box.append(root);
    $('chart-note').replaceChildren(
      el('span', { class: 'key key-a' }), A.name + '   ',
      el('span', { class: 'key key-b' }), B.name + '. Gold dots are titles.' +
        (stage ? ' S1 is each driver\'s first season.' : ''));
  }

  function against(ra, rb) {
    const mine = new Map(ra.map(r => [key(r), r]));
    const shared = rb.filter(r => mine.has(key(r))).map(r => [mine.get(key(r)), r]);
    const mates = shared.filter(([x, y]) => x[2] === y[2]);

    const tally = pairs => {
      const t = { n: pairs.length, ra: 0, rb: 0, qa: 0, qb: 0, pa: 0, pb: 0, both: 0 };
      pairs.forEach(([x, y]) => {
        if (x[6] < y[6]) t.ra++; else if (y[6] < x[6]) t.rb++;
        // qualifying where both have it, otherwise the grid
        const qa = x[4] && y[4] ? x[4] : x[3], qb = x[4] && y[4] ? y[4] : y[3];
        if (qa > 0 && qb > 0) { if (qa < qb) t.qa++; else if (qb < qa) t.qb++; }
        t.pa += st.pts === 'now' ? nowPts(x) : x[8];
        t.pb += st.pts === 'now' ? nowPts(y) : y[8];
        if (['1', '2', '3'].includes(x[5]) && ['1', '2', '3'].includes(y[5])) t.both++;
      });
      t.pa = Math.round(t.pa * 10) / 10; t.pb = Math.round(t.pb * 10) / 10;
      return t;
    };
    const span2 = pairs => {
      const yrs = [...new Set(pairs.map(p => p[0][0]))];
      return yrs.length === 1 ? String(yrs[0]) : yrs[0] + '–' + yrs[yrs.length - 1] +
        (yrs[yrs.length - 1] - yrs[0] + 1 > yrs.length ? ', on and off' : '');
    };
    const keep = score.slice();
    const fill = (boxId, noteId, pairs, empty, intro) => {
      if (!pairs.length) {
        $(noteId).textContent = empty;
        $(boxId).replaceChildren();
        return;
      }
      const t = tally(pairs);
      $(noteId).textContent = intro(t);
      board($(boxId), [
        ['Finished ahead', t.ra, t.rb],
        ['Qualified ahead', t.qa, t.qb],
        [st.pts === 'now' ? 'Points (today)' : 'Race points', t.pa, t.pb],
      ]);
      if (t.both) $(boxId).append(el('p', { class: 'cmp-foot' }, 'Shared the podium ' + t.both + (t.both === 1 ? ' time.' : ' times.')));
    };

    if (shared.length && mates.length === shared.length) {
      $('h2h-note').textContent = 'Every race they started together here was as teammates, so it\'s all in the teammate panel.';
      $('h2h').replaceChildren();
    } else {
      fill('h2h', 'h2h-note', shared, 'They never started the same Grand Prix in this selection.',
        t => t.n + (t.n === 1 ? ' race' : ' races') + ' together, ' + span2(shared) + '. A retirement counts as finishing behind.');
    }
    fill('mates', 'mates-note', mates,
      shared.length ? 'They raced each other but never for the same team here.' : 'Not teammates in this selection.',
      t => {
        const teams = [...new Set(mates.map(p => people.teams[p[0][2]] || p[0][2]))];
        return t.n + (t.n === 1 ? ' race' : ' races') + ' at ' + teams.join(', ') + ', ' + span2(mates) + '.';
      });
    // the stats-won count is for the main boards only
    score = keep;
  }
})();
