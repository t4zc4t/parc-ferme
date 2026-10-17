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

  // search label -> id, with years so two people with one name stay apart
  const byLabel = new Map();
  const byId = new Map();
  const list = $('people');
  people.drivers.forEach(([id, name, code, first, last, races]) => {
    const label = name + ' (' + (first === last ? first : first + '–' + last) + ')';
    byLabel.set(label.toLowerCase(), id);
    byId.set(id, { id, name, code, label, races });
    list.append(el('option', { value: label }));
  });

  const cache = new Map();
  const load = id => {
    if (!cache.has(id)) cache.set(id, PF.json('/data/results/' + encodeURIComponent(id) + '.json'));
    return cache.get(id);
  };

  const params = new URLSearchParams(location.search);
  let a = byId.has(params.get('a')) ? params.get('a') : null;
  let b = byId.has(params.get('b')) ? params.get('b') : null;
  if (!a || !b) {
    // default to this season's top two
    try {
      const grid = (await PF.json('/data/drivers.json')).drivers;
      a = a || grid[0].id;
      b = b || grid.find(d => d.id !== a).id;
    } catch (e) { /* the pickers still work */ }
  }

  const inputs = { a: $('pick-a'), b: $('pick-b') };
  const pick = (side, value) => {
    const id = byLabel.get(value.trim().toLowerCase());
    if (!id) return;
    if (side === 'a') a = id; else b = id;
    show();
  };
  ['a', 'b'].forEach(side => {
    inputs[side].addEventListener('change', e => pick(side, e.target.value));
    inputs[side].addEventListener('input', e => {
      // datalist picks fire input, not always change
      if (byLabel.has(e.target.value.trim().toLowerCase())) pick(side, e.target.value);
    });
    inputs[side].addEventListener('focus', e => e.target.select());
  });
  $('pickers').addEventListener('submit', e => e.preventDefault());
  $('swap').addEventListener('click', () => { [a, b] = [b, a]; show(); });

  show();

  async function show() {
    if (a) inputs.a.value = byId.get(a).label;
    if (b) inputs.b.value = byId.get(b).label;
    if (!a || !b) return;
    history.replaceState(null, '', '/compare?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b));
    let A, B;
    try {
      [A, B] = await Promise.all([load(a), load(b)]);
    } catch (e) {
      $('result').hidden = false;
      $('career').textContent = 'Their results could not be loaded right now.';
      return;
    }
    if (A.id !== a || B.id !== b) return;  // a newer pick came in
    document.title = A.name + ' vs ' + B.name + ' · Parc Fermé';
    $('result').hidden = false;
    head(A, B);
    career(stats(A), stats(B));
    chart(A, B);
    against(A, B);
  }

  // [year, round, team, grid, quali, finish, order, classified, points, pole]
  function stats(d) {
    const r = d.races;
    const n = r.length || 1;
    const fin = r.filter(x => x[7]);
    const best = d.seasons.reduce((m, s) => (+s.pos && (!m || +s.pos < m) ? +s.pos : m), null);
    const s = {
      seasons: d.seasons.length,
      races: r.length,
      wins: r.filter(x => x[5] === '1').length,
      podiums: r.filter(x => ['1', '2', '3'].includes(x[5])).length,
      poles: r.filter(x => x[9]).length,
      titles: d.titles,
      points: Math.round(d.seasons.reduce((t, y) => t + (y.points || 0), 0) * 10) / 10,
      best,
      inPoints: r.filter(x => x[8] > 0).length,
      finished: fin.length,
      avgFinish: fin.length ? fin.reduce((t, x) => t + x[6], 0) / fin.length : null,
    };
    s.winRate = s.wins / n;
    s.podiumRate = s.podiums / n;
    s.poleRate = s.poles / n;
    s.pointsRate = s.inPoints / n;
    s.finishRate = s.finished / n;
    return s;
  }

  function head(A, B) {
    const side = (d, cls) => el('a', { class: 'vs-side ' + cls, href: '/drivers/' + encodeURIComponent(d.id) },
      el('span', { class: 'vs-code mono' }, d.code),
      el('span', { class: 'vs-name' }, d.name),
      el('span', { class: 'vs-sub' }, years(d) + (d.nat ? ' · ' + d.nat : '') +
        (d.titles ? ' · ' + d.titles + (d.titles === 1 ? ' title' : ' titles') : '')));
    $('vs-head').replaceChildren(side(A, 'vs-a'), el('span', { class: 'vs-x', 'aria-hidden': 'true' }, 'VS'), side(B, 'vs-b'));
  }

  const years = d => {
    const f = d.seasons[0].year, l = d.seasons[d.seasons.length - 1].year;
    return f === l ? String(f) : f + '–' + l;
  };
  const pct = v => (v * 100).toFixed(1) + '%';

  // one line per stat, bars grow out from the middle, the better side lights up
  function rows(box, items) {
    box.replaceChildren(...items.map(([label, va, vb, fmt, lowerWins]) => {
      const fa = va === null || va === undefined ? '–' : fmt ? fmt(va) : va;
      const fb = vb === null || vb === undefined ? '–' : fmt ? fmt(vb) : vb;
      const ok = va !== null && vb !== null && va !== undefined && vb !== undefined;
      const aWins = ok && va !== vb && (lowerWins ? va < vb : va > vb);
      const bWins = ok && va !== vb && !aWins;
      let wa = 0, wb = 0;
      if (ok) {
        if (lowerWins) {
          const top = Math.max(va, vb) || 1;
          wa = (top - va + 1) / top; wb = (top - vb + 1) / top;
        } else {
          const top = Math.max(va, vb) || 1;
          wa = va / top; wb = vb / top;
        }
      }
      return el('div', { class: 'cmp-row' },
        el('span', { class: 'cmp-val cmp-va mono' + (aWins ? ' on' : '') }, fa),
        el('span', { class: 'cmp-bar cmp-ba' }, el('span', { style: 'width:' + (wa * 100).toFixed(1) + '%' })),
        el('span', { class: 'cmp-label' }, label),
        el('span', { class: 'cmp-bar cmp-bb' }, el('span', { style: 'width:' + (wb * 100).toFixed(1) + '%' })),
        el('span', { class: 'cmp-val cmp-vb mono' + (bWins ? ' on' : '') }, fb));
    }));
  }

  function career(sa, sb) {
    rows($('career'), [
      ['Seasons', sa.seasons, sb.seasons],
      ['Races', sa.races, sb.races],
      ['Titles', sa.titles, sb.titles],
      ['Wins', sa.wins, sb.wins],
      ['Podiums', sa.podiums, sb.podiums],
      ['Poles', sa.poles, sb.poles],
      ['Points', sa.points, sb.points],
      ['Best title finish', sa.best, sb.best, v => 'P' + v, true],
      ['Win rate', sa.winRate, sb.winRate, pct],
      ['Podium rate', sa.podiumRate, sb.podiumRate, pct],
      ['Pole rate', sa.poleRate, sb.poleRate, pct],
      ['Races in the points', sa.pointsRate, sb.pointsRate, pct],
      ['Races finished', sa.finishRate, sb.finishRate, pct],
      ['Average finish', sa.avgFinish, sb.avgFinish, v => v.toFixed(1), true],
    ]);
  }

  // both careers on one year axis, position 1 at the top
  function chart(A, B) {
    const box = $('seasons-chart');
    box.textContent = '';
    const first = Math.min(A.seasons[0].year, B.seasons[0].year);
    const last = Math.max(A.seasons[A.seasons.length - 1].year, B.seasons[B.seasons.length - 1].year);
    const span = last - first + 1;
    const worst = Math.min(25, Math.max(10, ...[...A.seasons, ...B.seasons].map(s => +s.pos || 0)));
    const step = 34, padL = 44, padR = 20, padT = 20, padB = 34;
    const w = Math.max(box.clientWidth || 600, padL + padR + (span - 1) * step);
    const h = 300;
    const x = yr => padL + (span === 1 ? (w - padL - padR) / 2 : (yr - first) * (w - padL - padR) / (span - 1));
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
    const every = span > 40 ? 10 : span > 20 ? 5 : span > 10 ? 2 : 1;
    for (let yr = first; yr <= last; yr++) {
      if ((yr - first) % every === 0 || yr === last) {
        root.append(svg('text', { x: x(yr), y: h - 12, class: 'axis', 'text-anchor': 'middle' }, String(yr)));
      }
    }
    [[A, 'a'], [B, 'b']].forEach(([d, cls]) => {
      const pts = d.seasons.filter(s => +s.pos);
      // break the line across gap years
      let run = [];
      const flush = () => {
        if (run.length > 1) root.append(svg('polyline', { class: 'cline cline-' + cls,
          points: run.map(s => x(s.year) + ',' + y(+s.pos)).join(' ') }));
        run = [];
      };
      pts.forEach((s, i) => {
        if (i && s.year !== pts[i - 1].year + 1) flush();
        run.push(s);
      });
      flush();
      pts.forEach(s => {
        // the season in progress has a leader, not a champion
        const champ = s.pos === '1' && s.year < people.season;
        const dot = svg('circle', { cx: x(s.year), cy: y(+s.pos), r: champ ? 6 : 4,
          class: 'cdot cdot-' + cls + (champ ? ' cdot-champ' : '') });
        dot.append(svg('title', {}, d.name + ', ' + s.year + ': P' + s.pos + ', ' + s.points + ' pts'));
        root.append(dot);
      });
    });
    box.append(root);
    $('chart-note').replaceChildren(
      el('span', { class: 'key key-a' }), A.name + '   ',
      el('span', { class: 'key key-b' }), B.name + '   ·   gold dots are titles');
  }

  function against(A, B) {
    const mine = new Map(A.races.map(r => [r[0] + '-' + r[1], r]));
    const shared = B.races.filter(r => mine.has(r[0] + '-' + r[1])).map(r => [mine.get(r[0] + '-' + r[1]), r]);
    const mates = shared.filter(([ra, rb]) => ra[2] === rb[2]);

    const tally = pairs => {
      const t = { n: pairs.length, ra: 0, rb: 0, qa: 0, qb: 0, pa: 0, pb: 0, both: 0 };
      pairs.forEach(([ra, rb]) => {
        if (ra[6] < rb[6]) t.ra++; else if (rb[6] < ra[6]) t.rb++;
        // qualifying where both have it, otherwise the grid
        const qa = ra[4] && rb[4] ? ra[4] : ra[3], qb = ra[4] && rb[4] ? rb[4] : rb[3];
        if (qa > 0 && qb > 0) { if (qa < qb) t.qa++; else if (qb < qa) t.qb++; }
        t.pa += ra[8]; t.pb += rb[8];
        if (['1', '2', '3'].includes(ra[5]) && ['1', '2', '3'].includes(rb[5])) t.both++;
      });
      t.pa = Math.round(t.pa * 10) / 10; t.pb = Math.round(t.pb * 10) / 10;
      return t;
    };

    const fill = (box, note, pairs, empty, intro) => {
      if (!pairs.length) {
        $(note).textContent = empty;
        $(box).replaceChildren();
        return;
      }
      const t = tally(pairs);
      const yrs = [...new Set(pairs.map(p => p[0][0]))];
      $(note).textContent = intro(t, yrs);
      rows($(box), [
        ['Finished ahead', t.ra, t.rb],
        ['Qualified ahead', t.qa, t.qb],
        ['Race points', t.pa, t.pb],
      ]);
      if (t.both) $(box).append(el('p', { class: 'cmp-foot' }, 'Shared the podium ' + t.both + (t.both === 1 ? ' time.' : ' times.')));
    };

    const yearsText = yrs => yrs.length === 1 ? String(yrs[0])
      : yrs[0] + '–' + yrs[yrs.length - 1] + (yrs[yrs.length - 1] - yrs[0] + 1 > yrs.length ? ', on and off' : '');

    if (shared.length && mates.length === shared.length) {
      $('h2h-note').textContent = 'Every race they started together was as teammates, so it\'s all in the teammate panel.';
      $('h2h').replaceChildren();
    } else fill('h2h', 'h2h-note', shared,
      'They never started the same Grand Prix.',
      (t, yrs) => t.n + (t.n === 1 ? ' race' : ' races') + ' together, ' + yearsText(yrs) +
        '. A retirement counts as finishing behind.');
    fill('mates', 'mates-note', mates,
      shared.length ? 'They raced each other but never for the same team.' : 'Never teammates.',
      (t, yrs) => {
        const teams = [...new Set(mates.map(p => people.teams[p[0][2]] || p[0][2]))];
        return t.n + (t.n === 1 ? ' race' : ' races') + ' at ' + teams.join(', ') + ', ' + yearsText(yrs) + '.';
      });
  }
})();
