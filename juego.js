/* =========================================================
   Salto Nido · minijuego de reto para Nido
   Teléfono: inclinar a los lados (o tocar izquierda/derecha)
   Computadora: flechas ← → o teclas A / D
   ========================================================= */
(function () {
  'use strict';
  let root, cv, ctx, W = 0, H = 0, dpr = 1, raf = 0, last = 0;
  let state = 'idle'; // idle | play | over
  let P, plats, camY, startY, score, best, bestName, opts = {};
  let BRAND = '#2e7a5c', tilt = 0, gotOrient = false, keys = {}, touchDir = 0, hintTimer = 0, savedThisRound = false;

  const JUMP = -11.6, SPRING = -18, GRAV = 0.38;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function build() {
    root = el('div'); root.id = 'game'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Salto Nido');
    cv = el('canvas'); ctx = cv.getContext('2d');
    const hud = el('div', 'g-hud', `<div><div class="sc" id="g-score">0</div><div class="rec" id="g-rec"></div></div>
      <button id="g-close" aria-label="Salir"><svg class="ic"><use href="#i-x"/></svg></button>`);
    const panel = el('div', 'g-panel'); panel.id = 'g-panel';
    const hint = el('div', 'g-hint'); hint.id = 'g-hint';
    root.append(cv, hud, panel, hint);
    document.body.appendChild(root);
    root.querySelector('#g-close').onclick = close;

    addEventListener('resize', resize);
    addEventListener('deviceorientation', e => {
      if (e.gamma == null) return;
      gotOrient = true;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      tilt = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
    });
    addEventListener('keydown', e => { if (!root.classList.contains('on')) return; keys[e.key.toLowerCase()] = true;
      if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') play(); if (e.key === 'Escape') close(); });
    addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
    cv.addEventListener('pointerdown', e => { touchDir = e.clientX < W / 2 ? -1 : 1; });
    addEventListener('pointerup', () => { touchDir = 0; });
    addEventListener('pointercancel', () => { touchDir = 0; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') { cancelAnimationFrame(raf); raf = 0; } else if (!document.hidden && state === 'play' && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth; H = root.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state !== 'play') draw();
  }

  function panel(html) { const p = root.querySelector('#g-panel'); p.innerHTML = html; p.style.display = html ? 'block' : 'none'; }
  function hint(t) { const h = root.querySelector('#g-hint'); h.textContent = t || ''; }
  function fmt(n) { return Number(n).toLocaleString('es-CR'); }

  function open(o) {
    BRAND = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#2e7a5c').trim();
    opts = o || {}; best = opts.best || 0; bestName = opts.bestName || '';
    if (!root) build();
    root.classList.add('on'); document.body.classList.add('locked');
    resize(); reset(); state = 'idle'; draw();
    root.querySelector('#g-score').textContent = '0';
    root.querySelector('#g-rec').textContent = best ? `Récord ${fmt(best)}${bestName ? ' · ' + bestName : ''}` : '';
    const touch = matchMedia('(pointer:coarse)').matches;
    panel(`<h3>Salto Nido</h3>
      <p>${touch ? 'Inclina el teléfono para moverte. También podés tocar a la izquierda o a la derecha.' : 'Movete con las flechas ← → o con las teclas A y D.'}<br>Subí lo más alto que podás y superá el récord de la casa.</p>
      ${opts.week ? `<div class="g-week">${opts.week}</div>` : ''}
      <button class="btn btn-primary btn-block" id="g-play">Jugar</button>`);
    root.querySelector('#g-play').onclick = play;
    hint('');
  }

  function close() {
    cancelAnimationFrame(raf); raf = 0; state = 'idle';
    root.classList.remove('on');
    if (!document.querySelector('.overlay.open')) document.body.classList.remove('locked');
    if (opts.onClose) opts.onClose();
  }

  async function askMotion() {
    // iPhone pide permiso para leer la inclinación; debe pedirse con un toque
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* si lo niega, queda el control por toque */ }
  }

  async function play() {
    if (state === 'play') return;
    await askMotion();
    reset(); panel(''); state = 'play'; savedThisRound = false;
    clearTimeout(hintTimer);
    if (matchMedia('(pointer:coarse)').matches) {
      hintTimer = setTimeout(() => { if (!gotOrient && state === 'play') hint('Tocá a la izquierda o a la derecha para moverte'); }, 1500);
    }
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function reset() {
    P = { x: W / 2 - 18, y: H - 120, w: 36, h: 36, vx: 0, vy: JUMP, face: 1, squash: 0 };
    camY = 0; startY = P.y; score = 0; plats = [];
    plats.push({ x: W / 2 - 40, y: H - 60, w: 80, t: 'n' });
    let y = H - 60;
    while (y > -H) { y -= gap(); plats.push(newPlat(y)); }
  }
  function gap() { const lvl = Math.min(1, score / 2500); return 58 + Math.random() * (40 + lvl * 32); }
  function newPlat(y) {
    const w = Math.max(54, 74 - Math.min(20, score / 150));
    const r = Math.random(); let t = 'n';
    if (score > 250 && r < 0.18) t = 'm';
    else if (r > 0.94) t = 's';
    return { x: Math.random() * (W - w), y, w, t, vx: t === 'm' ? (Math.random() < .5 ? -1 : 1) * (1 + Math.min(1.5, score / 1500)) : 0 };
  }

  function loop(now) {
    const f = Math.min(2.5, (now - last) / 16.667); last = now;
    step(f); draw();
    if (state === 'play') raf = requestAnimationFrame(loop);
  }

  function step(f) {
    // Entrada
    let target = 0;
    if (keys['arrowleft'] || keys['a']) target = -6.5;
    else if (keys['arrowright'] || keys['d']) target = 6.5;
    else if (touchDir) target = touchDir * 6.5;
    else if (gotOrient) target = Math.max(-9, Math.min(9, tilt * 0.33));
    P.vx += (target - P.vx) * Math.min(1, 0.28 * f);
    if (Math.abs(P.vx) > 0.4) P.face = P.vx > 0 ? 1 : -1;

    // Física
    const prevBottom = P.y + P.h;
    P.vy += GRAV * f; P.x += P.vx * f; P.y += P.vy * f;
    if (P.x + P.w < 0) P.x = W; else if (P.x > W) P.x = -P.w;
    P.squash = Math.max(0, P.squash - 0.08 * f);

    for (const p of plats) {
      if (p.t === 'm') { p.x += p.vx * f; if (p.x < 0 || p.x + p.w > W) { p.vx *= -1; p.x = Math.max(0, Math.min(W - p.w, p.x)); } }
      if (P.vy > 0 && prevBottom <= p.y + 2 && P.y + P.h >= p.y && P.x + P.w > p.x + 4 && P.x < p.x + p.w - 4) {
        P.y = p.y - P.h; P.vy = p.t === 's' ? SPRING : JUMP; P.squash = 1;
        try { if (p.t === 's' && navigator.vibrate) navigator.vibrate(15); } catch (e) {}
      }
    }

    // Cámara y puntaje
    const lim = camY + H * 0.4;
    if (P.y < lim) camY = P.y - H * 0.4;
    score = Math.max(score, Math.floor((startY - P.y) / 6));
    root.querySelector('#g-score').textContent = fmt(score);

    plats = plats.filter(p => p.y < camY + H + 40);
    let top = Math.min(...plats.map(p => p.y));
    while (top > camY - 80) { top -= gap(); plats.push(newPlat(top)); }

    if (P.y - camY > H + 40) over();
  }

  function over() {
    state = 'over'; cancelAnimationFrame(raf); raf = 0; hint('');
    const record = score > best;
    if (!savedThisRound && opts.onEnd && score > 0) { savedThisRound = true; opts.onEnd(score); }
    if (record) { best = score; bestName = opts.me || ''; root.querySelector('#g-rec').textContent = `Récord ${fmt(best)}${bestName ? ' · ' + bestName : ''}`; }
    try { navigator.vibrate && navigator.vibrate(record ? [40, 60, 40] : 60); } catch (e) {}
    panel(`<h3>${record ? '¡Nuevo récord!' : '¡Buen salto!'}</h3>
      <p><span class="g-big">${fmt(score)}</span><br>${record ? 'Ahora el récord de la casa es tuyo.' : `El récord está en ${fmt(best)}${bestName ? ' (' + bestName + ')' : ''}.`}</p>
      <div style="display:flex;gap:10px"><button class="btn btn-quiet" style="flex:1" id="g-out">Salir</button><button class="btn btn-primary" style="flex:1" id="g-again">Otra vez</button></div>`);
    root.querySelector('#g-again').onclick = play;
    root.querySelector('#g-out').onclick = close;
  }

  // ---------- Dibujo ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function draw() {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const k = Math.min(1, (score || 0) / 4000);
    const br = hexRgb(BRAND); g.addColorStop(0, mix(mix3(br, [255, 255, 255], 0.78), [190, 205, 240], k)); g.addColorStop(1, mix([246, 245, 241], [226, 236, 246], k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Nubes suaves
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 5; i++) {
      const cy = ((i * 260 - camY * 0.3) % (H + 200) + H + 200) % (H + 200) - 100;
      const cx = (i * 137) % Math.max(1, W - 80);
      ctx.beginPath(); ctx.ellipse(cx + 40, cy, 46, 16, 0, 0, Math.PI * 2); ctx.ellipse(cx + 70, cy - 8, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (!P) return;

    for (const p of plats) {
      const y = p.y - camY;
      ctx.fillStyle = p.t === 'm' ? (BRAND === '#3d6fc2' ? '#7259b8' : '#3d6fc2') : BRAND;
      rr(p.x, y, p.w, 12, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(p.x + 4, y + 2, p.w - 8, 3, 2); ctx.fill();
      if (p.t === 's') { ctx.fillStyle = '#c4483a'; rr(p.x + p.w / 2 - 9, y - 9, 18, 9, 3); ctx.fill(); }
    }

    // Personaje: un pollito redondo
    const x = P.x, y = P.y - camY, s = P.squash * 0.18;
    const w = P.w * (1 + s), h = P.h * (1 - s);
    const cx = x + P.w / 2, by = y + P.h;
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.ellipse(cx, by + 2, w * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2b632'; ctx.beginPath(); ctx.ellipse(cx, by - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e39d1c'; ctx.beginPath(); ctx.ellipse(cx - P.face * 8, by - h * 0.42, 8, 6, P.face * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + P.face * 6, by - h * 0.66, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d1c19'; ctx.beginPath(); ctx.arc(cx + P.face * 7.5, by - h * 0.66, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0602a'; ctx.beginPath(); ctx.moveTo(cx + P.face * 15, by - h * 0.55); ctx.lineTo(cx + P.face * 23, by - h * 0.5); ctx.lineTo(cx + P.face * 15, by - h * 0.43); ctx.closePath(); ctx.fill();
  }
  function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0); }
  function mix3(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  function mix(a, b, t) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }

  window.NidoJuego = { open };
})();
