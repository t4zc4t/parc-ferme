// Homepage: next race countdown, last race result and driver standings.
(async function () {
  const { $, el, pad2, driverLink } = PF;
  let home;
  try {
    home = await PF.json('/data/home.json');
  } catch (e) {
    $('next-meta').textContent = 'The calendar could not be loaded right now.';
    PF.fail($('standings-body'), 5, 'The standings could not be loaded right now.');
    return;
  }

  showNext(home);
  showLast(home.lastRace);
  showStandings(home);
  PF.stamp(home.updated);

  function showNext(home) {
    const next = home.next;
    if (!next) {
      $('next-name').textContent = 'Season complete';
      $('next-meta').textContent = 'The ' + (home.season + 1) + ' calendar appears once it is published.';
      $('clock').hidden = true;
      return;
    }
    $('next-round').textContent = 'ROUND ' + next.round + ' / ' + home.rounds;
    $('next-name').textContent = next.name;
    $('next-meta').textContent = next.circuit + ', ' + next.place + ' · ' + next.dateLabel;

    const target = new Date(next.start).getTime();
    const cells = {};
    document.querySelectorAll('#clock b').forEach(b => { cells[b.dataset.unit] = b; });
    function tick() {
      let left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      if (left === 0) $('next-meta').textContent = 'Lights out. Results land after the race.';
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
    const places = ['P1', 'P2', 'P3'];
    last.results.slice(0, 3).forEach((r, i) => {
      podium.append(el('a', { href: '/drivers/' + r.id, class: 'step step-' + (i + 1) },
        el('span', { class: 'step-pos mono' }, places[i]),
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

  function showStandings(home) {
    const body = $('standings-body');
    if (!home.standings.length) {
      PF.fail(body, 5, 'No races run yet this season.');
      return;
    }
    $('standings-note').textContent = home.season + ' · ' + home.standingsNote;
    body.textContent = '';
    home.standings.forEach((r, i) => {
      body.append(el('tr', { class: i < 3 ? 'top3' : null },
        el('td', { class: 'pos mono' }, pad2(r.pos)),
        el('td', { class: 'driver' }, driverLink(r.id, el('span', { class: 'code mono' }, r.code), r.driver)),
        el('td', { class: 'team' }, r.team),
        el('td', { class: 'mono' }, r.wins),
        el('td', { class: 'num mono pts' }, r.points)
      ));
    });
  }
})();
