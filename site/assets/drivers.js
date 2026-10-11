// Drivers index: a card for each driver on this season's grid.
(async function () {
  const { $, el } = PF;
  const grid = $('grid');
  let data;
  try {
    data = await PF.json('/data/drivers.json');
  } catch (e) {
    grid.textContent = 'The drivers could not be loaded right now.';
    return;
  }
  PF.stamp(data.updated);
  $('grid-lede').textContent = 'All ' + data.drivers.length + ' drivers to start a race in ' + data.season + '. Pick one for their career, season by season, and how they stack up against their teammate.';

  const sorts = {
    pos: (a, b) => (+a.pos || 99) - (+b.pos || 99),
    wins: (a, b) => b.wins - a.wins || b.races - a.races,
    races: (a, b) => b.races - a.races,
    team: (a, b) => a.team.localeCompare(b.team) || (+a.pos || 99) - (+b.pos || 99)
  };

  function render(key) {
    grid.textContent = '';
    data.drivers.slice().sort(sorts[key]).forEach(d => {
      grid.append(el('a', { class: 'dcard', href: '/drivers/' + d.id },
        el('span', { class: 'dcard-num', 'aria-hidden': 'true' }, d.number || ''),
        el('span', { class: 'dcard-top' },
          el('span', { class: 'code mono' }, d.code),
          el('span', { class: 'dcard-pos mono' }, 'P' + d.pos + ' · ' + d.points + ' PTS')
        ),
        el('span', { class: 'dcard-name' }, d.name),
        el('span', { class: 'dcard-team' }, d.team + (d.nationality ? ' · ' + d.nationality : '')),
        el('span', { class: 'dcard-stats mono' },
          el('span', null, el('b', null, d.races), ' races'),
          el('span', null, el('b', null, d.wins), ' wins'),
          d.titles ? el('span', { class: 'gold' }, el('b', null, d.titles), d.titles > 1 ? ' titles' : ' title') : null
        )
      ));
    });
  }

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', b === btn);
      });
      render(btn.dataset.sort);
    });
  });
  render('pos');
})();
