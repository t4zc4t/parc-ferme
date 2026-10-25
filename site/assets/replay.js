// race replay: every car on the real track, a live timing tower, and the lap chart as the timeline
PF.replay = async function (race, { year, round, byId, chart }) {
  const { $, el } = PF;
  let data;
  try {
    data = await PF.json('/data/replay/' + year + '/' + round + '.json');
  } catch (e) {
    return;   // the race page still has everything else
  }
  $('replay-panel').hidden = false;

  const ids = Object.keys(data.cars).filter(id => byId.has(id));
  const step = data.step;
  const end = data.end;

  // first value absolute, then deltas, null for no reading
  const unpack = arr => {
    const out = new Float32Array(arr.length);
    let last = null;
    arr.forEach((v, i) => {
      if (v === null) { out[i] = NaN; last = null; }
      else { last = last === null ? v : last + v; out[i] = last; }
    });
    return out;
  };
  const cars = {};
  ids.forEach(id => { cars[id] = { x: unpack(data.cars[id].x), y: unpack(data.cars[id].y), color: data.cars[id].color }; });

  // a car that didn't finish is out a couple of minutes after its last lap began,
  // the feed keeps reporting it parked so its position alone can't tell us
  // classified but stopped early still counts as out
  const finished = id => ['Finished', 'Lapped'].includes(byId.get(id).status) || /^\+/.test(byId.get(id).status || '');
  const lastLap = {};
  ids.forEach(id => { const s = data.laps[id] || []; lastLap[id] = s.length ? s[s.length - 1] : 0; });

  // ---- where things are at time t ----
  const at = (id, t) => {
    const c = cars[id], i = Math.floor(t / step), f = t / step - i;
    const x0 = c.x[i], x1 = c.x[i + 1], y0 = c.y[i], y1 = c.y[i + 1];
    if (isNaN(x0)) return null;
    if (isNaN(x1)) return [x0, y0];
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };
  const latest = (rows, t) => {
    let lo = 0, hi = (rows || []).length - 1, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid][0] <= t) { best = rows[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best;
  };
  const lapOf = (id, t) => {
    const starts = data.laps[id] || [];
    let n = 0;
    while (n < starts.length && starts[n] <= t) n++;
    return n;
  };
  const totalLaps = Math.max(...race.results.map(r => r.laps));
  const winner = race.results[0].id;
  // laps the leader has done, as a fraction, for the lap chart's line
  const lapsDone = t => {
    const s = data.laps[winner] || [];
    let n = 0;
    while (n < s.length && s[n] <= t) n++;
    if (n === 0) return 0;
    const next = s[n] ?? (s[n - 1] + (s[n - 1] - (s[n - 2] ?? s[n - 1] - 90)));
    return Math.min(totalLaps, n - 1 + Math.min(1, (t - s[n - 1]) / Math.max(1, next - s[n - 1])));
  };
  const out = (id, t) => !finished(id) && t > lastLap[id] + 150;
  const inPit = (id, t) => data.pits.some(([d, s, lane]) => d === id && t >= s && t <= s + lane);
  const tyreAt = (id, t) => {
    const lap = Math.max(1, lapOf(id, t));
    const s = (race.stints && race.stints[id] || []).find(([a, b]) => lap >= a && lap <= b);
    return s ? { comp: s[2], age: (s[3] || 0) + lap - s[0] } : null;
  };

  // ---- the track ----
  const canvas = $('replay-canvas');
  const ctx = canvas.getContext('2d');
  const xs = data.track.map(p => p[0]), ys = data.track.map(p => p[1]);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  let scale = 1, ox = 0, oy = 0, W = 0, H = 0;
  function size() {
    const wrap = canvas.parentElement;
    W = wrap.clientWidth;
    H = Math.max(260, Math.min(560, W * 0.68));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 28;
    scale = Math.min((W - pad * 2) / (box.x1 - box.x0), (H - pad * 2) / (box.y1 - box.y0));
    ox = (W - (box.x1 - box.x0) * scale) / 2;
    oy = (H - (box.y1 - box.y0) * scale) / 2;
  }
  // screen y grows down, the track's grows up
  const px = x => ox + (x - box.x0) * scale;
  const py = y => H - (oy + (y - box.y0) * scale);

  const css = getComputedStyle(document.documentElement);
  const INK = css.getPropertyValue('--ink').trim() || '#07070D';

  // ---- state ----
  let t = 0, playing = false, speed = 30, follow = null, lastFrame = 0;

  function drawMap() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    data.track.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    ctx.closePath();
    ctx.strokeStyle = '#1d1c30'; ctx.lineWidth = 14; ctx.stroke();
    ctx.strokeStyle = '#34324f'; ctx.lineWidth = 2; ctx.stroke();

    const order = standing(t);
    // back of the field first so the leaders sit on top
    order.slice().reverse().forEach(({ id, out: gone }) => {
      const p = gone ? null : at(id, t);
      if (!p) return;
      const X = px(p[0]), Y = py(p[1]);
      const mine = id === follow;
      ctx.beginPath();
      ctx.arc(X, Y, mine ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = cars[id].color;
      ctx.fill();
      ctx.lineWidth = mine ? 3 : 1.5;
      ctx.strokeStyle = mine ? '#ffffff' : INK;
      ctx.stroke();
    });
    // names for the leader and whoever is followed
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const tag = new Set([order[0] && order[0].id, follow].filter(Boolean));
    tag.forEach(id => {
      const p = order.find(o => o.id === id).out ? null : at(id, t);
      if (!p) return;
      const X = px(p[0]) + 11, Y = py(p[1]) - 11;
      const text = byId.get(id).code;
      const tw = ctx.measureText(text).width + 8;
      ctx.fillStyle = 'rgba(7,7,13,.85)';
      ctx.fillRect(X - 4, Y - 9, tw, 18);
      ctx.fillStyle = id === follow ? '#ffffff' : cars[id].color;
      ctx.fillText(text, X, Y);
    });
  }

  // order at time t: the timing feed's positions, retired cars at the back
  function standing(t) {
    return ids.map(id => {
      const p = latest(data.order[id], t);
      const grid = byId.get(id).grid || 30;
      return { id, pos: p ? p[1] : grid, out: out(id, t) };
    }).sort((a, b) => (a.out - b.out) || (a.pos - b.pos));
  }

  // ---- timing tower ----
  const rows = {};
  const tower = $('tower');
  ids.forEach(id => {
    const r = byId.get(id);
    const row = el('li', { class: 'tw-row', tabindex: '0', role: 'button', 'aria-label': 'Follow ' + r.name },
      el('span', { class: 'tw-pos mono' }),
      el('span', { class: 'tw-dot', style: 'background:' + cars[id].color }),
      el('span', { class: 'tw-code mono' }, r.code),
      el('span', { class: 'tw-gap mono' }),
      el('span', { class: 'tw-tyre mono' }));
    const pick = () => { follow = follow === id ? null : id; if (follow && chart) chart.follow(id); render(); };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    rows[id] = row;
  });
  tower.replaceChildren(...ids.map(id => rows[id]));

  function drawTower() {
    const order = standing(t);
    order.forEach(({ id, out: gone }, i) => {
      const row = rows[id];
      const [pos, , , gap, tyre] = row.children;
      pos.textContent = gone ? 'OUT' : PF.pad2(i + 1);
      const g = latest(data.gaps[id], t);
      const pit = inPit(id, t);
      gap.textContent = gone ? '' : pit ? 'IN PIT' : i === 0 ? 'Leader'
        : g && g[1] != null ? (typeof g[1] === 'number' ? '+' + g[1].toFixed(1) : g[1]) : '';
      gap.classList.toggle('tw-pit', pit && !gone);
      const ty = gone ? null : tyreAt(id, t);
      tyre.replaceChildren(...(ty && ty.comp !== 'UNKNOWN' ? [
        el('span', { class: 'stint-key tyre-' + ty.comp.toLowerCase() }, ty.comp[0]),
        el('span', { class: 'tw-age' }, String(ty.age))] : []));
      row.classList.toggle('tw-out', gone);
      row.classList.toggle('tw-follow', id === follow);
      // a smooth slide when places change
      row.style.transform = 'translateY(' + (i * 30) + 'px)';
    });
    tower.style.height = ids.length * 30 + 'px';
  }

  // ---- lap, flags, clock ----
  function drawStatus() {
    const lap = Math.min(totalLaps, Math.max(...ids.map(id => lapOf(id, t))));
    const done = t >= (data.laps[winner] || []).at(-1) + 60 || t >= end;
    $('replay-lap').textContent = done ? 'FLAG' : lap ? 'LAP ' + lap + ' / ' + totalLaps : 'LIGHTS OUT';
    const p = (race.periods || []).find(([, a, b]) => lap >= a && lap <= b);
    const flag = $('replay-flag');
    flag.hidden = !p || done;
    if (p) { flag.textContent = { SC: 'SAFETY CAR', VSC: 'VIRTUAL SAFETY CAR', RED: 'RED FLAG' }[p[0]] || p[0]; flag.className = 'replay-flag mono flag-' + p[0].toLowerCase(); }
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    $('replay-time').textContent = Math.floor(m / 60) + ':' + PF.pad2(m % 60) + ':' + PF.pad2(s);
    $('replay-seek').value = String(Math.round(t));
    if (chart) chart.cursor(lapsDone(t));
    if (done) showFindings();
  }

  function render() { drawMap(); drawTower(); drawStatus(); }

  // ---- the end: what the data says ----
  let shown = false;
  function showFindings() {
    if (shown || !(race.findings || []).length) return;
    shown = true;
    const box = $('findings');
    box.replaceChildren(el('h3', { class: 'find-head' }, 'What the data says'),
      el('div', { class: 'find-grid' }, ...race.findings.map(f =>
        el('div', { class: 'find' }, el('span', { class: 'find-k mono' }, f.k), el('span', { class: 'find-v' }, f.v), el('span', { class: 'find-t' }, f.text)))));
    box.hidden = false;
  }

  // ---- controls ----
  const play = $('replay-play');
  const setPlaying = v => {
    playing = v;
    play.textContent = v ? 'Pause' : t >= end ? 'Watch again' : 'Play';
    play.setAttribute('aria-pressed', v);
    if (v) { lastFrame = performance.now(); requestAnimationFrame(frame); }
  };
  play.addEventListener('click', () => { if (t >= end) t = 0; setPlaying(!playing); });
  const seekBar = $('replay-seek');
  seekBar.max = String(end);
  seekBar.addEventListener('input', () => { t = +seekBar.value; render(); });
  $('replay-speed').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    $('replay-speed').querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  }));
  $('replay-end').addEventListener('click', () => { t = end; setPlaying(false); render(); });
  if (chart) chart.onSeek(n => {
    const s = data.laps[winner] || [];
    t = n === 0 ? 0 : (s[n] ?? end);
    render();
  });

  function frame(now) {
    if (!playing) return;
    t = Math.min(end, t + (now - lastFrame) / 1000 * speed);
    lastFrame = now;
    render();
    if (t >= end) { setPlaying(false); return; }
    requestAnimationFrame(frame);
  }

  size();
  render();
  let timer;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { size(); render(); }, 150); });
};
