// one race: lap chart, tyres, pit stops, result
(async function () {
  const { $, el } = PF;
  const m = location.pathname.match(/^\/races\/(\d{4})\/(\d{1,2})\/?$/);
  if (!m) { $('race-name').textContent = 'Race not found'; return; }
  const year = +m[1], round = +m[2];

  // the replay is the biggest file, so it starts loading alongside the race itself
  const wantSprint = new URLSearchParams(location.search).get('replay') === 'sprint';
  const early = year >= 2026 ? PF.json('/data/replay/' + year + '/' + round + (wantSprint ? '-sprint' : '') + '.json') : null;
  if (early) early.catch(() => null);
  let race, season;
  try {
    [race, season] = await Promise.all([
      PF.json('/data/races/' + year + '/' + round + '.json'),
      PF.json('/data/races/' + year + '.json').catch(() => null),
      PF.loadGrid(),
    ]);
  } catch (e) {
    $('race-name').textContent = 'Race not found';
    $('race-where').textContent = 'There is no result for this race in the records.';
    return;
  }
  PF.stamp();

  $('race-kicker').textContent = year + ', round ' + race.round + ' of ' + race.rounds +
    (race.provisional ? '. Provisional result from live timing, the official one follows' : '');
  $('race-name').textContent = race.name;
  const c = race.circuit;
  const when = race.date ? new Date(race.date + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  $('race-where').replaceChildren(c.id ? el('a', { class: 'text-link', href: '/circuits/' + c.id }, c.name) : c.name,
    ', ' + c.locality + ', ' + c.country + (when ? ', ' + when : ''));
  $('race-season').href = '/races?y=' + year;
  if (season) {
    const done = season.rounds.filter(r => r.winner);
    const i = done.findIndex(r => r.round === round);
    if (i < 0) done.length = 0;
    [[done[i - 1], 'race-prev'], [done[i + 1], 'race-next']].forEach(([r, id]) => {
      if (!r) return;
      $(id).hidden = false;
      $(id).href = '/races/' + year + '/' + r.round;
      $(id).querySelector('span').textContent = r.name.replace(' Grand Prix', ' GP');
    });
  }
  $('race-nav').append(PF.shareButton(() => ({ title: year + ' ' + race.name, text: year + ' ' + race.name + ', results and race replay', url: '/races/' + year + '/' + round })));
  $('race-body').hidden = false;
  $('static-summary')?.remove();

  const res = race.results;
  const byId = new Map(res.map(r => [r.id, r]));
  const laps = race.drivers || null;

  if (res.length) facts(); else $('race-facts').hidden = true;
  results();
  const chart = laps && res.length ? lapChart() : null;
  if (laps && res.length) story();
  if (!res.length) {
    // a sprint or qualifying weekend in progress, the race itself still to come
    $('no-laps').hidden = false;
    $('no-laps').querySelector('.panel-title').textContent = 'The race';
    $('no-laps-note').textContent = 'The Grand Prix hasn\'t run yet. Its result, lap chart and replay show up here a few hours after the flag.';
  } else if (!laps) {
    $('no-laps').hidden = false;
    // from 1996 on a missing chart just means the laps haven't come in yet
    if (year >= 1996) $('no-laps-note').textContent = 'The lap-by-lap data for this race hasn\'t come in yet. It usually lands within a few hours of the chequered flag, so check back soon.';
  }
  // the replay shows tyres live in its timing tower
  if (race.stints && Object.keys(race.stints).length && !race.replay) tyres();
  // the grand prix replay, or the sprint's when asked for or when the race is still to come
  const sprintOnly = race.sprintReplay && !race.replay;
  const useSprint = race.sprintReplay && (wantSprint || sprintOnly);
  if ((race.replay || race.sprintReplay) && PF.replay) {
    $('replay-panel').hidden = false;
    $('replay-panel').classList.add('is-loading');
    if (race.replay && race.sprintReplay) {
      $('replay-which').hidden = false;
      $('replay-which').querySelectorAll('a').forEach(a => {
        const on = (a.dataset.which === 'sprint') === useSprint;
        a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'true');
      });
    }
    if (useSprint) {
      $('replay-title').textContent = 'Sprint replay';
      const rows = race.sprint || [];
      const sprintRace = { ...race, results: rows, periods: [], stints: {}, drivers: null, findings: [], name: race.name };
      PF.replay(sprintRace, { year, round, byId: new Map(rows.map(r => [r.id, r])), chart: null, sprint: true,
        early: wantSprint ? early : null });
    } else {
      PF.replay(race, { year, round, byId, chart, early: wantSprint ? null : early });
    }
  }
  if (race.pits && race.pits.length) pits();
  if (race.practice && Object.keys(race.practice).length) practice();

  function fmtLap(ms) {
    if (!ms) return '–';
    const mm = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
    return mm + ':' + s.toFixed(3).padStart(6, '0');
  }



  function facts() {
    const win = res[0];
    const fast = res.find(r => r.fl === '1');
    const items = [['Laps', win.laps]];
    if (race.pits) items.push(['Pit stops', race.pits.length]);
    if (race.periods) {
      const n = k => race.periods.filter(p => p[0] === k).length;
      const parts = [['SC', n('SC')], ['VSC', n('VSC')], ['RED', n('RED')]].filter(p => p[1]);
      items.push(['Neutralised', parts.length ? parts.map(p => p[1] + ' ' + p[0]).join(', ') : 'none']);
    }
    if (race.weather && race.weather.air) {
      const w = race.weather;
      items.push(['Weather', Math.round(w.air[1]) + '° air, ' + Math.round(w.track[1]) + '° track' + (w.rain ? ', rain' : ', dry')]);
    }
    if (fast) items.push(['Fastest lap', fast.code]);
    $('race-facts').replaceChildren(...items.map(([k, v]) =>
      el('div', { class: 'fact' }, el('span', { class: 'fact-k' }, k), el('span', { class: 'fact-v' }, v))));
  }

  // race, sprint and qualifying, whichever have run
  function results() {
    // the grid: from the race result once it's run, from qualifying before that
    const ran = res.filter(r => r.grid > 0).sort((a, b) => a.grid - b.grid).map(r => ({ ...r, slot: r.grid }))
      .concat(res.filter(r => r.grid === 0).map(r => ({ ...r, slot: 'PIT' })));
    const fromQuali = !ran.length && (race.quali || []).length;
    const grid = ran.length ? ran : (race.quali || []).filter(q => q.pos).map(q => ({ ...q, slot: q.pos }));
    const kinds = [['race', 'Race', res, race.provisional], ['sprint', 'Sprint', race.sprint || [], race.sprintProvisional],
      ['quali', 'Qualifying', race.quali || [], race.qualiProvisional], ['grid', 'Grid', grid, fromQuali]].filter(k => k[2].length);
    const seg = $('result-seg');
    seg.hidden = kinds.length < 2;
    const show = key => {
      const [, label, rows, prov] = kinds.find(k => k[0] === key);
      seg.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.kind === key); b.setAttribute('aria-pressed', b.dataset.kind === key); });
      $('result-note').hidden = !prov;
      $('result-note').textContent = key === 'grid' ? 'Lined up in qualifying order. Grid penalties and pit lane starts are only applied in the official grid, so places can still change.'
        : prov ? label + ' result from live timing, the official one follows.' : '';
      $('grid-view').hidden = key !== 'grid';
      $('results-body').closest('.table-box').hidden = key === 'grid';
      if (key === 'grid') gridView(rows); else if (key === 'quali') qualiTable(rows); else resultTable(rows);
    };
    seg.replaceChildren(...kinds.map(([key, label]) => {
      const b = el('button', { type: 'button', class: 'seg-btn', 'data-kind': key, 'aria-pressed': 'false' }, label);
      b.addEventListener('click', () => show(key));
      return b;
    }));
    if (kinds.length) show(kinds[0][0]);
  }

  // two by two, pole on the left, every other slot set back half a row
  function gridView(rows) {
    $('grid-view').replaceChildren(...rows.map(r => el('li', { class: 'sgrid-slot' + (typeof r.slot === 'number' && r.slot % 2 === 0 ? ' even' : '') + (r.slot === 'PIT' ? ' pit' : '') },
      el('span', { class: 'sgrid-pos mono' }, r.slot === 'PIT' ? 'PIT' : 'P' + r.slot),
      el('span', { class: 'sgrid-who' }, PF.driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.name))),
      el('span', { class: 'sgrid-team' }, r.team))));
  }

  // lead changes, neutralisations, retirements and the flag, in lap order
  function story() {
    const ids = Object.keys(laps).filter(id => byId.has(id));
    const total = Math.max(...ids.map(id => laps[id].length));
    const who = id => byId.get(id) ? byId.get(id).name : id;
    const pitted = new Set((race.pits || []).map(p => p[0] + ':' + p[1]));
    const items = [];
    const at = (id, n) => laps[id][n - 1] ? laps[id][n - 1][0] : null;
    const leaderOn = n => ids.find(id => at(id, n) === 1);
    // lap one: who leads and who made up the most places from the grid
    const first = leaderOn(1);
    if (first) {
      const pole = res.find(r => r.grid === 1);
      let gain = null;
      ids.forEach(id => { const r = byId.get(id); if (r.grid > 0 && at(id, 1)) { const g = r.grid - at(id, 1); if (g > 0 && (!gain || g > gain[1])) gain = [id, g]; } });
      items.push([1, 'start', who(first) + (pole && pole.id === first ? ' keeps the lead from pole.' : ' leads after lap one' + (pole ? ', from P' + byId.get(first).grid + ' on the grid.' : '.')) +
        (gain && gain[1] >= 3 ? ' ' + who(gain[0]) + ' gains ' + gain[1] + ' places on the opening lap.' : '')]);
    }
    let holder = first;
    for (let n = 2; n <= total; n++) {
      const now = leaderOn(n);
      if (!now || now === holder) continue;
      const why = holder && pitted.has(holder + ':' + n) ? ' as ' + who(holder) + ' pits' : holder ? ', passing ' + who(holder) : '';
      items.push([n, 'lead', who(now) + ' takes the lead' + why + '.']);
      holder = now;
    }
    const names = { SC: 'Safety car', VSC: 'Virtual safety car', RED: 'Red flag' };
    (race.periods || []).forEach(([k, a, b]) => items.push([a, 'flag-' + k.toLowerCase(), (names[k] || k) + (b > a ? ', laps ' + a + ' to ' + b + '.' : ' on lap ' + a + '.')]));
    res.filter(r => !/^\d+$/.test(r.pos) || (r.status && !/^(Finished|Lapped|\+\d+ Laps?)$/.test(r.status) && r.laps < res[0].laps - 3))
      .filter(r => r.laps < res[0].laps)
      .forEach(r => items.push([Math.max(1, r.laps), 'out', who(r.id) + (r.laps === 0 ? (r.pos === 'W' || /start/i.test(r.status || '') ? ' does not start' : ' is out on the first lap')
        : ' is out after ' + r.laps + (r.laps === 1 ? ' lap' : ' laps')) + (r.status && !/^(Retired|Did not start)$/i.test(r.status) ? ' (' + r.status.toLowerCase() + ').' : '.')]));
    items.push([res[0].laps, 'win', who(res[0].id) + ' wins' + (res[1] && /^\+\d+\.\d+$/.test(res[1].time || '') ? ' by ' + res[1].time.slice(1) + 's.' : '.')]);
    items.sort((a, b) => a[0] - b[0] || (a[1] === 'win') - (b[1] === 'win'));
    $('story').replaceChildren(...items.map(([n, kind, text]) => el('li', { class: 'story-' + kind.split('-')[0] + (kind.startsWith('flag-') ? ' ' + kind : '') },
      el('span', { class: 'story-lap mono' }, 'Lap ' + n), el('span', null, text))));
    $('story-panel').hidden = false;
  }

  function head(cols) {
    $('results-head').replaceChildren(...cols.map(([text, cls]) => el('th', { scope: 'col', class: cls || null }, text)));
  }

  function qualiTable(rows) {
    head([['Pos'], ['Driver'], ['Team', 'opt'], ['Q1'], ['Q2', 'opt'], ['Q3']]);
    $('results-body').replaceChildren(...rows.map((r, i) => el('tr', { class: i < 3 ? 'top3' : null },
      el('td', { class: 'pos mono' }, r.pos ? PF.pad2(r.pos) : '–'),
      el('td', { class: 'driver' }, PF.driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.name))),
      el('td', { class: 'team opt' }, r.team),
      el('td', { class: 'mono dim' }, r.q1 || '–'),
      el('td', { class: 'mono dim opt' }, r.q2 || '–'),
      el('td', { class: 'mono' }, r.q3 || '–'))));
  }

  function resultTable(res) {
    head([['Pos'], ['Driver'], ['Team', 'opt'], ['Grid'], ['Laps', 'opt'], ['Time or status'], ['Pts', 'num']]);
    $('results-body').replaceChildren(...res.map((r, i) => {
      const moved = /^\d+$/.test(r.pos) && r.grid > 0 ? r.grid - +r.pos : null;
      const delta = moved ? el('span', { class: 'delta ' + (moved > 0 ? 'up' : 'down') }, (moved > 0 ? '+' : '') + moved) : null;
      const down = res[0].laps - r.laps;
      // a lapped finisher's time is not a gap, show the laps down instead
      const lapped = down > 0 && (r.status === 'Lapped' || /^\+\d/.test(r.status || ''));
      const gap = lapped ? '+' + down + (down === 1 ? ' lap' : ' laps') : (r.time || r.status);
      return el('tr', { class: i < 3 && /^\d+$/.test(r.pos) ? 'top3' : null },
        el('td', { class: 'pos mono' }, /^\d+$/.test(r.pos) ? PF.pad2(r.pos) : r.pos),
        el('td', { class: 'driver' }, PF.driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.name)),
          r.fl === '1' ? el('span', { class: 'fl-tag mono', title: 'Fastest lap' }, 'FL') : null),
        el('td', { class: 'team opt' }, r.team),
        el('td', { class: 'mono nowrap' }, r.grid === 0 ? 'PIT' : r.grid, delta ? ' ' : null, delta),
        el('td', { class: 'mono opt' }, r.laps),
        el('td', { class: 'mono dim' }, gap),
        el('td', { class: 'num mono pts' }, r.points));
    }));
  }

  // ---- lap chart ----
  function lapChart() {
    $('lap-panel').hidden = false;
    const COLORS = ['#EE3F7E', '#22A7B5', '#C68616'];   // validated as a set on the panel colour
    const order = res.map(r => r.id).filter(id => laps[id]);
    const total = Math.max(...order.map(id => laps[id].length));
    let view = 'pos';
    // set by the replay: where the race is now, what a click on the chart does
    let cursor = null, seek = null;
    // slot per picked driver, so a colour stays with its driver
    let slots = order.slice(0, 3);

    const cum = {};
    order.forEach(id => {
      let t = 0, ok = true;
      cum[id] = laps[id].map(([, ms]) => { if (!ms) ok = false; t += ms || 0; return ok ? t : null; });
    });
    const leader = [];
    for (let n = 0; n < total; n++) {
      const v = order.map(id => cum[id][n]).filter(x => x != null);
      leader[n] = v.length ? Math.min(...v) : null;
    }

    const value = (id, n) => {
      const row = laps[id][n - 1];
      if (view === 'pos') {
        if (n === 0) { const g = byId.get(id).grid; return g > 0 ? g : null; }
        return row ? row[0] : null;
      }
      if (n === 0 || !row) return null;
      if (view === 'gap') return cum[id][n - 1] != null && leader[n - 1] != null ? (cum[id][n - 1] - leader[n - 1]) / 1000 : null;
      return row[1] ? row[1] / 1000 : null;
    };

    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      view = b.dataset.view;
      document.querySelectorAll('[data-view]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      draw();
    }));

    function chips() {
      $('pick-row').replaceChildren(...order.map(id => {
        const s = slots.indexOf(id);
        const b = el('button', { type: 'button', class: 'pick-chip mono' + (s >= 0 ? ' on' : ''), 'aria-pressed': s >= 0,
          title: byId.get(id).name, style: s >= 0 ? '--c:' + COLORS[s] : null },
          el('span', { class: 'pick-dot' }), byId.get(id).code);
        b.addEventListener('click', () => {
          const at = slots.indexOf(id);
          if (at >= 0) slots[at] = null;
          else {
            const free = slots.indexOf(null);
            if (free >= 0) slots[free] = id;
            else if (slots.length < 3) slots.push(id);
            else { slots.shift(); slots.push(id); }
          }
          draw();
        });
        return b;
      }));
    }

    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };

    const NOTES = {
      pos: 'Pick up to three drivers to follow. Rings are pit stops, shaded laps were under a safety car or red flag.',
      gap: 'Seconds behind the leader at the end of each lap. The dips are pit stops.',
      time: 'Every lap\'s time, faster is higher. Pit and safety car laps run off the bottom.',
    };

    function draw() {
      $('lap-note').textContent = NOTES[view];
      chips();
      const picked = slots.filter(Boolean);
      const box = $('lap-chart');
      box.textContent = '';
      // phones scroll sideways rather than squash a long race
      const w = Math.max(box.clientWidth || 700, total * 7 + 102), h = view === 'pos' ? Math.max(360, order.length * 19 + 50) : 360;
      const padL = 46, padR = 56, padT = 18, padB = 32;
      const x = n => padL + n * (w - padL - padR) / total;
      const shown = view === 'pos' ? order : picked;

      let lo, hi;
      if (view === 'pos') { lo = 1; hi = Math.max(order.length, ...order.map(id => byId.get(id).grid || 0)); }
      else {
        const vals = [];
        picked.forEach(id => { for (let n = 1; n <= total; n++) { const v = value(id, n); if (v != null) vals.push(v); } });
        if (!vals.length) { box.append(el('p', { class: 'dim' }, 'Pick a driver to see this view.')); return; }
        if (view === 'gap') { lo = 0; hi = Math.max(5, ...vals); }
        else {
          // in and out laps and safety car laps would flatten everything else
          const best = Math.min(...vals);
          lo = best - 0.5; hi = Math.min(Math.max(...vals), best * 1.12);
        }
      }
      const y = v => padT + (Math.min(Math.max(v, lo), hi) - lo) * (h - padT - padB) / ((hi - lo) || 1);
      const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img',
        'aria-label': { pos: 'Positions', gap: 'Gap to the leader', time: 'Lap times' }[view] + ' by lap' });

      // neutralised laps first, behind everything
      (race.periods || []).forEach(([k, a, b]) => {
        root.append(svg('rect', { x: x(a - 1), y: padT, width: Math.max(2, x(b) - x(a - 1)), height: h - padT - padB, class: 'band band-' + k.toLowerCase() }));
        root.append(svg('text', { x: x(a - 1) + 3, y: padT + 11, class: 'band-label' }, k));
      });

      // grid
      const ticks = view === 'pos' ? [1, 5, 10, 15, 20, 25].filter(t => t <= hi)
        : niceTicks(lo, hi, 5);
      ticks.forEach(t => {
        root.append(svg('line', { x1: padL, x2: w - padR, y1: y(t), y2: y(t), class: 'grid-line' }));
        root.append(svg('text', { x: padL - 10, y: y(t) + 4, class: 'axis', 'text-anchor': 'end' },
          view === 'pos' ? 'P' + t : view === 'gap' ? '+' + Math.round(t) + 's' : fmtLap(t * 1000).replace(/\.\d+$/, '')));
      });
      const every = total > 60 ? 10 : 5;
      for (let n = view === 'pos' ? 0 : every; n <= total; n += every) root.append(svg('text', { x: x(n), y: h - 10, class: 'axis', 'text-anchor': 'middle' }, n === 0 ? 'GRID' : String(n)));

      // lines: everyone faint, picked on top
      const line = (id, cls, color) => {
        let d = '', pen = false;
        for (let n = view === 'pos' ? 0 : 1; n <= total; n++) {
          const v = value(id, n);
          if (v == null) { pen = false; continue; }
          d += (pen ? 'L' : 'M') + x(n).toFixed(1) + ',' + y(v).toFixed(1);
          pen = true;
        }
        if (d) root.append(svg('path', color ? { d, class: cls, stroke: color } : { d, class: cls }));
      };
      shown.filter(id => !picked.includes(id)).forEach(id => line(id, 'lap-line lap-dim'));
      const ends = [];
      picked.forEach(id => {
        const color = COLORS[slots.indexOf(id)];
        line(id, 'lap-line lap-pick', color);
        if (view === 'pos') {
          (race.pits || []).filter(p => p[0] === id).forEach(p => {
            const v = value(id, p[1]);
            if (v != null) root.append(svg('circle', { cx: x(p[1]), cy: y(v), r: 4.5, class: 'pit-dot', stroke: color }));
          });
        }
        let last = laps[id].length;
        while (last > 0 && value(id, last) == null) last--;
        if (last) ends.push({ id, color, x: x(last), y: y(value(id, last)) });
      });
      // end labels, nudged apart so they never sit on top of each other
      ends.sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 13) e.y = arr[i - 1].y + 13; });
      ends.forEach(e => root.append(svg('text', { x: e.x + 6, y: e.y + 4, class: 'end-label' }, byId.get(e.id).code)));

      const hl = svg('path', { class: 'lap-line lap-hover', d: '' });
      root.append(hl);
      if (cursor != null) {
        const cx = x(Math.min(total, Math.max(0, cursor)));
        root.append(svg('line', { x1: cx, x2: cx, y1: padT - 6, y2: h - padB, class: 'playhead' }));
      }
      const hair = svg('line', { y1: padT, y2: h - padB, class: 'hair', visibility: 'hidden' });
      root.append(hair);
      const hit = svg('rect', { x: padL, y: padT, width: w - padL - padR, height: h - padT - padB, class: 'hit' });
      root.append(hit);
      box.append(root);

      const tip = $('lap-tip');
      let hovered = null;
      const move = ev => {
        const r = root.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (w / r.width);
        const n = Math.max(view === 'pos' ? 0 : 1, Math.min(total, Math.round((px - padL) / ((w - padL - padR) / total))));
        hair.setAttribute('x1', x(n)); hair.setAttribute('x2', x(n)); hair.setAttribute('visibility', 'visible');
        // the line under the pointer, positions view only
        hovered = null;
        if (view === 'pos') {
          const py = (ev.clientY - r.top) * (h / r.height);
          const want = lo + (py - padT) * (hi - lo) / (h - padT - padB);
          let best = 0.6;
          order.forEach(id => { const v = value(id, n); if (v != null && Math.abs(v - want) < best) { best = Math.abs(v - want); hovered = id; } });
        }
        let d = '';
        if (hovered && !picked.includes(hovered)) {
          let pen = false;
          for (let k = 0; k <= total; k++) { const v = value(hovered, k); if (v == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + x(k).toFixed(1) + ',' + y(v).toFixed(1); pen = true; }
        }
        hl.setAttribute('d', d);
        hit.style.cursor = seek || hovered ? 'pointer' : '';
        const period = (race.periods || []).find(([, a, b]) => n >= a && n <= b);
        const rows = picked.map(id => {
          const v = value(id, n);
          const txt = v == null ? '–' : view === 'pos' ? 'P' + v : view === 'gap' ? (v < 0.001 ? 'leader' : '+' + v.toFixed(1) + 's') : fmtLap(Math.round(v * 1000));
          const pit = (race.pits || []).some(p => p[0] === id && p[1] === n);
          return el('div', { class: 'tip-row' }, el('span', { class: 'tip-dot', style: 'background:' + COLORS[slots.indexOf(id)] }),
            el('span', { class: 'mono' }, byId.get(id).code), el('span', { class: 'mono tip-v' }, txt + (pit ? ', in the pits' : '')));
        });
        const over = hovered && !picked.includes(hovered) ? el('div', { class: 'tip-row' }, el('span', { class: 'tip-dot tip-dot-hover' }),
          el('span', { class: 'mono' }, byId.get(hovered).code), el('span', { class: 'mono tip-v' }, 'P' + value(hovered, n))) : null;
        tip.replaceChildren(el('div', { class: 'tip-head mono' }, n === 0 ? 'Grid' : 'Lap ' + n + (period ? ', ' + period[0] : '')), over, ...rows,
          seek ? el('div', { class: 'tip-hint' }, 'Click to jump the replay here') : hovered && !picked.includes(hovered) ? el('div', { class: 'tip-hint' }, 'Click to follow ' + byId.get(hovered).code) : null);
        tip.hidden = false;
        const pr = $('lap-panel').getBoundingClientRect();
        const left = ev.clientX - pr.left + 16;
        tip.style.left = Math.min(left, pr.width - 190) + 'px';
        tip.style.top = (ev.clientY - pr.top + 12) + 'px';
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; hair.setAttribute('visibility', 'hidden'); hl.setAttribute('d', ''); });
      hit.addEventListener('click', ev => {
        const r = root.getBoundingClientRect();
        const n = Math.max(0, Math.min(total, Math.round(((ev.clientX - r.left) * (w / r.width) - padL) / ((w - padL - padR) / total))));
        if (seek) seek(n);
        else if (hovered) follow(hovered);
      });
    }

    function follow(id) {
      if (!slots.includes(id)) { slots.unshift(id); slots = slots.filter(Boolean).slice(0, 3); }
      draw();
    }

    function niceTicks(a, b, n) {
      const step = Math.pow(10, Math.floor(Math.log10((b - a) / n || 1)));
      const err = (b - a) / n / step;
      const s = step * (err >= 5 ? 10 : err >= 2 ? 5 : err >= 1 ? 2 : 1);
      const out = [];
      for (let t = Math.ceil(a / s) * s; t <= b + 1e-9; t += s) out.push(+t.toFixed(3));
      return out;
    }

    draw();
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });
    return {
      total,
      // laps done as a fraction, the line moves with the replay
      cursor(v) { if (cursor === null || Math.abs(v - cursor) >= 0.2 || v === 0) { cursor = v; draw(); } },
      onSeek(fn) { seek = fn; },
      follow,
    };
  }

  // ---- tyres ----
  function tyres() {
    $('tyre-panel').hidden = false;
    const TYRE = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };
    const total = res[0].laps;
    const used = new Set();
    $('tyres').replaceChildren(...res.filter(r => race.stints[r.id]).map(r => {
      const bar = el('div', { class: 'tyre-bar' }, ...race.stints[r.id].map(([a, b, comp, age], i) => {
        used.add(comp);
        const label = comp.charAt(0) + comp.slice(1).toLowerCase();
        return el('span', { class: 'stint tyre-' + comp.toLowerCase(),
          style: 'left:' + (100 * (a - 1) / total).toFixed(2) + '%;width:' + (100 * (b - a + 1) / total).toFixed(2) + '%',
          title: 'Stint ' + (i + 1) + ', ' + label + ', laps ' + a + '–' + b + (age ? ', ' + age + ' laps old at the start' : ', new') },
          b - a >= 3 ? (TYRE[comp] || '?') : '');
      }));
      return el('div', { class: 'tyre-row' }, el('span', { class: 'tyre-who mono' }, r.code), bar);
    }));
    const KEY = { SOFT: 'Soft', MEDIUM: 'Medium', HARD: 'Hard', INTERMEDIATE: 'Intermediate', WET: 'Wet', UNKNOWN: 'Not recorded' };
    $('tyre-key').replaceChildren(...Object.keys(KEY).filter(k => used.has(k)).map(k =>
      el('span', { class: 'key-item' }, el('span', { class: 'stint-key tyre-' + k.toLowerCase() }, TYRE[k] || '?'), KEY[k])));
  }

  // ---- practice ----
  function practice() {
    const NAMES = { FP1: 'Practice 1', FP2: 'Practice 2', FP3: 'Practice 3', SQ: 'Sprint qualifying' };
    const kinds = Object.keys(NAMES).filter(k => race.practice[k]);
    $('practice-panel').hidden = false;
    const gap = v => v === null || v === undefined ? '–' : typeof v === 'number' ? (v ? '+' + v.toFixed(3) : '–') : v;
    const show = kind => {
      $('practice-seg').querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', b.dataset.kind === kind);
        b.setAttribute('aria-pressed', b.dataset.kind === kind);
      });
      $('practice-body').replaceChildren(...race.practice[kind].map((r, i) => {
        const who = [el('span', { class: 'code mono' }, r.code), ...PF.name(r.name)];
        return el('tr', { class: i < 3 && r.pos ? 'top3' : null },
          el('td', { class: 'pos mono' }, r.pos ? PF.pad2(r.pos) : '–'),
          el('td', { class: 'driver' }, r.id ? PF.driverLink(r.id, ...who) : el('span', null, ...who)),
          el('td', { class: 'team opt' }, r.team),
          el('td', { class: 'mono' }, r.best ? fmtLap(Math.round(r.best * 1000)) : 'No time'),
          el('td', { class: 'mono dim' }, i ? gap(r.gap) : '–'),
          el('td', { class: 'num mono' }, r.laps ?? '–'));
      }));
    };
    $('practice-seg').replaceChildren(...kinds.map(k => {
      const b = el('button', { type: 'button', class: 'seg-btn', 'aria-pressed': 'false', 'data-kind': k }, NAMES[k]);
      b.addEventListener('click', () => show(k));
      return b;
    }));
    show(kinds[0]);
  }

  // ---- pit stops ----
  function pits() {
    $('pit-panel').hidden = false;
    // stops over a minute are red flag stops, not service
    const ok = race.pits.filter(p => p[3] && p[3] < 60000).sort((a, b) => a[3] - b[3]).slice(0, 6);
    $('pits').replaceChildren(...ok.map(([id, lap, , ms]) => {
      const r = byId.get(id) || { code: id, name: id };
      return el('li', { class: 'pit' },
        el('span', { class: 'pit-time mono' }, (ms / 1000).toFixed(2) + 's'),
        el('span', { class: 'pit-who' }, PF.driverLink(id, el('span', { class: 'code mono' }, r.code), r.name)),
        el('span', { class: 'pit-lap' }, 'lap ' + lap));
    }));
  }
})();
