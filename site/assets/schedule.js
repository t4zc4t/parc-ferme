// Schedule: the weekend in focus with every session, then the whole season.
(async function () {
  const { $, el } = PF;
  let sched;
  try {
    sched = await PF.json('/data/schedule.json');
  } catch (e) {
    $('calendar').textContent = 'The calendar could not be loaded right now.';
    return;
  }
  PF.stamp();
  const now = Date.now();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('tz-note').textContent = 'Every session of the ' + sched.season + ' season, shown in your own time zone (' + zone + ').';

  const raceDone = r => Date.parse(r.race) + 2 * 3600e3 <= now;
  const focus = sched.rounds.find(r => Date.parse(r.race) + 6 * 3600e3 > now);
  const nxt = PF.nextSession(sched, now);

  if (focus) weekend(focus);
  calendar();

  function pill(status, isNext) {
    const text = status === 'live' ? 'LIVE' : status === 'done' ? 'DONE' : isNext ? 'NEXT' : 'LATER';
    return el('span', { class: 'pill pill-' + (isNext && status === 'upcoming' ? 'next' : status) }, text);
  }

  function sessionRow(r, s) {
    const status = PF.status(s, now);
    const isNext = nxt && nxt.session === s;
    let outcome = null;
    if (s.top3.length) {
      outcome = el('span', { class: 'top3' },
        ...s.top3.map((t, i) => el('a', { href: '/drivers/' + t.id, class: 'top3-item', title: t.driver + ', ' + t.team },
          el('span', { class: 'mono dim' }, 'P' + (i + 1) + ' '), t.code)));
    } else if (status === 'done' && s.results) {
      outcome = el('span', { class: 'dim small' }, 'Result usually lands a few hours after the session.');
    } else if (status === 'done') {
      outcome = el('span', { class: 'dim small' }, 'Practice times arrive with the race explorer.');
    }
    return el('li', { class: 'srow srow-' + status + (isNext ? ' srow-next' : '') },
      el('span', { class: 'srow-when mono' }, PF.dayTime(s.start)),
      el('span', { class: 'srow-label' }, s.label),
      pill(status, isNext),
      el('span', { class: 'srow-out' }, outcome)
    );
  }

  function weekend(r) {
    $('focus-block').hidden = false;
    const started = Date.parse(r.sessions[0].start) <= now;
    $('focus-title').firstChild.textContent = started ? 'This weekend ' : 'Next weekend ';
    $('focus-title').append(el('span', { class: 'jp-h', lang: 'ja' }, '今週末'));
    $('focus-note').textContent = 'ROUND ' + r.round + ' / ' + sched.rounds.length + (r.sprint ? ' · SPRINT WEEKEND' : '');
    $('weekend').append(
      el('div', { class: 'weekend-head' },
        el('span', { class: 'weekend-name' }, r.name),
        el('span', { class: 'weekend-place' }, r.circuit.name + ', ' + r.circuit.locality + ', ' + r.circuit.country)
      ),
      el('ul', { class: 'srows' }, ...r.sessions.map(s => sessionRow(r, s)))
    );
  }

  function dateRange(r) {
    const a = new Date(r.start), b = new Date(r.race);
    const day = d => d.toLocaleDateString(undefined, { day: 'numeric' });
    const mon = d => d.toLocaleDateString(undefined, { month: 'short' });
    return a.getMonth() === b.getMonth() ? day(a) + '–' + day(b) + ' ' + mon(b)
      : day(a) + ' ' + mon(a) + ' – ' + day(b) + ' ' + mon(b);
  }

  function calendar() {
    const box = $('calendar');
    box.textContent = '';
    const done = sched.rounds.filter(raceDone).length;
    $('cal-note').textContent = done + ' OF ' + sched.rounds.length + ' RACED';
    sched.rounds.forEach(r => {
      const finished = raceDone(r);
      const isFocus = focus && focus.round === r.round;
      const card = el('details', { class: 'round' + (finished ? ' round-done' : '') + (isFocus ? ' round-focus' : '') },
        el('summary', null,
          el('span', { class: 'round-num mono' }, 'R' + String(r.round).padStart(2, '0')),
          el('span', { class: 'round-main' },
            el('span', { class: 'round-name' }, r.name.replace(' Grand Prix', ' GP')),
            el('span', { class: 'round-meta' }, r.circuit.locality + ' · ' + dateRange(r))
          ),
          el('span', { class: 'round-side' },
            r.sprint ? el('span', { class: 'tagline mono' }, 'SPRINT') : null,
            r.winner ? el('span', { class: 'round-win' }, el('span', { class: 'mono dim' }, 'WIN '), r.winner.code)
              : isFocus ? el('span', { class: 'pill pill-next' }, 'NEXT') : null
          )
        ),
        el('ul', { class: 'srows srows-small' }, ...r.sessions.map(s => sessionRow(r, s)))
      );
      box.append(card);
    });
  }
})();
