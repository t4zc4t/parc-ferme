// Fills the page from data/home.json once the data step exists.
// Until then the page shows its empty states.
(async function () {
  let home;
  try {
    const res = await fetch('data/home.json', { cache: 'no-cache' });
    if (!res.ok) return;
    home = await res.json();
  } catch (e) {
    return;
  }

  if (home.next) startClock(home.next);
  if (home.standings) fillStandings(home.standings);

  function startClock(next) {
    document.getElementById('next-name').textContent = next.name;
    document.getElementById('next-meta').textContent = next.circuit + ' · ' + next.dateLabel;
    const target = new Date(next.start).getTime();
    const cells = {};
    document.querySelectorAll('#clock b').forEach(b => { cells[b.dataset.unit] = b; });
    const pad = n => String(n).padStart(2, '0');
    function tick() {
      let left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      cells.d.textContent = pad(Math.floor(left / 86400)); left %= 86400;
      cells.h.textContent = pad(Math.floor(left / 3600)); left %= 3600;
      cells.m.textContent = pad(Math.floor(left / 60));
      cells.s.textContent = pad(left % 60);
    }
    tick();
    setInterval(tick, 1000);
  }

  function fillStandings(rows) {
    const body = document.getElementById('standings-body');
    body.textContent = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      [r.pos, r.driver, r.team, r.wins, r.points].forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (i === 4) td.className = 'num';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }
})();
