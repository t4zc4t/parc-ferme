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
  // newer files store how far each car has gone along the track, older ones x and y
  const onTrack = data.v >= 2;
  ids.forEach(id => {
    const c = data.cars[id];
    cars[id] = onTrack ? { d: unpack(c.d), color: c.color } : { x: unpack(c.x), y: unpack(c.y), color: c.color };
  });

  // the track as a line we can walk along, the same measure the data uses
  const trackCum = [0];
  data.track.forEach((p, i) => {
    const q = data.track[(i + 1) % data.track.length];
    trackCum.push(trackCum[i] + Math.hypot(q[0] - p[0], q[1] - p[1]));
  });
  const lapLen = trackCum[trackCum.length - 1];
  const pointAt = dist => {
    let s = dist % lapLen;
    if (s < 0) s += lapLen;
    let lo = 0, hi = data.track.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (trackCum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = data.track[lo], b = data.track[(lo + 1) % data.track.length];
    const f = (s - trackCum[lo]) / ((trackCum[lo + 1] - trackCum[lo]) || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };

  // a car that didn't finish is out a couple of minutes after its last lap began,
  // the feed keeps reporting it parked so its position alone can't tell us
  // classified but stopped early still counts as out
  const finished = id => ['Finished', 'Lapped'].includes(byId.get(id).status) || /^\+/.test(byId.get(id).status || '');
  const lastLap = {};
  ids.forEach(id => { const s = data.laps[id] || []; lastLap[id] = s.length ? s[s.length - 1] : 0; });

  // ---- where things are at time t ----
  // the feed drops out now and then, so short gaps are bridged along the track
  const GAP = 90;
  if (onTrack) ids.forEach(id => {
    const d = cars[id].d, n = d.length;
    const prev = new Int32Array(n), next = new Int32Array(n);
    let last = -1;
    for (let i = 0; i < n; i++) { if (!isNaN(d[i])) last = i; prev[i] = last; }
    last = -1;
    for (let i = n - 1; i >= 0; i--) { if (!isNaN(d[i])) last = i; next[i] = last; }
    Object.assign(cars[id], { prev, next });
  });
  const rawDist = (id, t) => {
    const c = cars[id], i = Math.floor(t / step), f = t / step - i;
    if (i < 0 || i >= c.d.length) return NaN;
    const a = c.prev[i], b = c.next[Math.min(i + 1, c.d.length - 1)];
    if (a < 0) return NaN;
    if (a === i && !isNaN(c.d[i + 1])) return c.d[i] + (c.d[i + 1] - c.d[i]) * f;
    if (b < 0 || b <= a || (b - a) * step > GAP) return a === i ? c.d[i] : NaN;
    return c.d[a] + (c.d[b] - c.d[a]) * ((t - a * step) / ((b - a) * step));
  };

  // every classified car crosses the line at the end of its last lap and stops there
  const finishLine = {};
  if (onTrack) ids.forEach(id => {
    const r = byId.get(id);
    if (!finished(id) || !r.laps) return;
    const starts = data.laps[id] || [];
    // the feed sometimes skips a lap's start (often the first), so count from the last one:
    // where the car was when its last lap began, plus that one lap
    // (a start logged after the flag is the slow-down lap, so never count past the laps run)
    const K = Math.min(starts.length, r.laps);
    for (let k = K; k >= 2; k--) {
      const d = rawDist(id, starts[k - 1]);
      if (isNaN(d)) continue;
      const D = (Math.round(d / lapLen) + K - k + 1) * lapLen;
      // when it got there, or when it would have at its usual pace if the feed ran out
      const c = cars[id];
      let T = null;
      for (let i = 0; i < c.d.length; i++) if (c.d[i] >= D) { T = i * step - (c.d[i] - D) / Math.max(1, (c.d[i] - (c.d[i - 1] ?? c.d[i])) / step || 50); break; }
      if (T === null) {
        const a = c.prev[c.d.length - 1];
        const laps = starts.slice(1).map((v, j) => v - starts[j]).filter(x => x > 0).sort((x, y) => x - y);
        const pace = lapLen / (laps[laps.length >> 1] || 90);
        T = a < 0 ? null : a * step + Math.max(0, D - c.d[a]) / pace;
        if (T !== null) c.tail = { t: a * step, d: c.d[a], pace };
      }
      // then roll on a little and line up past the line in finishing order, the winner in front
      if (T !== null) finishLine[id] = { d: D, t: Math.max(0, T), park: Math.max(24, 240 - ((r.order || 20) - 1) * 11) };
      break;
    }
  });
  const distAt = (id, t) => {
    const fin = finishLine[id];
    if (fin && t >= fin.t) {
      const k = Math.min(1, (t - fin.t) / 14);
      return fin.d + (1 - (1 - k) * (1 - k)) * fin.park;
    }
    const c = cars[id];
    if (fin && c.tail && t >= c.tail.t) return Math.min(fin.d, c.tail.d + (t - c.tail.t) * c.tail.pace);
    return rawDist(id, t);
  };

  const at = (id, t) => {
    const c = cars[id], i = Math.floor(t / step), f = t / step - i;
    if (onTrack) {
      // move along the track between samples, never across the infield
      const d = distAt(id, t);
      return isNaN(d) ? null : pointAt(d);
    }
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
  // why a car isn't running: did not start, disqualified, or a retirement of any kind
  const whyOut = id => {
    const st = byId.get(id).status || '';
    if (finished(id)) return null;
    if (/not start|withdr/i.test(st) || byId.get(id).pos === 'W') return 'DNS';
    if (/disq/i.test(st)) return 'DSQ';
    return 'DNF';
  };
  // the moment it stopped: its last lap, or sooner if it came to a halt or the feed lost it
  const outAt = {};
  ids.forEach(id => {
    const why = whyOut(id);
    if (!why) return;
    if (why === 'DNS' || !lastLap[id]) { outAt[id] = 0; return; }
    let when = lastLap[id] + 150;
    if (onTrack) {
      const c = cars[id], win = Math.round(20 / step);
      for (let i = Math.floor(lastLap[id] / step); i < c.d.length; i++) {
        const j = Math.min(c.d.length - 1, i + win);
        const a = rawDist(id, i * step), b = rawDist(id, j * step);
        if (isNaN(a) || isNaN(b) || b - a < 5) { when = Math.min(when, i * step + 5); break; }
      }
    }
    outAt[id] = Math.max(lastLap[id] + 5, when);
  });
  const out = (id, t) => id in outAt && t >= outAt[id];
  const pitStops = data.pits.slice().sort((a, b) => a[1] - b[1]);
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
  let t = 0, playing = false, speed = 30, lastFrame = 0;
  // up to two drivers to compare, and whether every car gets its name on the map
  let picks = [], names = 'all';
  // a shared link can open on a moment and a pair of drivers
  const params = new URLSearchParams(location.search);
  if (params.has('t')) t = Math.max(0, Math.min(end, +params.get('t') || 0));
  if (params.has('d')) picks = params.get('d').split(',').filter(id => cars[id]).slice(0, 2);
  const RING = ['#EE3F7E', '#22A7B5'];
  const ringOf = id => RING[picks.indexOf(id)];
  let spots = [];   // where each dot was drawn, for hover and clicks

  // the timing line sits where the traced lap began
  function drawLine() {
    const n = data.track.length;
    const [x0, y0] = data.track[0];
    const k = Math.min(n - 1, 3);
    const dx = px(data.track[k][0]) - px(data.track[n - k][0]), dy = py(data.track[k][1]) - py(data.track[n - k][1]);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const X = px(x0), Y = py(y0), half = 10;
    // a two-row chequer across the track
    const cw = half * 2 / 6, ch = 3;
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(Math.atan2(ny, nx));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#F2F0FA' : '#07070D';
      ctx.fillRect(-half + i * cw, (j - 1) * ch, cw, ch);
    }
    ctx.strokeStyle = '#F2F0FA'; ctx.lineWidth = 0.75;
    ctx.strokeRect(-half, -ch, half * 2, ch * 2);
    ctx.restore();
    // a small tag off to the side, away from the cars
    ctx.font = '600 10px "Zen Kaku Gothic New", sans-serif';
    ctx.textBaseline = 'middle';
    const label = 'Start / finish';
    const w = ctx.measureText(label).width + 8;
    const side = (nx * (W / 2 - X) + ny * (H / 2 - Y)) > 0 ? -1 : 1;
    let lx = X + nx * side * 22 - (side * nx < 0 ? w : 0), ly = Y + ny * side * 22 - 8;
    lx = Math.max(4, Math.min(W - w - 4, lx)); ly = Math.max(4, Math.min(H - 20, ly));
    ctx.fillStyle = 'rgba(7,7,13,.85)'; ctx.fillRect(lx, ly, w, 16);
    ctx.fillStyle = '#B9B6CF'; ctx.fillText(label, lx + 4, ly + 9);
  }

  function drawMap() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    data.track.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    ctx.closePath();
    ctx.strokeStyle = '#1d1c30'; ctx.lineWidth = 14; ctx.stroke();
    ctx.strokeStyle = '#34324f'; ctx.lineWidth = 2; ctx.stroke();
    drawLine();

    const order = standing(t);
    const comparing = picks.length > 0;
    spots = [];
    // back of the field first so the leaders sit on top, picked cars on top of all
    const drawOrder = order.slice().reverse().sort((a, b) => picks.includes(a.id) - picks.includes(b.id));
    drawOrder.forEach(({ id, out: gone }) => {
      const p = gone ? null : at(id, t);
      if (!p) return;
      const X = px(p[0]), Y = py(p[1]);
      const mine = picks.includes(id);
      spots.push({ id, X, Y });
      ctx.globalAlpha = comparing && !mine ? 0.3 : 1;
      ctx.beginPath();
      ctx.arc(X, Y, mine ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = cars[id].color;
      ctx.fill();
      ctx.lineWidth = mine ? 3 : 1.5;
      ctx.strokeStyle = mine ? ringOf(id) : INK;
      ctx.stroke();
      // in the pit lane: a dashed amber ring
      if (inPit(id, t)) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.arc(X, Y, (mine ? 8 : 5.5) + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFB547'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.globalAlpha = 1;

    // names beside the dots, moved around so they don't sit on each other
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const taken = [];
    const free = (x, y, w, h) => !taken.some(r => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
    const leader = order[0] && order[0].id;
    const wanted = spots.slice().reverse().filter(s => names === 'all' ? (!comparing || picks.includes(s.id) || s.id === leader)
      : picks.includes(s.id) || s.id === leader);
    // picked cars claim their spot first
    wanted.sort((a, b) => picks.includes(b.id) - picks.includes(a.id));
    // a car in the pits always gets its name
    spots.forEach(sp => { if (inPit(sp.id, t) && !wanted.includes(sp)) wanted.push(sp); });
    wanted.forEach(({ id, X, Y }) => {
      const text = byId.get(id).code + (inPit(id, t) ? ' PIT' : '');
      const w = ctx.measureText(text).width + 8, h = 16;
      const tries = [[9, -h / 2], [-9 - w, -h / 2], [-w / 2, -9 - h], [-w / 2, 9]];
      const spot = tries.map(([dx, dy]) => [X + dx, Y + dy]).find(([x, y]) => free(x, y, w, h));
      if (!spot && !picks.includes(id)) return;
      const [x, y] = spot || [X + 9, Y - h / 2];
      taken.push({ x, y, w, h });
      ctx.fillStyle = 'rgba(7,7,13,.85)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = picks.includes(id) ? ringOf(id) : inPit(id, t) ? '#FFB547' : '#d9d6ee';
      ctx.fillText(text, x + 4, y + h / 2 + 1);
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
    const pick = () => toggle(id);
    row.addEventListener('click', pick);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    rows[id] = row;
  });
  tower.replaceChildren(...ids.map(id => rows[id]));

  const outNote = id => whyOut(id) === 'DNS' ? 'Did not start' : 'Lap ' + Math.max(1, byId.get(id).laps + 1);

  // cars out of the race leave the track and line up in a box beside it
  const outBox = $('replay-out');
  let outKey = '';
  function drawOut() {
    const gone = ids.filter(id => out(id, t)).sort((a, b) => outAt[a] - outAt[b]);
    const key = gone.join();
    if (key === outKey) return;
    outKey = key;
    outBox.hidden = !gone.length;
    outBox.replaceChildren(el('li', { class: 'out-head' }, 'Out of the race'), ...gone.map(id => el('li', null,
      el('span', { class: 'feed-dot', style: 'background:' + cars[id].color }),
      el('span', { class: 'out-code' }, byId.get(id).code),
      el('span', { class: 'out-why out-' + whyOut(id).toLowerCase() }, whyOut(id)),
      el('span', { class: 'out-lap' }, whyOut(id) === 'DNS' ? '' : 'L' + Math.max(1, byId.get(id).laps + 1)))));
  }

  function drawTower() {
    const order = standing(t);
    order.forEach(({ id, out: gone }, i) => {
      const row = rows[id];
      const [pos, , , gap, tyre] = row.children;
      pos.textContent = gone ? whyOut(id) : PF.pad2(i + 1);
      pos.classList.toggle('tw-why', gone);
      const g = latest(data.gaps[id], t);
      const pit = inPit(id, t);
      gap.textContent = gone ? outNote(id) : pit ? 'In pit' : i === 0 ? 'Leader'
        : g && g[1] != null ? (typeof g[1] === 'number' ? '+' + g[1].toFixed(1) : g[1]) : '';
      gap.classList.toggle('tw-pit', pit && !gone);
      const ty = gone ? null : tyreAt(id, t);
      tyre.replaceChildren(...(ty && ty.comp !== 'UNKNOWN' ? [
        el('span', { class: 'stint-key tyre-' + ty.comp.toLowerCase() }, ty.comp[0]),
        el('span', { class: 'tw-age' }, String(ty.age))] : []));
      row.classList.toggle('tw-out', gone);
      row.classList.toggle('tw-follow', picks.includes(id));
      row.style.setProperty('--ring', ringOf(id) || 'transparent');
      // a smooth slide when places change
      row.style.transform = 'translateY(' + (i * 30) + 'px)';
    });
    tower.style.height = ids.length * 30 + 'px';
  }

  // ---- what just happened: pit stops, lead changes, retirements, the flag ----
  const events = [];
  pitStops.forEach(([id, s, lane]) => events.push({ t: s, kind: 'pit', id,
    text: byId.get(id).code + ' pits on lap ' + Math.max(1, lapOf(id, s)) + ', ' + lane.toFixed(1) + 's in the lane' }));
  ids.forEach(id => {
    if (id in outAt) events.push({ t: outAt[id], kind: 'out', id,
      text: whyOut(id) === 'DNS' ? byId.get(id).code + ' did not start'
        : byId.get(id).code + (whyOut(id) === 'DSQ' ? ' is disqualified' : ' retires') + ' on lap ' + Math.max(1, byId.get(id).laps + 1) });
    (data.order[id] || []).forEach(([s, pos]) => { if (pos === 1) events.push({ t: s, kind: 'p1', id }); });
  });
  // keep only the moments the lead changed hands
  events.sort((a, b) => a.t - b.t);
  let holder = null;
  const feed = [];
  events.forEach(e => {
    if (e.kind !== 'p1') { feed.push(e); return; }
    if (e.id !== holder) {
      if (holder !== null && e.t > 5) feed.push({ ...e, text: byId.get(e.id).code + ' takes the lead on lap ' + Math.max(1, lapOf(e.id, e.t)) });
      holder = e.id;
    }
  });
  if (finishLine[winner]) feed.push({ t: finishLine[winner].t, kind: 'flag', id: winner, text: byId.get(winner).code + ' takes the chequered flag' });
  feed.sort((a, b) => a.t - b.t);
  const feedBox = $('replay-feed');
  let feedKey = '';
  function drawFeed() {
    // the last few things within three minutes of race time
    const recent = feed.filter(e => e.t <= t && e.t > t - 180).slice(-4).reverse();
    const key = recent.map(e => e.t + e.id).join();
    if (key === feedKey) return;
    feedKey = key;
    feedBox.replaceChildren(...recent.map(e => el('li', { class: 'feed-' + e.kind },
      el('span', { class: 'feed-dot', style: 'background:' + cars[e.id].color }), e.text)));
  }

  // ---- lap, flags, clock ----
  function drawStatus() {
    const lap = Math.min(totalLaps, Math.max(...ids.map(id => lapOf(id, t))));
    const done = finishLine[winner] ? t >= finishLine[winner].t : t >= (data.laps[winner] || []).at(-1) + 60 || t >= end;
    $('replay-lap').textContent = done ? 'Chequered flag' : lap ? 'Lap ' + lap + ' of ' + totalLaps : 'Lights out';
    const p = (race.periods || []).find(([, a, b]) => lap >= a && lap <= b);
    const flag = $('replay-flag');
    flag.hidden = !p || done;
    if (p) { flag.textContent = { SC: 'Safety car', VSC: 'Virtual safety car', RED: 'Red flag' }[p[0]] || p[0]; flag.className = 'replay-flag mono flag-' + p[0].toLowerCase(); }
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    $('replay-time').textContent = Math.floor(m / 60) + ':' + PF.pad2(m % 60) + ':' + PF.pad2(s);
    $('replay-seek').value = String(Math.round(t));
    if (chart) chart.cursor(lapsDone(t));
    if (done) showFindings();
  }

  // ---- picking and comparing ----
  function toggle(id) {
    if (picks.includes(id)) picks = picks.filter(p => p !== id);
    else picks = [...picks, id].slice(-2);
    if (chart) picks.forEach(p => chart.follow(p));
    syncPickers();
    render();
  }
  const selA = $('cmp-a'), selB = $('cmp-b');
  const byGrid = ids.slice().sort((a, b) => (byId.get(a).order || 99) - (byId.get(b).order || 99));
  [selA, selB].forEach((sel, k) => {
    sel.replaceChildren(el('option', { value: '' }, k ? 'Driver B' : 'Driver A'),
      ...byGrid.map(id => el('option', { value: id }, byId.get(id).code + ', ' + byId.get(id).name)));
    sel.addEventListener('change', () => {
      // the two boxes are the pair, a driver can't be picked twice
      picks = [...new Set([selA.value, selB.value].filter(Boolean))];
      if (chart) picks.forEach(p => chart.follow(p));
      syncPickers();
      render();
    });
  });
  function syncPickers() {
    selA.value = picks[0] || '';
    selB.value = picks[1] || '';
    $('cmp-clear').hidden = !picks.length;
  }
  $('cmp-clear').addEventListener('click', () => { picks = []; syncPickers(); render(); });
  $('name-mode').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    names = b.dataset.names;
    $('name-mode').querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    drawMap();
  }));

  const fmtLap = ms => { const m = Math.floor(ms / 60000); return m + ':' + ((ms % 60000) / 1000).toFixed(3).padStart(6, '0'); };
  function drawCompare() {
    const box = $('compare');
    if (picks.length < 2) {
      box.hidden = picks.length === 0;
      box.replaceChildren(picks.length ? el('p', { class: 'cmp-hint' }, 'Pick a second driver to compare.') : '');
      return;
    }
    const order = standing(t);
    const info = id => {
      const i = order.findIndex(o => o.id === id);
      const gone = order[i].out;
      const lap = lapOf(id, t);
      const done = (race.drivers && race.drivers[id] || []).slice(0, Math.max(0, lap - 1)).map(r => r[1]).filter(Boolean);
      const g = latest(data.gaps[id], t);
      return {
        gone, pos: gone ? 'Out' : 'P' + (i + 1), gap: i === 0 ? 0 : g && typeof g[1] === 'number' ? g[1] : null,
        lapped: g && typeof g[1] === 'string' ? g[1] : null,
        tyre: gone ? null : tyreAt(id, t), pit: inPit(id, t),
        stops: data.pits.filter(([d, s]) => d === id && s <= t).length,
        last: done.length ? fmtLap(done[done.length - 1]) : '–',
        best: done.length ? fmtLap(Math.min(...done)) : '–',
      };
    };
    const [a, b] = picks, A = info(a), B = info(b);
    let head;
    if (A.gone || B.gone) head = (A.gone ? byId.get(a).code : byId.get(b).code) + ' is out of the race';
    else if (A.gap != null && B.gap != null) {
      const d = B.gap - A.gap;
      const ahead = d >= 0 ? a : b;
      head = byId.get(ahead).code + ' is ' + Math.abs(d).toFixed(1) + 's ahead';
    } else head = (A.lapped || B.lapped) ? 'A lap or more apart' : 'Gap comes once the timing starts';
    const tyre = x => x.tyre && x.tyre.comp !== 'UNKNOWN'
      ? [el('span', { class: 'stint-key tyre-' + x.tyre.comp.toLowerCase() }, x.tyre.comp[0]), ' ' + x.tyre.age + ' laps'] : ['–'];
    const row = (label, va, vb) => [el('span', { class: 'cmp-v' }, ...[].concat(va)), el('span', { class: 'cmp-k mono' }, label), el('span', { class: 'cmp-v' }, ...[].concat(vb))];
    box.hidden = false;
    box.replaceChildren(
      el('div', { class: 'cmp-top' },
        el('span', { class: 'cmp-name', style: '--ring:' + RING[0] }, byId.get(a).name),
        el('span', { class: 'cmp-head' }, head),
        el('span', { class: 'cmp-name cmp-right', style: '--ring:' + RING[1] }, byId.get(b).name)),
      el('div', { class: 'cmp-grid' },
        ...row('Position', A.pos + (A.pit ? ', in the pits' : ''), B.pos + (B.pit ? ', in the pits' : '')),
        ...row('Tyre', tyre(A), tyre(B)),
        ...row('Stops', String(A.stops), String(B.stops)),
        ...row('Last lap', A.last, B.last),
        ...row('Best so far', A.best, B.best)));
  }

  // hover a dot for who it is, click it to pick it
  const tip = $('replay-tip');
  const nearest = ev => {
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = null, d = 15;
    spots.forEach(s => { const k = Math.hypot(s.X - mx, s.Y - my); if (k < d) { d = k; best = s; } });
    return best && { ...best, mx, my };
  };
  canvas.addEventListener('pointermove', ev => {
    const s = nearest(ev);
    canvas.style.cursor = s ? 'pointer' : '';
    if (!s) { tip.hidden = true; return; }
    const r = byId.get(s.id), i = standing(t).findIndex(o => o.id === s.id);
    tip.replaceChildren(el('b', null, 'P' + (i + 1) + ' ' + r.code), ' ' + r.name, el('br'), el('span', { class: 'dim' }, r.team));
    tip.hidden = false;
    tip.style.left = Math.min(s.mx + 14, W - 180) + 'px';
    tip.style.top = (s.my + 14) + 'px';
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('click', ev => { const s = nearest(ev); if (s) toggle(s.id); });

  function render() { drawMap(); drawTower(); drawStatus(); drawCompare(); drawFeed(); drawOut(); }

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

  $('replay-share-slot').replaceWith(PF.shareButton(() => {
    const q = new URLSearchParams({ t: Math.round(t) });
    if (picks.length) q.set('d', picks.join(','));
    return { title: year + ' ' + race.name + ' replay', text: 'Lap ' + lapsDone(t) + ' of the ' + year + ' ' + race.name, url: '/races/' + year + '/' + round + '?' + q };
  }, 'Share this moment'));
  syncPickers();
  if (chart) picks.forEach(p => chart.follow(p));
  if (params.has('t')) $('replay-panel').scrollIntoView({ block: 'start' });
  size();
  render();
  let timer;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { size(); render(); }, 150); });
};
