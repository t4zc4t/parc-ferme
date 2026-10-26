// homepage
(async function () {
  const { $, el, pad2, driverLink } = PF;
  let home, schedule, clockTimer;
  try {
    [home, schedule] = await Promise.all([PF.json('/data/home.json'), PF.json('/data/schedule.json')]);
  } catch (e) {
    $('next-meta').textContent = 'The calendar could not be loaded right now.';
    PF.fail($('standings-body'), 5, 'The standings could not be loaded right now.');
    return;
  }

  showNext();
  showLast(home.lastRace);
  showStandings('drivers');
  let which = 'drivers', stake = 'title';
  showTitle();
  PF.stamp();
  PF.watch();

  ['title', 'stake'].forEach(attr => {
    document.querySelectorAll('[data-' + attr + ']').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-' + attr + ']').forEach(b => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', b === btn);
        });
        if (attr === 'title') which = btn.dataset.title; else stake = btn.dataset.stake;
        showTitle();
      });
    });
  });

  document.querySelectorAll('[data-table]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-table]').forEach(b => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', b === btn);
      });
      showStandings(btn.dataset.table);
    });
  });

  function showNext() {
    clearInterval(clockTimer);
    const now = Date.now();
    const race = schedule.rounds.find(r => !PF.weekendOver(r, now));
    if (!race) {
      $('next-name').textContent = 'Season complete';
      $('next-meta').textContent = 'The ' + (schedule.season + 1) + ' calendar shows up here once it is published.';
      $('next-sessions').replaceChildren();
      $('clock').hidden = true;
      $('clock-for').textContent = '';
      return;
    }
    const c = race.circuit;
    $('next-round').textContent = 'Round ' + race.round + ' of ' + schedule.rounds.length;
    $('next-name').textContent = race.name;
    $('next-meta').textContent = c.name + ', ' + c.locality + ', ' + c.country;

    const upcoming = race.sessions.find(s => PF.status(s, now) === 'upcoming');
    const live = race.sessions.find(s => PF.status(s, now) === 'live');
    $('next-sessions').replaceChildren(...race.sessions.map(s => {
      const status = PF.status(s, now);
      const isNext = s === upcoming && !live;
      const flag = status === 'live' ? el('span', { class: 'ns-flag flag-live' }, 'Live')
        : status === 'done' ? el('span', { class: 'ns-flag' }, 'Done')
        : isNext ? el('span', { class: 'ns-flag flag-next' }, 'Next') : el('span', { class: 'ns-flag' });
      const when = new Date(s.start).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      return el('li', { class: 'ns is-' + status + (isNext ? ' is-next' : '') },
        el('span', { class: 'ns-label' }, s.label),
        el('span', { class: 'ns-time mono' }, when),
        flag);
    }));

    // while a session runs we count up from its start, nobody knows exactly when it ends
    let from, up, label;
    if (live) {
      from = Date.parse(live.start); up = true;
      label = live.label + ' is on now, running for';
    } else if (upcoming) {
      from = Date.parse(upcoming.start); up = false;
      label = 'Until ' + (upcoming.type === 'R' ? 'lights out' : upcoming.label);
    } else {
      // everything has run, the result is on its way
      from = null;
      label = 'Result on the way';
    }
    $('clock').hidden = from === null;
    $('clock-for').textContent = label;
    // the moment the picture changes: a session starts or ends, or the weekend is over
    const change = live ? Date.parse(live.end) : upcoming ? Date.parse(upcoming.start)
      : Date.parse(race.race) + PF.RACE_LIMIT;

    const cells = {};
    document.querySelectorAll('#clock b').forEach(b => { cells[b.dataset.unit] = b; });
    function tick() {
      const t = Date.now();
      if (t >= change) { showNext(); return; }
      if (from === null) return;
      let left = Math.max(0, Math.floor((up ? t - from : from - t) / 1000));
      cells.d.textContent = pad2(Math.floor(left / 86400)); left %= 86400;
      cells.h.textContent = pad2(Math.floor(left / 3600)); left %= 3600;
      cells.m.textContent = pad2(Math.floor(left / 60));
      cells.s.textContent = pad2(left % 60);
    }
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  function showLast(last) {
    if (!last || !last.results.length) return;
    $('last').hidden = false;
    $('last-note').textContent = last.name + ', round ' + last.round + ', ' + last.dateLabel;
    $('last-body').replaceChildren(...last.results.map(r => {
      const moved = Number.isFinite(+r.pos) && r.grid > 0 ? r.grid - +r.pos : null;
      return el('li', { class: 'rl-row' + (+r.pos <= 3 ? ' rl-top' : '') },
        el('span', { class: 'rl-pos num-font' }, r.pos),
        el('span', { class: 'rl-who' }, driverLink(r.id, el('span', { class: 'code' }, r.code), ...PF.name(r.driver)),
          el('span', { class: 'rl-team' }, r.team)),
        el('span', { class: 'rl-gap num-font' }, r.gap),
        moved ? el('span', { class: 'delta ' + (moved > 0 ? 'up' : 'down'), title: 'Places gained from the grid' }, (moved > 0 ? '+' : '') + moved) : el('span'));
    }));
    $('last-links').replaceChildren(
      el('a', { class: 'btn btn-solid', href: '/races/' + schedule.season + '/' + last.round }, schedule.season >= 2026 ? 'Watch the replay' : 'Lap chart and tyres'),
      el('a', { class: 'btn btn-quiet', href: '/races?y=' + schedule.season }, 'Every race this season'));
  }

  function showTitle() {
    const t = home.title;
    if (!t) return;
    $('title').hidden = false;
    const top3 = stake === 'top3';
    $('fight-name').textContent = top3 ? 'Top 3 fight' : 'Title fight';
    const left = t.racesLeft + (t.racesLeft === 1 ? ' race' : ' races') +
      (t.sprintsLeft ? ' + ' + t.sprintsLeft + (t.sprintsLeft === 1 ? ' sprint' : ' sprints') : '');
    $('title-note').textContent = t.finished ? t.season + ' season over'
      : left + ' left, ' + (which === 'teams' ? t.maxTeam : t.maxDriver) + ' points still on offer';

    const rows = which === 'teams' ? t.teams : t.drivers;
    const label = r => top3 ? PF.top3(r) : PF.chance(r);
    const inIt = top3
      ? rows.filter(r => r.top3Alive || r.top3Locked)
      : rows.filter(r => r.alive || r.clinched || (r.note || '').startsWith('Champion'));
    const out = rows.filter(r => !inIt.includes(r));
    const box = $('fight');
    box.textContent = '';
    inIt.forEach((r, i) => {
      const text = label(r);
      const sure = text === 'Champion' || text === 'Locked';
      const p = top3 ? r.top3 : r.prob;
      const width = sure ? 100 : Math.max(p * 100, 1.5);
      const who = which === 'teams'
        ? el('span', { class: 'f-name' }, r.name)
        : PF.driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.name));
      const gapTo = top3 && i >= 3 ? +inIt[2].points - r.points : r.gap;
      box.append(el('div', { class: 'f-row' + (i === 0 || (top3 && i < 3) ? ' f-lead' : '') },
        el('span', { class: 'f-pos num-font' }, r.pos),
        el('span', { class: 'f-who' }, who,
          el('span', { class: 'f-pts mono' }, r.points + ' pts' + (gapTo > 0 && (!top3 || i >= 3) ? ', ' + gapTo + ' behind' : ''))),
        el('span', { class: 'f-bar', role: 'img', 'aria-label': (top3 ? 'top 3 chance ' : 'title chance ') + text },
          el('span', { class: 'f-fill', style: 'width:' + width.toFixed(1) + '%' })),
        el('span', { class: 'f-pct mono' }, text),
        el('span', { class: 'f-note' }, top3 ? r.top3Note : r.note)
      ));
    });
    $('out-line').textContent = out.length
      ? (top3 ? 'Can\'t reach the top 3: ' : 'Mathematically out: ') +
        out.map(r => which === 'teams' ? r.name : r.code).join(', ') + '.'
      : '';
    $('title-fine').textContent = t.sims
      ? 'Chances come from replaying the rest of the season ' + t.sims.toLocaleString() +
        ' times, using each ' + (which === 'teams' ? 'team\'s drivers\'' : 'driver\'s') +
        ' results this season, with recent races counting a bit more. ' +
        (top3 ? '"Guaranteed" numbers are exact maths, the rivals sharing the points they could score. ' : '') +
        'It\'s a guide to the maths, not a prediction.'
      : '';
  }

  function showStandings(which) {
    const body = $('standings-body');
    const head = $('standings-head');
    const rows = which === 'teams' ? home.teams : home.standings;
    if (!rows || !rows.length) {
      PF.fail(body, 5, 'No races run yet this season.');
      return;
    }
    $('standings-note').textContent = home.season + ', ' + home.standingsNote.toLowerCase();
    head.textContent = '';
    const cols = which === 'teams' ? ['Pos', 'Team', 'Wins', 'Points'] : ['Pos', 'Driver', 'Team', 'Wins', 'Points'];
    cols.forEach((c, i) => head.append(el('th', {
      scope: 'col',
      class: i === cols.length - 1 ? 'num' : (which === 'drivers' && c === 'Team' ? 'opt' : null)
    }, c)));

    body.textContent = '';
    rows.forEach((r, i) => {
      const cells = which === 'teams'
        ? [el('td', { class: 'driver' }, r.team)]
        : [el('td', { class: 'driver' }, driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.driver))),
           el('td', { class: 'team opt' }, r.team)];
      body.append(el('tr', { class: i < 3 ? 'top3' : null },
        el('td', { class: 'pos num-font' }, r.pos),
        ...cells,
        el('td', { class: 'mono' }, r.wins),
        el('td', { class: 'num mono pts' }, r.points)
      ));
    });
  }
})();
