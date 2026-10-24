// driver page, id from /drivers/<id>
(async function () {
  const { $, el, pad2 } = PF;
  const id = (location.pathname.match(/\/drivers\/([a-z0-9_-]+)/i) || [])[1]
    || new URLSearchParams(location.search).get('id');

  let d;
  try {
    if (!id) throw new Error('no driver');
    d = await PF.json('/data/drivers/' + id + '.json');
  } catch (e) {
    $('d-last').textContent = 'Driver not found';
    $('d-meta').textContent = 'That driver isn\'t on this season\'s grid. Head back to the full list.';
    return;
  }

  document.title = d.name + ' · Parc Fermé';
  PF.stamp();
  hero(d);
  season(d);
  career(d);

  function hero(d) {
    $('d-num').textContent = d.number || d.code;
    $('d-first').textContent = d.first;
    $('d-last').textContent = d.last;
    $('d-kicker').firstChild.textContent = d.code + ' · DRIVER ';
    const bits = [d.team, d.nationality, d.age ? d.age + ' years old' : null];
    if (d.career.debut) bits.push('debut ' + d.career.debut.year + ' ' + d.career.debut.race);
    $('d-meta').textContent = bits.filter(Boolean).join(' · ');
    const mate = d.season.teammates[0];
    $('d-links').replaceChildren(...[
      mate ? el('a', { class: 'go', href: '/compare?' + new URLSearchParams({ a: d.id, b: mate.id, r: 'mates' }) },
        'Compare with ' + mate.name.split(' ').slice(-1)[0] + ' →') : null,
      el('a', { class: 'go', href: '/compare?a=' + encodeURIComponent(d.id) }, 'Compare with anyone →')].filter(Boolean));
  }

  function tile(label, value, sub, cls) {
    return el('div', { class: 'tile' + (cls ? ' ' + cls : '') },
      el('span', { class: 'tile-label mono' }, label),
      el('span', { class: 'tile-value' + (String(value).length >= 4 ? ' long' : '') }, value),
      sub ? el('span', { class: 'tile-sub' }, sub) : null
    );
  }

  function season(d) {
    const s = d.season;
    $('season-block').hidden = false;
    $('season-title').firstChild.textContent = s.year + ' season ';
    $('season-note').textContent = s.rounds.length + ' GRANDS PRIX SO FAR';
    const podiums = s.rounds.filter(r => ['1', '2', '3'].includes(r.finish)).length;
    $('season-tiles').append(
      tile('CHAMPIONSHIP', 'P' + s.pos, 'right now', 'tile-hot'),
      tile('POINTS', s.points, s.wins + (s.wins === 1 ? ' win' : ' wins')),
      tile('PODIUMS', podiums, podiums ? 'in ' + s.rounds.length + ' races' : 'none yet')
    );

    // title fight
    if (s.title) {
      const t = s.title;
      const label = PF.chance(t);
      const state = label === 'CHAMPION' ? 'champ' : !t.alive ? 'out' : t.pos === '1' ? 'lead' : 'alive';
      const word = { champ: 'CHAMPION', out: 'OUT OF THE FIGHT', lead: 'LEADING', alive: 'STILL IN IT' }[state];
      const top3State = t.top3Locked ? 'champ' : !t.top3Alive ? 'out' : +t.pos <= 3 ? 'lead' : 'alive';
      const top3Word = { champ: 'TOP 3 LOCKED', out: 'TOP 3 OUT OF REACH', lead: 'IN THE TOP 3', alive: 'CHASING THE TOP 3' }[top3State];
      $('title-panel').hidden = false;
      $('title-panel').append(
        el('div', { class: 'tp-head' },
          el('span', { class: 'pill tp-' + state }, word),
          el('span', { class: 'tp-pct' }, state === 'out' ? '' : label),
          state === 'out' || state === 'champ' ? null : el('span', { class: 'tp-cap mono' }, 'TITLE CHANCE')),
        el('p', { class: 'tp-note' }, t.note + '.'),
        el('div', { class: 'tp-head tp-sub' },
          el('span', { class: 'pill tp-' + top3State }, top3Word),
          el('span', { class: 'tp-pct' }, top3State === 'out' || top3State === 'champ' ? '' : PF.top3(t)),
          top3State === 'out' || top3State === 'champ' ? null : el('span', { class: 'tp-cap mono' }, 'TOP 3 CHANCE')),
        el('p', { class: 'tp-note' }, t.top3Note + '.'),
        el('p', { class: 'fine' }, state === 'out'
          ? 'Even winning every remaining race wouldn\'t win the title, the maximum is ' + t.maxPoints + ' points.'
          : 'The most they can finish on is ' + t.maxPoints + ' points. Chances come from replaying the rest of the season ' +
            (t.sims || 0).toLocaleString() + ' times using this season\'s results, a guide rather than a prediction.')
      );
    }

    // teammate battle
    const box = $('duels');
    if (!s.teammates.length) {
      box.append(el('p', { class: 'panel-note' }, 'No teammate data for this season yet.'));
    }
    s.teammates.forEach(t => {
      box.append(el('div', { class: 'duel' },
        el('p', { class: 'duel-head' }, 'vs ', PF.driverLink(t.id, t.name),
          el('span', { class: 'dim mono' }, ' · ' + t.rounds + (t.rounds === 1 ? ' round' : ' rounds') + ' together')),
        duelBar('QUALIFYING', t.quali),
        duelBar('RACE', t.race)
      ));
    });

    // round by round
    const strip = $('strip');
    const detail = $('strip-detail');
    s.rounds.forEach(r => {
      const n = +r.finish;
      let cls = 'sq-out';
      if (!r.classified && !Number.isFinite(n)) cls = 'sq-dnf';
      else if (n === 1) cls = 'sq-win';
      else if (n <= 3) cls = 'sq-pod';
      else if (r.points > 0) cls = 'sq-pts';
      if (!r.classified) cls = 'sq-dnf';
      const text = 'R' + r.round + ' ' + r.race + ': ' +
        (r.classified ? 'P' + r.finish : 'did not finish (' + r.status + ')') +
        (r.grid ? ', started P' + r.grid : ', started from the pit lane') + ', ' + r.points + ' pts';
      const cell = el('button', { type: 'button', class: 'cell ' + cls, title: text, 'aria-label': text },
        r.classified ? r.finish : 'DNF');
      const tell = () => detail.replaceChildren(text + ' · ',
        el('a', { href: '/races/' + s.year + '/' + r.round }, 'race page →'));
      cell.addEventListener('mouseenter', tell);
      cell.addEventListener('focus', tell);
      cell.addEventListener('click', tell);
      strip.append(cell);
    });
  }

  function duelBar(label, pair) {
    const total = pair[0] + pair[1];
    const share = total ? (100 * pair[0] / total) : 50;
    return el('div', { class: 'duel-row' },
      el('span', { class: 'duel-label mono' }, label),
      el('span', { class: 'duel-score mono' }, el('b', null, pair[0]), ' – ', pair[1]),
      el('span', { class: 'duel-bar', role: 'img', 'aria-label': label.toLowerCase() + ' ' + pair[0] + ' to ' + pair[1] },
        el('span', { class: 'duel-fill', style: 'width:' + share.toFixed(1) + '%' }))
    );
  }

  function career(d) {
    const c = d.career;
    $('career-block').hidden = false;
    $('career-note').textContent = c.seasons.length + (c.seasons.length === 1 ? ' SEASON' : ' SEASONS') +
      (c.debut ? ' SINCE ' + c.debut.year : '');
    const pct = n => c.races ? Math.round(100 * n / c.races) + '% of races' : '';
    $('career-tiles').append(
      tile('RACES', c.races, c.finishRate + '% finished'),
      tile('WINS', c.wins, pct(c.wins), c.wins ? 'tile-hot' : ''),
      tile('PODIUMS', c.podiums, pct(c.podiums)),
      tile('POLES', c.poles, pct(c.poles)),
      tile('TITLES', c.titles, c.titles ? 'world champion' : 'not yet', c.titles ? 'tile-gold' : ''),
      tile('POINTS', c.points, c.pointsFinishes + ' points finishes')
    );

    chart(c.seasons, d.season.year);

    const body = $('season-rows');
    c.seasons.slice().reverse().forEach(s => {
      const champ = s.pos === '1' && s.year < d.season.year;
      body.append(el('tr', { class: champ ? 'champ' : null },
        el('td', { class: 'mono' }, s.year + (s.year === d.season.year ? ' *' : '')),
        el('td', { class: 'team' }, s.teams.join(', ')),
        el('td', { class: 'mono' }, s.races),
        el('td', { class: 'mono' }, s.wins),
        el('td', { class: 'mono pos' }, /^\d+$/.test(s.pos || '') ? 'P' + s.pos : 'NC', champ ? el('span', { class: 'crown' }, ' CHAMPION') : null),
        el('td', { class: 'num mono pts' }, s.points ?? '–')
      ));
    });
  }

  function chart(seasons, current) {
    const pts = seasons.filter(s => Number.isFinite(+s.pos));
    const box = $('chart');
    if (pts.length < 2) {
      box.append(el('p', { class: 'panel-note' }, 'The chart appears once there are two seasons to compare.'));
      return;
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };
    const step = 32, padL = 44, padR = 28, padT = 26, padB = 40, h = 280;
    // scroll sideways on phones instead of squashing
    const w = Math.max(box.clientWidth || 560, padL + padR + step * (pts.length - 1));
    const worst = Math.max(10, ...pts.map(s => +s.pos));
    const x = i => padL + (pts.length === 1 ? 0 : i * (w - padL - padR) / (pts.length - 1));
    const y = p => padT + (p - 1) * (h - padT - padB) / (worst - 1);

    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img',
      'aria-label': 'Championship position by season, from ' + pts[0].year + ' to ' + pts[pts.length - 1].year });

    [1, 5, 10, 15, 20].filter(p => p <= worst).forEach(p => {
      root.append(svg('line', { x1: padL, x2: w - padR, y1: y(p), y2: y(p), class: 'grid-line' }));
      const t = svg('text', { x: padL - 12, y: y(p) + 4, class: 'axis', 'text-anchor': 'end' });
      t.textContent = 'P' + p;
      root.append(t);
    });

    root.append(svg('polyline', { points: pts.map((s, i) => x(i) + ',' + y(+s.pos)).join(' '), class: 'line' }));

    pts.forEach((s, i) => {
      const champ = s.pos === '1' && s.year < current;
      const live = s.year === current;
      root.append(svg('circle', { cx: x(i), cy: y(+s.pos), r: champ ? 7 : 5,
        class: 'dot' + (champ ? ' dot-champ' : '') + (live ? ' dot-live' : '') }));
      const lab = svg('text', { x: x(i), y: y(+s.pos) - 12, class: 'val', 'text-anchor': 'middle' });
      lab.textContent = 'P' + s.pos;
      root.append(lab);
      const yr = svg('text', { x: x(i), y: h - 14, class: 'axis', 'text-anchor': 'middle' });
      yr.textContent = "'" + String(s.year).slice(2);
      root.append(yr);
    });
    box.append(root);
  }
})();
