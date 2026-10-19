// homepage
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
  let which = 'drivers', stake = 'title';
  showTitle();
  PF.stamp();

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
    $('next-meta').textContent = c.name + ', ' + c.locality + ', ' + c.country;

    const nxt = PF.nextSession(schedule, now);
    const list = $('next-sessions');
    race.sessions.forEach(s => {
      const status = PF.status(s, now);
      const isNext = nxt && nxt.session === s && status === 'upcoming';
      const flag = status === 'live' ? el('span', { class: 'ns-flag flag-live' }, 'LIVE')
        : status === 'done' ? el('span', { class: 'ns-flag' }, 'DONE')
        : isNext ? el('span', { class: 'ns-flag flag-next' }, 'NEXT') : el('span', { class: 'ns-flag' });
      const when = new Date(s.start).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      list.append(el('li', { class: 'ns is-' + status + (isNext ? ' is-next' : '') },
        el('span', { class: 'ns-label' }, s.label),
        el('span', { class: 'ns-time mono' }, when),
        flag
      ));
    });

    // next start, or the end of a live session
    const live = race.sessions.find(s => PF.status(s, now) === 'live');
    const upcoming = race.sessions.find(s => PF.status(s, now) === 'upcoming');
    const target = live ? Date.parse(live.end) : upcoming ? Date.parse(upcoming.start) : Date.parse(race.race);
    $('clock-for').textContent = live ? live.label.toUpperCase() + ' ON NOW · ENDS IN ABOUT'
      : upcoming ? 'UNTIL ' + (upcoming.type === 'R' ? 'LIGHTS OUT' : upcoming.label.toUpperCase())
      : 'UNTIL LIGHTS OUT';

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

    $('last-links').replaceChildren(
      el('a', { class: 'go', href: '/races/' + schedule.season + '/' + last.round }, 'Lap chart, tyres and pit stops →'),
      el('a', { class: 'go', href: '/races?y=' + schedule.season }, 'Every race this season →'));

    const body = $('last-body');
    last.results.forEach(r => {
      const moved = Number.isFinite(+r.pos) && r.grid > 0 ? r.grid - +r.pos : null;
      const delta = moved === null || moved === 0 ? null
        : el('span', { class: 'delta ' + (moved > 0 ? 'up' : 'down') }, (moved > 0 ? '+' : '') + moved);
      body.append(el('tr', null,
        el('td', { class: 'pos mono' }, pad2(r.pos)),
        el('td', { class: 'driver' }, driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.driver))),
        el('td', { class: 'team opt' }, r.team),
        el('td', { class: 'mono nowrap' }, r.grid === 0 ? 'PIT' : r.grid, delta ? ' ' : null, delta),
        el('td', { class: 'mono dim opt' }, r.gap),
        el('td', { class: 'num mono pts' }, r.points)
      ));
    });
  }

  function showTitle() {
    const t = home.title;
    if (!t) return;
    $('title').hidden = false;
    const top3 = stake === 'top3';
    $('fight-name').textContent = top3 ? 'Top 3 fight' : 'Title fight';
    $('fight-jp').textContent = top3 ? '表彰台争い' : '王座争い';
    const left = t.racesLeft + (t.racesLeft === 1 ? ' RACE' : ' RACES') +
      (t.sprintsLeft ? ' + ' + t.sprintsLeft + (t.sprintsLeft === 1 ? ' SPRINT' : ' SPRINTS') : '');
    $('title-note').textContent = t.finished ? t.season + ' · SEASON OVER'
      : left + ' LEFT · ' + (which === 'teams' ? t.maxTeam : t.maxDriver) + ' PTS STILL ON OFFER';

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
      const sure = text === 'CHAMPION' || text === 'LOCKED';
      const p = top3 ? r.top3 : r.prob;
      const width = sure ? 100 : Math.max(p * 100, 1.5);
      const who = which === 'teams'
        ? el('span', { class: 'f-name' }, r.name)
        : PF.driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.name));
      const gapTo = top3 && i >= 3 ? +inIt[2].points - r.points : r.gap;
      box.append(el('div', { class: 'f-row' + (i === 0 || (top3 && i < 3) ? ' f-lead' : '') },
        el('span', { class: 'f-pos mono' }, PF.pad2(r.pos)),
        el('span', { class: 'f-who' }, who,
          el('span', { class: 'f-pts mono' }, r.points + ' PTS' + (gapTo > 0 && (!top3 || i >= 3) ? ' · −' + gapTo : ''))),
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
    $('standings-note').textContent = home.season + ' · ' + home.standingsNote;
    head.textContent = '';
    const cols = which === 'teams' ? ['POS', 'TEAM', 'WINS', 'POINTS'] : ['POS', 'DRIVER', 'TEAM', 'WINS', 'POINTS'];
    cols.forEach((c, i) => head.append(el('th', {
      scope: 'col',
      class: i === cols.length - 1 ? 'num' : (which === 'drivers' && c === 'TEAM' ? 'opt' : null)
    }, c)));

    body.textContent = '';
    rows.forEach((r, i) => {
      const cells = which === 'teams'
        ? [el('td', { class: 'driver' }, r.team)]
        : [el('td', { class: 'driver' }, driverLink(r.id, el('span', { class: 'code mono' }, r.code), ...PF.name(r.driver))),
           el('td', { class: 'team opt' }, r.team)];
      body.append(el('tr', { class: i < 3 ? 'top3' : null },
        el('td', { class: 'pos mono' }, pad2(r.pos)),
        ...cells,
        el('td', { class: 'mono' }, r.wins),
        el('td', { class: 'num mono pts' }, r.points)
      ));
    });
  }
})();
