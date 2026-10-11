// Fills the homepage from data/home.json, which pipeline/build.py writes on every build.
(async function () {
  const $ = id => document.getElementById(id);
  let home;
  try {
    const res = await fetch('data/home.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    home = await res.json();
  } catch (e) {
    $('next-meta').textContent = 'The calendar could not be loaded right now.';
    $('standings-body').innerHTML = '<tr class="empty"><td colspan="5">The standings could not be loaded right now.</td></tr>';
    return;
  }

  showNext(home.next, home);
  showStandings(home);

  function showNext(next, home) {
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
    const pad = n => String(n).padStart(2, '0');
    function tick() {
      let left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      if (left === 0) { $('next-meta').textContent = 'Lights out. Results land after the race.'; }
      cells.d.textContent = pad(Math.floor(left / 86400)); left %= 86400;
      cells.h.textContent = pad(Math.floor(left / 3600)); left %= 3600;
      cells.m.textContent = pad(Math.floor(left / 60));
      cells.s.textContent = pad(left % 60);
    }
    tick();
    setInterval(tick, 1000);
  }

  function showStandings(home) {
    const body = $('standings-body');
    if (!home.standings.length) {
      body.innerHTML = '<tr class="empty"><td colspan="5">No races run yet this season.</td></tr>';
      return;
    }
    $('standings-note').textContent = home.season + ' · AFTER ROUND ' + home.afterRound;
    body.textContent = '';
    home.standings.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (i < 3) tr.className = 'top3';

      const pos = document.createElement('td');
      pos.className = 'pos mono';
      pos.textContent = String(r.pos).padStart(2, '0');

      const driver = document.createElement('td');
      driver.className = 'driver';
      const code = document.createElement('span');
      code.className = 'code mono';
      code.textContent = r.code;
      driver.append(code, document.createTextNode(r.driver));

      const team = document.createElement('td');
      team.className = 'team';
      team.textContent = r.team;

      const wins = document.createElement('td');
      wins.className = 'mono';
      wins.textContent = r.wins;

      const pts = document.createElement('td');
      pts.className = 'num mono pts';
      pts.textContent = r.points;

      tr.append(pos, driver, team, wins, pts);
      body.appendChild(tr);
    });
  }
})();
