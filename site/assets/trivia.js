// trivia: a quiz, a fact at a time and what happened on this day
(async function () {
  const { $, el } = PF;
  let facts, quiz, days;
  try {
    [facts, quiz, days] = await Promise.all(['facts', 'quiz', 'onthisday'].map(n => PF.json('/data/trivia/' + n + '.json')));
  } catch (e) {
    $('quiz-q').textContent = 'The trivia could not be loaded right now.';
    $('fact-text').textContent = '';
    return;
  }
  PF.stamp();
  $('n-facts').textContent = facts.count;
  $('n-quiz').textContent = quiz.count;

  const pick = list => list[Math.floor(Math.random() * list.length)];
  const TOPICS = { records: 'Records', seasons: 'Seasons', teams: 'Teams', circuits: 'Circuits', drivers: 'Drivers', races: 'Races', 'this season': 'This season' };
  const label = c => TOPICS[c] || c[0].toUpperCase() + c.slice(1);

  // ---- quiz ----
  const cats = [...new Set(quiz.questions.map(q => q.category))].sort();
  $('quiz-cat').append(...cats.map(c => el('option', { value: c }, label(c))));
  let level = '', current = null, answered = false, right = 0, asked = 0, streak = 0;
  const seen = new Set();
  // a shared link opens on that question
  const wanted = new URLSearchParams(location.search).get('q');

  function pool() {
    const cat = $('quiz-cat').value;
    return quiz.questions.filter(q => (!cat || q.category === cat) && (!level || q.difficulty === level));
  }
  function next() {
    let list = pool().filter(q => !seen.has(q.id));
    if (!list.length) { seen.clear(); list = pool(); }
    // pick a topic first so the many race-winner questions don't crowd out the rest
    const topics = [...new Set(list.map(q => q.category))];
    if (topics.length > 1) { const t = pick(topics); list = list.filter(q => q.category === t); }
    if (!list.length) { $('quiz-q').textContent = 'No questions match, try another topic.'; $('quiz-options').replaceChildren(); return; }
    show(pick(list));
  }
  function show(q) {
    current = q; answered = false; seen.add(q.id);
    $('quiz-meta').textContent = label(q.category) + ', ' + q.difficulty;
    $('quiz-q').textContent = q.q;
    $('quiz-explain').hidden = true;
    $('quiz-options').replaceChildren(...q.options.map((o, i) => {
      const b = el('button', { type: 'button', class: 'tv-opt' }, el('span', { class: 'tv-key' }, 'ABCD'[i]), o);
      b.addEventListener('click', () => answer(i));
      return b;
    }));
  }
  function answer(i) {
    if (answered) return;
    answered = true; asked++;
    const ok = i === current.answer;
    if (ok) { right++; streak++; } else streak = 0;
    [...$('quiz-options').children].forEach((b, k) => {
      b.disabled = true;
      b.classList.toggle('right', k === current.answer);
      b.classList.toggle('wrong', k === i && !ok);
    });
    const ex = $('quiz-explain');
    ex.hidden = false;
    const answerText = current.options[current.answer];
    // the full answer, the numbers behind it and where to look
    ex.replaceChildren(
      el('p', { class: 'tv-verdict' }, el('b', null, ok ? 'Right, ' + answerText + '. ' : 'Not quite, it\'s ' + answerText + '. '), current.explain),
      current.table && current.table.length ? el('table', { class: 'tv-table' }, el('tbody', null, ...current.table.map(([k, v, href]) => el('tr', { class: k.includes(answerText) || v === answerText ? 'is-answer' : null },
        el('td', null, href ? el('a', { href }, k) : k), el('td', { class: 'num-font' }, v))))) : '',
      current.link ? el('a', { class: 'btn btn-quiet tv-source', href: current.link }, current.linkText || 'See the data') : '');
    $('quiz-score').textContent = right + ' of ' + asked + (streak > 2 ? ', ' + streak + ' in a row' : '');
  }
  document.addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
    const k = 'abcd'.indexOf(e.key.toLowerCase());
    if (k >= 0 && current && k < current.options.length) answer(k);
    else if (e.key === 'Enter' && answered) next();
  });
  $('quiz-next').addEventListener('click', next);
  $('quiz-cat').addEventListener('change', next);
  $('quiz-level').querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
    level = b.dataset.level;
    $('quiz-level').querySelectorAll('[data-level]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    next();
  }));
  $('quiz-share').replaceWith(PF.shareButton(() => ({ title: 'F1 quiz', text: current ? current.q : 'F1 quiz', url: '/trivia' + (current ? '?q=' + encodeURIComponent(current.id) : '') }), 'Share this question'));
  const first = wanted && quiz.questions.find(q => q.id === wanted);
  first ? show(first) : next();

  // ---- a fact at a time ----
  let lastFact = null;
  function fact() {
    let f;
    do { f = pick(facts.facts); } while (facts.facts.length > 1 && f === lastFact);
    lastFact = f;
    $('fact-text').textContent = f.text;
    $('fact-cat').textContent = label(f.category);
    $('fact-link').hidden = !f.link;
    if (f.link) { $('fact-link').href = f.link; $('fact-link').textContent = f.linkText || 'See the data'; }
  }
  $('fact-next').addEventListener('click', fact);
  fact();

  // ---- on this day ----
  const now = new Date();
  const key = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const today = days.days[key] || [];
  const dayName = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  $('day-note').textContent = today.length ? 'Races run on ' + dayName + ' over the years.' : 'No championship race has been run on ' + dayName + ' yet.';
  $('day-list').replaceChildren(...today.map(x => el('li', null,
    el('span', { class: 'tv-year num-font' }, x.year), el('a', { href: x.link }, x.text))));
})();
