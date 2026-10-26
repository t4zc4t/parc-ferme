// schedule
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
  PF.watch();
  const now = Date.now();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('tz-note').textContent = 'Every session of the ' + sched.season + ' season, shown in your own time zone (' + zone + ').';

  const raceDone = r => PF.weekendOver(r, now);
  // same rule as the homepage, the next weekend that isn't over
  const focus = sched.rounds.find(r => !PF.weekendOver(r, now));
  const nxt = PF.nextSession(sched, now);

  if (focus) weekend(focus);
  calendar();

  function pill(status, isNext) {
    const text = status === 'live' ? 'Live' : status === 'done' ? 'Done' : isNext ? 'Next' : 'Later';
    return el('span', { class: 'pill pill-' + (isNext && status === 'upcoming' ? 'next' : status) }, text);
  }

  function sessionRow(r, s) {
    const status = PF.status(s, now);
    const isNext = nxt && nxt.session === s;
    let outcome = null;
    if (s.top3.length) {
      outcome = el('span', { class: 'podium3' },
        ...s.top3.map((t, i) => el(t.id ? 'a' : 'span', { href: t.id ? '/drivers/' + t.id : null, class: 'podium3-item', title: t.driver + ', ' + t.team },
          el('span', { class: 'mono dim' }, 'P' + (i + 1) + ' '), t.code)));
    } else if (status === 'done') {
      const timesheet = ['FP1', 'FP2', 'FP3', 'SQ'].includes(s.type);
      const old = now - Date.parse(s.end) > 24 * 3600e3;
      outcome = el('span', { class: 'dim small' }, timesheet
        ? (old ? 'No times were published for this session.' : 'Times usually land within the hour.')
        : 'Result usually lands a few hours after the session.');
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
    $('focus-title').textContent = started ? 'This weekend' : 'Next weekend';
    $('focus-note').textContent = 'Round ' + r.round + ' of ' + sched.rounds.length + (r.sprint ? ', sprint weekend' : '');
    $('weekend').append(
      el('div', { class: 'weekend-head' },
        el('span', { class: 'weekend-name' }, r.name),
        el('span', { class: 'weekend-place' }, r.circuit.name + ', ' + r.circuit.locality + ', ' + r.circuit.country)
      ),
      el('ul', { class: 'srows' }, ...r.sessions.map(s => sessionRow(r, s)))
    );
    if (r.winner) $('weekend').append(el('div', { class: 'go-row' }, raceLink(r)));
  }

  function raceLink(r) {
    return el('a', { class: 'go', href: '/races/' + sched.season + '/' + r.round }, 'Race page');
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
    $('cal-note').textContent = done + ' of ' + sched.rounds.length + ' raced';
    sched.rounds.forEach(r => {
      const finished = raceDone(r);
      const isFocus = focus && focus.round === r.round;
      const card = el('details', { class: 'round' + (finished ? ' round-done' : '') + (isFocus ? ' round-focus' : '') },
        el('summary', null,
          el('span', { class: 'round-num mono' }, 'R' + String(r.round).padStart(2, '0')),
          el('span', { class: 'round-main' },
            el('span', { class: 'round-name' }, r.name.replace(' Grand Prix', ' GP')),
            el('span', { class: 'round-meta' }, r.circuit.locality + ', ' + dateRange(r))
          ),
          el('span', { class: 'round-side' },
            r.sprint ? el('span', { class: 'tagline mono' }, 'Sprint') : null,
            r.winner ? el('span', { class: 'round-win' }, el('span', { class: 'mono dim' }, 'Won by '), r.winner.code)
              : finished ? el('span', { class: 'pill' }, 'Result soon')
              : isFocus ? el('span', { class: 'pill pill-next' }, 'Next') : null
          )
        ),
        el('ul', { class: 'srows srows-small' }, ...r.sessions.map(s => sessionRow(r, s))),
        r.winner ? el('div', { class: 'go-row' }, raceLink(r)) : null
      );
      box.append(card);
    });
  }
})();
