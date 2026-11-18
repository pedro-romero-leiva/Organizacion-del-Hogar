/* =========================================================
   Salto Nido · minijuego de reto para Nido
   Teléfono: inclinar para moverse · tocar la pantalla para disparar
             (sin sensor: tocar abajo a los lados para moverse)
   Computadora: ← → o A / D para moverse · espacio, ↑ o clic para disparar
   Enemigos: zancudos que vuelan y pelusas de polvo.
   Se eliminan con un disparo o cayéndoles encima. Si te tocan, perdés.
   ========================================================= */
(function () {
  'use strict';
  let root, cv, ctx, W = 0, H = 0, dpr = 1, raf = 0, last = 0, T = 0;
  let state = 'idle'; // idle | play | dying | over
  let P, plats, foes, shots, puffs, camY, startY, height, bonus, kills, best, bestName, opts = {};
  let BRAND = '#2e7a5c', tilt = 0, gotOrient = false, keys = {}, moveDir = 0, movePointer = null, hintTimer = 0, savedThisRound = false, lastShot = 0;

  const JUMP = -11.6, SPRING = -18, STOMP = -13, GRAV = 0.38, SHOT_SPEED = 13, SHOT_COOLDOWN = 220;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const touchDevice = () => matchMedia('(pointer:coarse)').matches;
  const score = () => height + bonus;

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
    addEventListener('keydown', e => {
      if (!root.classList.contains('on')) return;
      const k = e.key.toLowerCase(); keys[k] = true;
      if (state === 'play' && (k === ' ' || k === 'arrowup' || k === 'w')) { e.preventDefault(); shoot(null); }
      else if ((k === ' ' || k === 'enter') && (state === 'idle' || state === 'over')) play();
      if (k === 'escape') close();
    });
    addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    // Tocar: dispara hacia el punto tocado. Sin sensor de inclinación, la franja de abajo sirve para moverse.
    cv.addEventListener('pointerdown', e => {
      if (state !== 'play') return;
      e.preventDefault();
      const moveZone = touchDevice() && !gotOrient && e.clientY > H * 0.72;
      if (moveZone) { moveDir = e.clientX < W / 2 ? -1 : 1; movePointer = e.pointerId; return; }
      shoot({ x: e.clientX, y: e.clientY });
    });
    const release = e => { if (e.pointerId === movePointer) { moveDir = 0; movePointer = null; } };
    addEventListener('pointerup', release); addEventListener('pointercancel', release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
      else if (!document.hidden && (state === 'play' || state === 'dying') && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth; H = root.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state !== 'play') draw();
  }

  function panel(html) { const p = root.querySelector('#g-panel'); p.innerHTML = html; p.style.display = html ? 'block' : 'none'; }
  function hint(t) { root.querySelector('#g-hint').textContent = t || ''; }
  function fmt(n) { return Number(n).toLocaleString('es-CR'); }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

  function open(o) {
    BRAND = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#2e7a5c').trim() || '#2e7a5c';
    opts = o || {}; best = opts.best || 0; bestName = opts.bestName || '';
    if (!root) build();
    root.classList.add('on'); document.body.classList.add('locked');
    resize(); reset(); state = 'idle'; draw();
    root.querySelector('#g-score').textContent = '0';
    root.querySelector('#g-rec').textContent = best ? `Récord ${fmt(best)}${bestName ? ' · ' + bestName : ''}` : '';
    panel(`<h3>Salto Nido</h3>
      <p>${touchDevice()
        ? 'Inclina el teléfono para moverte y <b>tocá la pantalla para disparar</b> hacia donde tocás.'
        : 'Movete con ← → y <b>disparás con espacio o con un clic</b> hacia donde apuntás.'}<br>
      Cuidado con los zancudos y las pelusas: eliminalos con un disparo o cayéndoles encima.</p>
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
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* sin permiso: queda el control por toque */ }
  }

  async function play() {
    if (state === 'play') return;
    await askMotion();
    reset(); panel(''); state = 'play'; savedThisRound = false;
    clearTimeout(hintTimer);
    if (touchDevice()) {
      hint('Tocá la pantalla para disparar');
      hintTimer = setTimeout(() => {
        if (state !== 'play') return;
        hint(gotOrient ? '' : 'Sin sensor: tocá abajo a la izquierda o a la derecha para moverte');
      }, 2200);
    }
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function reset() {
    P = { x: W / 2 - 18, y: H - 120, w: 36, h: 36, vx: 0, vy: JUMP, face: 1, squash: 0, aim: 0, hurt: false };
    camY = 0; startY = P.y; height = 0; bonus = 0; kills = 0; plats = []; foes = []; shots = []; puffs = [];
    plats.push({ x: W / 2 - 40, y: H - 60, w: 80, t: 'n' });
    let y = H - 60;
    while (y > -H) { y -= gap(); addPlat(y); }
  }

  // ---------- Mundo ----------
  function gap() { const lvl = Math.min(1, height / 2500); return 58 + Math.random() * (40 + lvl * 32); }
  function addPlat(y) {
    const w = Math.max(54, 74 - Math.min(20, height / 150));
    const r = Math.random(); let t = 'n';
    if (height > 250 && r < 0.18) t = 'm';
    else if (r > 0.94) t = 's';
    const p = { x: Math.random() * (W - w), y, w, t, vx: t === 'm' ? (Math.random() < .5 ? -1 : 1) * (1 + Math.min(1.5, height / 1500)) : 0 };
    plats.push(p);
    // Enemigos: aparecen desde los 300 puntos y se vuelven más frecuentes
    if (height > 300 && y < camY - 40) {
      const chance = Math.min(0.16, 0.04 + height / 25000);
      const lastFoe = foes.length ? foes[foes.length - 1].y : Infinity;
      if (Math.random() < chance && lastFoe - y > 260) {
        if (Math.random() < 0.55) foes.push({ k: 'z', x: Math.random() * (W - 40), y: y - 70, w: 38, h: 28, vx: (Math.random() < .5 ? -1 : 1) * (1.2 + Math.min(1.6, height / 3000)), ph: Math.random() * 6 });
        else if (p.t !== 's') foes.push({ k: 'p', plat: p, ox: Math.random() * Math.max(0, p.w - 34), x: p.x, y: y - 30, w: 34, h: 30, ph: Math.random() * 6 });
      }
    }
  }

  function shoot(target) {
    const now = performance.now();
    if (now - lastShot < SHOT_COOLDOWN || state !== 'play') return;
    lastShot = now;
    const sx = P.x + P.w / 2, sy = P.y + 8;
    let dx = 0, dy = -1;
    if (target) {
      dx = target.x - sx; dy = (target.y + camY) - sy;
      if (dy > -20) dy = -20; // siempre hacia arriba, como un tirachinas
      const m = Math.hypot(dx, dy); dx /= m; dy /= m;
    }
    shots.push({ x: sx, y: sy, vx: dx * SHOT_SPEED, vy: dy * SHOT_SPEED, life: 70 });
    P.aim = 8; P.face = dx < -0.2 ? -1 : dx > 0.2 ? 1 : P.face;
    buzz(8);
  }

  function kill(f, how) {
    f.dead = true; kills++; bonus += how === 'stomp' ? 60 : 40;
    for (let i = 0; i < 10; i++) puffs.push({ x: f.x + f.w / 2, y: f.y + (f.yy || 0) + f.h / 2, vx: (Math.random() - .5) * 6, vy: (Math.random() - .7) * 6, life: 26, c: f.k === 'z' ? '#5b6170' : '#b9b2a2' });
    buzz(how === 'stomp' ? 25 : 15);
  }

  function loop(now) {
    const f = Math.min(2.5, (now - last) / 16.667); last = now; T += f;
    step(f); draw();
    if (state === 'play' || state === 'dying') raf = requestAnimationFrame(loop);
  }

  function step(f) {
    let target = 0;
    if (state === 'play') {
      if (keys['arrowleft'] || keys['a']) target = -6.5;
      else if (keys['arrowright'] || keys['d']) target = 6.5;
      else if (moveDir) target = moveDir * 6.5;
      else if (gotOrient) target = Math.max(-9, Math.min(9, tilt * 0.33));
    }
    P.vx += (target - P.vx) * Math.min(1, 0.28 * f);
    if (Math.abs(P.vx) > 0.4 && !P.aim) P.face = P.vx > 0 ? 1 : -1;
    P.aim = Math.max(0, P.aim - f);

    const prevBottom = P.y + P.h;
    P.vy += GRAV * f; P.x += P.vx * f; P.y += P.vy * f;
    if (P.x + P.w < 0) P.x = W; else if (P.x > W) P.x = -P.w;
    P.squash = Math.max(0, P.squash - 0.08 * f);

    // Plataformas
    for (const p of plats) {
      if (p.t === 'm') { p.x += p.vx * f; if (p.x < 0 || p.x + p.w > W) { p.vx *= -1; p.x = Math.max(0, Math.min(W - p.w, p.x)); } }
      if (state === 'play' && P.vy > 0 && prevBottom <= p.y + 2 && P.y + P.h >= p.y && P.x + P.w > p.x + 4 && P.x < p.x + p.w - 4) {
        P.y = p.y - P.h; P.vy = p.t === 's' ? SPRING : JUMP; P.squash = 1;
        if (p.t === 's') buzz(15);
      }
    }

    // Enemigos
    for (const e of foes) {
      if (e.dead) continue;
      if (e.k === 'z') { e.x += e.vx * f; if (e.x < 0 || e.x + e.w > W) { e.vx *= -1; e.x = Math.max(0, Math.min(W - e.w, e.x)); } e.yy = Math.sin((T + e.ph * 20) * 0.08) * 6; }
      else { e.x = e.plat.x + e.ox; e.y = e.plat.y - e.h; e.yy = 0; }
      if (state !== 'play') continue;
      const ey = e.y + (e.yy || 0);
      const hit = P.x + P.w - 6 > e.x && P.x + 6 < e.x + e.w && P.y + P.h > ey + 4 && P.y + 4 < ey + e.h;
      if (hit) {
        if (P.vy > 0 && prevBottom <= ey + 12) { kill(e, 'stomp'); P.vy = STOMP; P.squash = 1; }
        else die();
      }
    }

    // Disparos
    for (const s of shots) {
      s.x += s.vx * f; s.y += s.vy * f; s.life -= f;
      for (const e of foes) {
        if (e.dead || s.life <= 0) continue;
        const ey = e.y + (e.yy || 0);
        if (s.x > e.x - 4 && s.x < e.x + e.w + 4 && s.y > ey - 4 && s.y < ey + e.h + 4) { kill(e, 'shot'); s.life = 0; }
      }
    }
    shots = shots.filter(s => s.life > 0 && s.y > camY - 40 && s.x > -20 && s.x < W + 20);
    puffs.forEach(p => { p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.25 * f; p.life -= f; });
    puffs = puffs.filter(p => p.life > 0);

    // Cámara y puntaje
    if (state === 'play') {
      if (P.y < camY + H * 0.4) camY = P.y - H * 0.4;
      height = Math.max(height, Math.floor((startY - P.y) / 6));
      root.querySelector('#g-score').textContent = fmt(score());
    }

    plats = plats.filter(p => p.y < camY + H + 40);
    foes = foes.filter(e => !e.dead && e.y < camY + H + 60 && (e.k !== 'p' || plats.includes(e.plat)));
    let top = Math.min(...plats.map(p => p.y));
    while (top > camY - 80) { top -= gap(); addPlat(top); }

    if (P.y - camY > H + 40) over();
  }

  function die() {
    if (state !== 'play') return;
    state = 'dying'; P.vy = -4; P.vx = 0; P.hurt = true; hint('');
    buzz([30, 40, 60]);
  }

  function over() {
    state = 'over'; cancelAnimationFrame(raf); raf = 0; hint('');
    const s = score(), record = s > best;
    root.querySelector('#g-score').textContent = fmt(s);
    if (!savedThisRound && opts.onEnd && s > 0) { savedThisRound = true; opts.onEnd(s); }
    if (record) { best = s; bestName = opts.me || ''; root.querySelector('#g-rec').textContent = `Récord ${fmt(best)}${bestName ? ' · ' + bestName : ''}`; }
    buzz(record ? [40, 60, 40] : 60);
    panel(`<h3>${record ? '¡Nuevo récord!' : P.hurt ? '¡Te atraparon!' : '¡Buen salto!'}</h3>
      <p><span class="g-big">${fmt(s)}</span><br>${kills ? `${kills === 1 ? '1 bicho eliminado' : kills + ' bichos eliminados'} · ` : ''}${record ? 'Ahora el récord de la casa es tuyo.' : `El récord está en ${fmt(best)}${bestName ? ' (' + bestName + ')' : ''}.`}</p>
      <div style="display:flex;gap:10px"><button class="btn btn-quiet" style="flex:1" id="g-out">Salir</button><button class="btn btn-primary" style="flex:1" id="g-again">Otra vez</button></div>`);
    root.querySelector('#g-again').onclick = play;
    root.querySelector('#g-out').onclick = close;
  }

  // ---------- Dibujo ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  function draw() {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const k = Math.min(1, (height || 0) / 4000);
    const br = hexRgb(BRAND);
    g.addColorStop(0, mix(mix3(br, [255, 255, 255], 0.78), [190, 205, 240], k)); g.addColorStop(1, mix([246, 245, 241], [226, 236, 246], k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

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

    for (const e of foes) drawFoe(e);

    // Disparos: semillas
    for (const s of shots) { circle(s.x, s.y - camY, 5, '#7a4b1f'); circle(s.x - 1.5, s.y - camY - 1.5, 1.8, 'rgba(255,255,255,.5)'); }
    for (const p of puffs) { ctx.globalAlpha = Math.max(0, p.life / 26); circle(p.x, p.y - camY, 4, p.c); ctx.globalAlpha = 1; }

    drawPlayer();
  }

  function drawFoe(e) {
    const x = e.x, y = e.y - camY + (e.yy || 0);
    if (e.k === 'z') {
      // Zancudo: cuerpo gris, alas que aletean, trompita
      const flap = Math.sin(T * 0.9 + e.ph) * 6, dir = e.vx > 0 ? 1 : -1;
      ctx.fillStyle = 'rgba(210,225,240,.85)';
      ctx.beginPath(); ctx.ellipse(x + 13, y + 6 - flap * 0.3, 10, 5 + Math.abs(flap) * 0.4, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 25, y + 6 - flap * 0.3, 10, 5 + Math.abs(flap) * 0.4, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a4f5c'; ctx.beginPath(); ctx.ellipse(x + 19, y + 16, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a4f5c'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x + 19 + dir * 11, y + 17); ctx.lineTo(x + 19 + dir * 22, y + 21); ctx.stroke();
      ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + 19 + i * 6, y + 22); ctx.lineTo(x + 17 + i * 8, y + 29); ctx.stroke(); }
      circle(x + 19 + dir * 6, y + 13, 3.5, '#fff'); circle(x + 19 + dir * 7, y + 13, 1.8, '#c4483a');
    } else {
      // Pelusa de polvo: bolita esponjosa con ojos enojados
      const wob = Math.sin(T * 0.12 + e.ph) * 1.5;
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; circle(x + 17 + Math.cos(a) * 12, y + 17 + Math.sin(a) * 11 + wob * 0.3, 7, '#b9b2a2'); }
      circle(x + 17, y + 17, 13, '#c9c2b2');
      circle(x + 12, y + 15, 3.6, '#fff'); circle(x + 22, y + 15, 3.6, '#fff');
      circle(x + 12.5, y + 16, 1.9, '#1d1c19'); circle(x + 21.5, y + 16, 1.9, '#1d1c19');
      ctx.strokeStyle = '#1d1c19'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 15, y + 12); ctx.moveTo(x + 26, y + 10); ctx.lineTo(x + 19, y + 12); ctx.stroke();
    }
  }

  function drawPlayer() {
    const x = P.x, y = P.y - camY, s = P.squash * 0.18;
    const w = P.w * (1 + s), h = P.h * (1 - s);
    const cx = x + P.w / 2, by = y + P.h, f = P.face;
    ctx.save();
    if (P.hurt) { ctx.translate(cx, by - h / 2); ctx.rotate(T * 0.3); ctx.translate(-cx, -(by - h / 2)); }
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.ellipse(cx, by + 2, w * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2b632'; ctx.beginPath(); ctx.ellipse(cx, by - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e39d1c'; ctx.beginPath(); ctx.ellipse(cx - f * 8, by - h * 0.42, 8, 6, f * 0.5, 0, Math.PI * 2); ctx.fill();
    const lookUp = P.aim > 0 ? -3 : 0;
    circle(cx + f * 6, by - h * 0.66 + lookUp, 6, '#fff');
    if (P.hurt) {
      ctx.strokeStyle = '#1d1c19'; ctx.lineWidth = 2; const ex = cx + f * 6, ey = by - h * 0.66;
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke();
    } else circle(cx + f * 7.5, by - h * 0.66 + lookUp * 1.3, 3, '#1d1c19');
    ctx.fillStyle = '#e0602a'; ctx.beginPath();
    if (P.aim > 0) { ctx.moveTo(cx - 5, by - h * 0.86); ctx.lineTo(cx, by - h - 6); ctx.lineTo(cx + 5, by - h * 0.86); }
    else { ctx.moveTo(cx + f * 15, by - h * 0.55); ctx.lineTo(cx + f * 23, by - h * 0.5); ctx.lineTo(cx + f * 15, by - h * 0.43); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0); }
  function mix3(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  function mix(a, b, t) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }

  window.NidoJuego = { open };
})();
