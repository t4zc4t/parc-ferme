// standings for any season after any round, with the points race and the season's leaders
(async function () {
  const { $, el } = PF;
  const COLORS = ['#FF3D8B', '#36E3F0', '#FFB547', '#A493FF', '#5BE38B', '#F2F0FA', '#FF8A5B', '#6FA8FF'];
  let index;
  try {
    [index] = await Promise.all([PF.json('/data/standings/index.json'), PF.loadGrid()]);
  } catch (e) {
    PF.fail($('st-body'), 6, 'The standings could not be loaded right now.');
    return;
  }
  PF.stamp();

  const q = new URLSearchParams(location.search);
  const years = index.years;
  let year = years.includes(+q.get('y')) ? +q.get('y') : years[0];
  let which = q.get('t') === 'teams' ? 'teams' : 'drivers';
  let wantRound = +q.get('r') || null;
  let data, round, picked = null;

  const sel = $('year'), slider = $('round'), teamSel = $('team-filter');
  years.forEach(y => sel.append(el('option', { value: y }, String(y))));
  sel.addEventListener('change', () => load(+sel.value));
  $('prev-year').addEventListener('click', () => load(years[years.indexOf(year) + 1]));
  $('next-year').addEventListener('click', () => load(years[years.indexOf(year) - 1]));
  slider.addEventListener('input', () => { round = +slider.value; picked = null; draw(); });
  teamSel.addEventListener('change', draw);
  document.querySelectorAll('[data-table]').forEach(btn => btn.addEventListener('click', () => {
    which = btn.dataset.table;
    picked = null;
    draw();
  }));
  $('share-slot').replaceWith(PF.shareButton(() => ({
    title: year + ' F1 standings', text: year + ' F1 ' + (which === 'teams' ? 'constructors' : 'drivers') + ' standings after round ' + data.rounds[round - 1].round,
    url: '/standings?' + query() })));

  load(year);

  function query() {
    const p = new URLSearchParams({ y: year });
    if (round !== data.rounds.length) p.set('r', data.rounds[round - 1].round);
    if (which === 'teams') p.set('t', 'teams');
    return p.toString();
  }

  async function load(y) {
    if (!y) return;
    year = y;
    sel.value = y;
    $('prev-year').disabled = years.indexOf(y) === years.length - 1;
    $('next-year').disabled = years.indexOf(y) === 0;
    let d;
    try {
      d = await PF.json('/data/standings/' + y + '.json');
    } catch (e) {
      PF.fail($('st-body'), 6, 'This season could not be loaded right now.');
      return;
    }
    if (y !== year) return;
    data = d;
    const n = data.rounds.length;
    const at = wantRound ? data.rounds.findIndex(r => r.round === wantRound) + 1 : 0;
    wantRound = null;
    round = at || n;
    slider.max = String(n);
    slider.value = String(round);
    slider.disabled = n < 2;
    picked = null;
    if (!data.teams.length) which = 'drivers';
    document.querySelector('[data-table="teams"]').disabled = !data.teams.length;
    const teams = [...new Set(data.drivers.map(x => x.team))].sort();
    teamSel.replaceChildren(el('option', { value: '' }, 'All teams'), ...teams.map(t => el('option', { value: t }, t)));
    draw();
  }

  // order after round r: the official table at the end, points then the earlier order before it
  function table(r) {
    const rows = which === 'teams' ? data.teams : data.drivers;
    if (r === data.rounds.length) return rows.slice();
    return rows.map((x, i) => [x, i]).sort((a, b) => (b[0].pts[r - 1] - a[0].pts[r - 1]) || (a[1] - b[1])).map(p => p[0]);
  }

  function draw() {
    if (!data) return;
    history.replaceState(null, '', '/standings?' + query());
    document.querySelectorAll('[data-table]').forEach(b => { b.classList.toggle('on', b.dataset.table === which); b.setAttribute('aria-pressed', b.dataset.table === which); });
    const n = data.rounds.length, rd = data.rounds[round - 1];
    const last = round === n;
    $('round-label').textContent = 'After round ' + rd.round + ', ' + rd.name + (last ? (data.complete ? ' (final)' : ' (latest)') : '');
    teamSel.hidden = which === 'teams';
    const notes = [];
    if (!data.complete) notes.push(n + ' of ' + data.total + ' rounds run.');
    if (data.dropped) notes.push('Until 1990 only a driver\'s best results counted, so totals here are every point scored and the final table uses the official count.');
    if (which === 'teams' && year < 1979) notes.push('Before 1979 only a team\'s best car scored, so team totals are every point scored.');
    $('st-note').textContent = notes.join(' ');

    const now = table(round), before = round > 1 ? table(round - 1) : null;
    const prevPos = new Map(before ? before.map((x, i) => [x.id, i]) : []);
    const team = which === 'drivers' ? teamSel.value : '';
    const pts = x => last && x.final !== undefined ? x.final : x.pts[round - 1];
    const leader = pts(now[0]);
    if (!picked) picked = now.slice(0, 6).map(x => x.id);
    const color = id => COLORS[picked.indexOf(id) % COLORS.length];

    const head = $('st-head');
    const cols = which === 'teams' ? ['Pos', 'Team', 'Wins', 'Gap', 'Points'] : ['Pos', 'Driver', 'Team', 'Gap', 'Points'];
    head.replaceChildren(...cols.map((c, i) => el('th', { scope: 'col', class: i >= cols.length - 2 ? 'num' + (c === 'Gap' ? ' opt' : '') : (c === 'Team' && which === 'drivers' ? 'opt' : null) }, c)));
    const body = $('st-body');
    body.replaceChildren();
    now.forEach((x, i) => {
      if (team && x.team !== team) return;
      const was = prevPos.get(x.id);
      const moved = was === undefined ? 0 : was - i;
      const on = picked.includes(x.id);
      const pos = last && x.pos ? x.pos : String(i + 1);
      const who = which === 'teams' ? el('span', null, x.name)
        : PF.driverLink(x.id, el('span', { class: 'code' }, x.code), ...PF.name(x.name));
      const tr = el('tr', { class: 'st-row' + (on ? ' picked' : ''), tabindex: '0', 'aria-pressed': on, title: on ? 'Remove from the chart' : 'Add to the chart' },
        el('td', { class: 'pos num-font' }, pos, moved ? el('span', { class: 'delta ' + (moved > 0 ? 'up' : 'down'), title: 'Places since the round before' }, (moved > 0 ? '+' : '') + moved) : null),
        el('td', { class: 'driver' }, on ? el('span', { class: 'swatch', style: 'background:' + color(x.id) }) : el('span', { class: 'swatch off' }), who),
        which === 'teams' ? el('td', { class: 'num-font' }, x.wins) : el('td', { class: 'team opt' }, x.team),
        el('td', { class: 'num num-font opt dim' }, i ? (pts(x) === leader ? 'level' : '-' + fmt(leader - pts(x))) : ''),
        el('td', { class: 'num num-font pts' }, fmt(pts(x))));
      const flip = e => {
        if (e.target.closest('a')) return;
        picked = on ? picked.filter(p => p !== x.id) : [...picked, x.id].slice(-8);
        draw();
      };
      tr.addEventListener('click', flip);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(e); } });
      body.append(tr);
    });
    if (!body.children.length) PF.fail(body, 5, 'Nobody from that team scored this season.');
    chart(color);
    leaders();
  }

  const fmt = v => (v % 1 ? v.toFixed(1) : String(v));

  function chart(color) {
    const rows = (which === 'teams' ? data.teams : data.drivers).filter(x => picked.includes(x.id));
    const n = data.rounds.length;
    const W = 600, H = 340, L = 40, R = 56, T = 14, B = 30;
    const max = Math.max(1, ...rows.map(x => x.pts[n - 1]));
    const X = i => L + (n < 2 ? 0 : i * (W - L - R) / (n - 1));
    const Y = v => T + (H - T - B) * (1 - v / max);
    const ns = 'http://www.w3.org/2000/svg';
    const s = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Points after each round for the picked ' + which });
    const step = niceStep(max);
    for (let v = 0; v <= max; v += step) {
      svg.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid-line' }));
      svg.append(s('text', { x: L - 8, y: Y(v) + 4, class: 'axis', 'text-anchor': 'end' }, String(v)));
    }
    const every = Math.ceil(n / 8);
    data.rounds.forEach((r, i) => {
      if (i % every === 0 || i === n - 1) svg.append(s('text', { x: X(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, 'R' + r.round));
    });
    svg.append(s('line', { x1: X(round - 1), x2: X(round - 1), y1: T, y2: H - B, class: 'now-line' }));
    // labels at the right edge, nudged apart
    const ends = [];
    rows.forEach(x => {
      const d = x.pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
      svg.append(s('path', { d, class: 'st-line', stroke: color(x.id) }));
      svg.append(s('circle', { cx: X(round - 1), cy: Y(x.pts[round - 1]), r: 4, fill: color(x.id) }));
      ends.push({ y: Y(x.pts[n - 1]), text: which === 'teams' ? x.name.split(' ')[0] : x.code, c: color(x.id) });
    });
    ends.sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < 15) e.y = ends[i - 1].y + 15; });
    ends.forEach(e => svg.append(s('text', { x: W - R + 6, y: e.y + 4, class: 'end-label', fill: e.c }, e.text)));
    $('st-chart').replaceChildren(svg);
    $('chart-note').textContent = rows.length
      ? 'Running points, the line marks round ' + data.rounds[round - 1].round + '. Click rows in the table to add or remove.'
      : 'Click rows in the table to draw their points.';
  }

  function niceStep(max) {
    const raw = max / 5, mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  }

  function leaders() {
    const ds = data.drivers;
    const stats = [
      ['Wins', 'wins'], ['Podiums', 'podiums'], ['Poles', 'poles'], ['Fastest laps', 'fastest'],
      ['Points finishes', 'scored'], ['Retirements', 'dnfs'],
    ];
    $('leaders').replaceChildren(...stats.map(([label, key]) => {
      const best = Math.max(...ds.map(x => x[key]));
      if (!best) return null;
      const top = ds.filter(x => x[key] === best);
      return el('div', { class: 'leader' },
        el('span', { class: 'leader-label' }, label),
        el('span', { class: 'leader-val num-font' }, best),
        el('span', { class: 'leader-who' }, top.length > 2 ? top.length + ' drivers' : top.map(x => x.name).join(' and ')));
    }).filter(Boolean));
    $('leaders-note').textContent = data.complete ? 'Across the whole season.' : 'Across the season so far.';
  }
})();
