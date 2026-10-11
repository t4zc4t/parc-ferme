// Homepage: countdown to the next race and session, last race result, standings.
(async function () {
  const { $, el, pad2, driverLink } = PF;
  let home, schedule;
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
  PF.stamp();

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
    const now = Date.now();
    const race = schedule.rounds.find(r => Date.parse(r.race) + 2 * 3600e3 > now);
    if (!race) {
      $('next-name').textContent = 'Season complete';
      $('next-meta').textContent = 'The ' + (schedule.season + 1) + ' calendar shows up here once it is published.';
      $('clock').hidden = true;
      return;
    }
    const c = race.circuit;
    $('next-round').textContent = 'ROUND ' + race.round + ' / ' + schedule.rounds.length;
    $('next-name').textContent = race.name;
    $('next-meta').textContent = c.name + ', ' + c.locality + ', ' + c.country + ' · ' + PF.dayTime(race.race);

    // count down to the next session of the weekend, not only the race
    const nxt = PF.nextSession(schedule, now);
    if (nxt && nxt.round.round === race.round) {
      $('next-up').hidden = false;
      const live = PF.status(nxt.session, now) === 'live';
      $('next-up-label').textContent = live ? 'ON TRACK NOW' : 'NEXT SESSION';
      $('next-up-name').textContent = nxt.session.label + ' · ' + PF.dayTime(nxt.session.start);
      if (live) $('next-up').classList.add('is-live');
    }
    const target = nxt && nxt.round.round === race.round && PF.status(nxt.session, now) === 'upcoming'
      ? Date.parse(nxt.session.start) : Date.parse(race.race);

    const cells = {};
    document.querySelectorAll('#clock b').forEach(b => { cells[b.dataset.unit] = b; });
    function tick() {
      let left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      cells.d.textContent = pad2(Math.floor(left / 86400)); left %= 86400;
      cells.h.textContent = pad2(Math.floor(left / 3600)); left %= 3600;
      cells.m.textContent = pad2(Math.floor(left / 60));
      cells.s.textContent = pad2(left % 60);
    }
    tick();
    setInterval(tick, 1000);
  }

  function showLast(last) {
    if (!last || !last.results.length) return;
    $('last').hidden = false;
    $('last-note').textContent = 'ROUND ' + last.round + ' · ' + last.name.toUpperCase() + ' · ' + last.dateLabel.toUpperCase();

    const podium = $('podium');
    last.results.slice(0, 3).forEach((r, i) => {
      podium.append(el('a', { href: '/drivers/' + r.id, class: 'step step-' + (i + 1) },
        el('span', { class: 'step-pos mono' }, 'P' + (i + 1)),
        el('span', { class: 'step-code' }, r.code),
        el('span', { class: 'step-name' }, r.driver),
        el('span', { class: 'step-team' }, r.team)
      ));
    });

    const body = $('last-body');
    last.results.forEach(r => {
      const moved = Number.isFinite(+r.pos) && r.grid > 0 ? r.grid - +r.pos : null;
      const delta = moved === null || moved === 0 ? null
        : el('span', { class: 'delta ' + (moved > 0 ? 'up' : 'down') }, (moved > 0 ? '+' : '') + moved);
      body.append(el('tr', null,
        el('td', { class: 'pos mono' }, pad2(r.pos)),
        el('td', { class: 'driver' }, driverLink(r.id, el('span', { class: 'code mono' }, r.code), r.driver)),
        el('td', { class: 'team' }, r.team),
        el('td', { class: 'mono' }, r.grid === 0 ? 'PIT' : r.grid, delta ? ' ' : null, delta),
        el('td', { class: 'mono dim' }, r.gap),
        el('td', { class: 'num mono pts' }, r.points)
      ));
    });
  }

  function showStandings(which) {
    const body = $('standings-body');
    const head = $('standings-head');
    const rows = which === 'teams' ? home.teams : home.standings;
    if (!rows || !rows.length) {
      PF.fail(body, 5, 'No races run yet this season.');
      return;
    }
    $('standings-note').textContent = home.season + ' · ' + home.standingsNote;
    head.textContent = '';
    const cols = which === 'teams' ? ['POS', 'TEAM', 'WINS', 'POINTS'] : ['POS', 'DRIVER', 'TEAM', 'WINS', 'POINTS'];
    cols.forEach((c, i) => head.append(el('th', { scope: 'col', class: i === cols.length - 1 ? 'num' : null }, c)));

    body.textContent = '';
    rows.forEach((r, i) => {
      const cells = which === 'teams'
        ? [el('td', { class: 'driver' }, r.team)]
        : [el('td', { class: 'driver' }, driverLink(r.id, el('span', { class: 'code mono' }, r.code), r.driver)),
           el('td', { class: 'team' }, r.team)];
      body.append(el('tr', { class: i < 3 ? 'top3' : null },
        el('td', { class: 'pos mono' }, pad2(r.pos)),
        ...cells,
        el('td', { class: 'mono' }, r.wins),
        el('td', { class: 'num mono pts' }, r.points)
      ));
    });
  }
})();
