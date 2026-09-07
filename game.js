(() => {
  'use strict';

  const ROWS = 5;
  const COLS = 8;
  const FINAL_WAVE = 6;
  const menu = document.getElementById('menu');
  const game = document.getElementById('game');
  const board = document.getElementById('board');
  const entityLayer = document.getElementById('entities');
  const dropLayer = document.getElementById('drops');
  const defenderBar = document.getElementById('defenderBar');
  const nectarValue = document.getElementById('nectarValue');
  const heartValue = document.getElementById('heartValue');
  const waveText = document.getElementById('waveText');
  const waveFill = document.getElementById('waveFill');
  const statusText = document.getElementById('statusText');
  const toast = document.getElementById('toast');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const endOverlay = document.getElementById('endOverlay');
  const pauseBtn = document.getElementById('pauseBtn');

  const BUGS = {
    butterfly: { name:'Butterfly', icon:'🦋', cost:50, hp:90, cooldown:4.5, role:'Makes nectar', kind:'generator', rate:7.0, amount:35 },
    bee:       { name:'Bee', icon:'🐝', cost:100, hp:110, cooldown:4.0, role:'Fast shooter', kind:'shooter', rate:1.05, damage:22, shot:'sting' },
    ladybug:   { name:'Ladybug', icon:'🐞', cost:75, hp:430, cooldown:7.0, role:'Tough blocker', kind:'tank' },
    spider:    { name:'Spider', icon:'🕷️', cost:125, hp:115, cooldown:6.5, role:'Webs & slows', kind:'shooter', rate:1.65, damage:12, slow:0.52, slowTime:3.0, shot:'web' },
    beetle:    { name:'Bomb Beetle', icon:'🪲', cost:175, hp:145, cooldown:8.5, role:'Splash blast', kind:'shooter', rate:2.25, damage:40, splash:0.75, shot:'blast' },
    hopper:    { name:'Grasshopper', icon:'🦗', cost:150, hp:155, cooldown:6.0, role:'Kickback melee', kind:'melee', rate:1.8, damage:52, knockback:0.6 }
  };

  const ZOMBIES = {
    shambler: { name:'Shambler', icon:'🧟', hp:110, speed:0.125, damage:24, rate:1.15, reward:12 },
    tinhead:  { name:'Tinhead', icon:'🧟‍♂️', hp:245, speed:0.09, damage:28, rate:1.25, reward:22 },
    runner:   { name:'Runner', icon:'🧟‍♀️', hp:82, speed:0.19, damage:18, rate:0.95, reward:14 },
    brute:    { name:'Compost Brute', icon:'🧟', hp:390, speed:0.068, damage:42, rate:1.4, reward:35 }
  };

  const state = {
    running:false, paused:false, ended:false, nectar:175, hearts:3,
    wave:1, waveElapsed:0, waveDuration:24, waveSpawned:0, waveQuota:7,
    betweenWaves:0, defenders:[], zombies:[], drops:[], selected:null,
    cooldowns:{}, lastTime:0, ambientDropTimer:4, id:1, toastTimer:0
  };

  let raf = 0;

  function makeGrid() {
    board.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.setAttribute('role','gridcell');
        cell.setAttribute('aria-label', `Garden row ${r+1}, column ${c+1}`);
        cell.addEventListener('click', onCellTap);
        board.appendChild(cell);
      }
    }
  }

  function makeCards() {
    defenderBar.innerHTML = '';
    Object.entries(BUGS).forEach(([key, bug]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bug-card';
      btn.dataset.bug = key;
      btn.innerHTML = `<div class="top"><span class="bug-icon">${bug.icon}</span><span class="cost">🍯 ${bug.cost}</span></div><div class="name">${bug.name}</div><div class="role">${bug.role}</div><div class="cooldown"></div>`;
      btn.addEventListener('click', () => selectBug(key));
      defenderBar.appendChild(btn);
    });
  }

  function resetGame() {
    Object.assign(state, {
      running:true, paused:false, ended:false, nectar:175, hearts:3,
      wave:1, waveElapsed:0, waveDuration:24, waveSpawned:0,
      waveQuota:quotaForWave(1), betweenWaves:1.3, defenders:[], zombies:[],
      drops:[], selected:null, cooldowns:{}, ambientDropTimer:4,
      lastTime:performance.now(), id:1
    });
    entityLayer.innerHTML = '';
    dropLayer.innerHTML = '';
    endOverlay.classList.remove('show');
    pauseOverlay.classList.remove('show');
    endOverlay.setAttribute('aria-hidden','true');
    pauseOverlay.setAttribute('aria-hidden','true');
    statusText.textContent = 'Choose a bug, then tap a garden square.';
    updateUI();
    updateCardStates();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function quotaForWave(w) { return 5 + w * 2; }
  function durationForWave(w) { return Math.max(18, 25 - w * 0.7); }

  function startGame() {
    menu.classList.remove('active');
    game.classList.add('active');
    resetGame();
  }

  function selectBug(key) {
    if (!state.running || state.paused || state.ended) return;
    const bug = BUGS[key];
    if ((state.cooldowns[key] || 0) > 0) { showToast(`${bug.name} is catching its breath.`); return; }
    if (state.nectar < bug.cost) { showToast(`Need ${bug.cost - state.nectar} more nectar.`); return; }
    state.selected = state.selected === key ? null : key;
    updateCardStates();
    document.querySelectorAll('.cell').forEach(cell => cell.classList.toggle('placeable', !!state.selected));
    if (state.selected) statusText.textContent = `${bug.icon} ${bug.name} selected — tap an empty square.`;
  }

  function onCellTap(e) {
    if (!state.running || state.paused || state.ended || !state.selected) return;
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    if (col === 0) { showToast('Keep the first column clear for the garden gate.'); return; }
    if (state.defenders.some(d => d.row === row && d.col === col && d.hp > 0)) { showToast('That patch is already occupied.'); return; }
    const key = state.selected;
    const bug = BUGS[key];
    if (state.nectar < bug.cost || (state.cooldowns[key] || 0) > 0) return;
    state.nectar -= bug.cost;
    state.cooldowns[key] = bug.cooldown;
    state.defenders.push({
      id:state.id++, type:key, row, col, hp:bug.hp, maxHp:bug.hp,
      attackTimer:Math.random() * 0.25,
      genTimer:bug.kind === 'generator' ? bug.rate * 0.55 : 0
    });
    tone(360, .05);
    state.selected = null;
    document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('placeable'));
    statusText.textContent = `${bug.icon} ${bug.name} deployed.`;
    updateUI();
    updateCardStates();
    render();
  }

  function spawnZombie() {
    let pool = ['shambler'];
    if (state.wave >= 2) pool.push('runner');
    if (state.wave >= 3) pool.push('tinhead');
    if (state.wave >= 5) pool.push('brute');
    const weighted = pool.concat(state.wave >= 4 ? ['shambler','tinhead'] : ['shambler']);
    const type = weighted[Math.floor(Math.random() * weighted.length)];
    const z = ZOMBIES[type];
    state.zombies.push({ id:state.id++, type, row:Math.floor(Math.random()*ROWS), x:8.35, hp:z.hp, maxHp:z.hp, attackTimer:0, slowFactor:1, slowTimer:0 });
    state.waveSpawned++;
  }

  function spawnNectar(xPct, yPct, amount=25) {
    state.drops.push({ id:state.id++, x:xPct, y:yPct, amount, life:8 });
    renderDrops();
  }

  function collectDrop(id) {
    const i = state.drops.findIndex(d => d.id === id);
    if (i < 0) return;
    const drop = state.drops[i];
    state.nectar += drop.amount;
    state.drops.splice(i,1);
    tone(620,.04);
    updateUI();
    updateCardStates();
    renderDrops();
  }

  function update(dt) {
    if (!state.running || state.paused || state.ended) return;

    Object.keys(state.cooldowns).forEach(k => state.cooldowns[k] = Math.max(0, state.cooldowns[k] - dt));
    state.ambientDropTimer -= dt;
    if (state.ambientDropTimer <= 0) {
      spawnNectar(13 + Math.random()*77, 12 + Math.random()*72, 25);
      state.ambientDropTimer = 6.5 + Math.random()*2.5;
    }

    state.drops.forEach(d => d.life -= dt);
    state.drops = state.drops.filter(d => d.life > 0);

    if (state.betweenWaves > 0) {
      state.betweenWaves -= dt;
    } else {
      state.waveElapsed += dt;
      const spawnEvery = state.waveDuration / state.waveQuota;
      if (state.waveSpawned < state.waveQuota && state.waveElapsed >= state.waveSpawned * spawnEvery) spawnZombie();
    }

    for (const d of state.defenders) {
      if (d.hp <= 0) continue;
      const bug = BUGS[d.type];
      if (bug.kind === 'generator') {
        d.genTimer -= dt;
        if (d.genTimer <= 0) {
          spawnNectar(((d.col + .5) / COLS) * 100, ((d.row + .5) / ROWS) * 100, bug.amount);
          d.genTimer = bug.rate;
        }
        continue;
      }

      d.attackTimer -= dt;
      const candidates = state.zombies.filter(z => z.hp > 0 && z.row === d.row && z.x > d.col + .25).sort((a,b) => a.x - b.x);
      const target = candidates[0];
      if (!target || d.attackTimer > 0) continue;

      if (bug.kind === 'melee') {
        if (target.x - d.col <= 1.15) {
          hitZombie(target, bug.damage);
          target.x = Math.min(8.25, target.x + bug.knockback);
          d.attackTimer = bug.rate;
          flashProjectile(d, target, 'blast', .18);
          tone(190,.035);
        }
      } else {
        hitZombie(target, bug.damage);
        if (bug.slow) { target.slowFactor = bug.slow; target.slowTimer = bug.slowTime; }
        if (bug.splash) {
          state.zombies.forEach(other => {
            if (other.id !== target.id && other.hp > 0 && other.row === target.row && Math.abs(other.x - target.x) <= bug.splash) hitZombie(other, Math.round(bug.damage * .55));
          });
        }
        d.attackTimer = bug.rate;
        flashProjectile(d, target, bug.shot, .22);
        tone(bug.shot === 'web' ? 420 : bug.shot === 'blast' ? 210 : 520, .025);
      }
    }

    for (const z of state.zombies) {
      if (z.hp <= 0) continue;
      const info = ZOMBIES[z.type];
      z.attackTimer -= dt;
      if (z.slowTimer > 0) {
        z.slowTimer -= dt;
        if (z.slowTimer <= 0) z.slowFactor = 1;
      }
      const blocker = state.defenders.filter(d => d.hp > 0 && d.row === z.row && d.col < z.x && z.x - d.col < .62).sort((a,b) => b.col - a.col)[0];
      if (blocker) {
        if (z.attackTimer <= 0) {
          blocker.hp -= info.damage;
          z.attackTimer = info.rate;
          tone(120,.025);
        }
      } else {
        z.x -= info.speed * z.slowFactor * dt;
        if (z.x <= .22) {
          z.hp = 0;
          state.hearts--;
          showToast('A zombie slipped through the gate!');
          tone(90,.16);
          if (state.hearts <= 0) endGame(false);
        }
      }
    }

    for (const z of state.zombies) {
      if (z.hp <= 0 && !z.rewarded && z.x > .22) {
        z.rewarded = true;
        state.nectar += ZOMBIES[z.type].reward;
      }
    }
    state.zombies = state.zombies.filter(z => z.hp > 0);
    state.defenders = state.defenders.filter(d => d.hp > 0);

    if (state.waveSpawned >= state.waveQuota && state.zombies.length === 0 && state.betweenWaves <= 0) {
      if (state.wave >= FINAL_WAVE) {
        endGame(true);
      } else {
        state.wave++;
        state.waveElapsed = 0;
        state.waveSpawned = 0;
        state.waveDuration = durationForWave(state.wave);
        state.waveQuota = quotaForWave(state.wave);
        state.betweenWaves = 3.0;
        state.nectar += 40;
        statusText.textContent = `Wave ${state.wave} incoming — bonus nectar +40.`;
        showToast(`🌙 Wave ${state.wave} incoming!`);
        tone(700,.08);
      }
    }
  }

  function hitZombie(z, damage) { z.hp -= damage; }

  function flashProjectile(d, z, kind, duration) {
    const p = document.createElement('div');
    p.className = `projectile ${kind === 'web' ? 'web' : kind === 'blast' ? 'blast' : ''}`;
    const sx = ((d.col + .62) / COLS) * 100;
    const sy = ((d.row + .5) / ROWS) * 100;
    const tx = (z.x / COLS) * 100;
    p.style.left = sx + '%';
    p.style.top = sy + '%';
    entityLayer.appendChild(p);
    requestAnimationFrame(() => {
      p.style.transition = `left ${duration}s linear, transform ${duration}s ease`;
      p.style.left = tx + '%';
      if (kind === 'blast') p.style.transform = 'scale(2.1)';
    });
    setTimeout(() => p.remove(), duration * 1000 + 60);
  }

  function render() {
    entityLayer.querySelectorAll('.entity').forEach(n => n.remove());

    for (const d of state.defenders) {
      const bug = BUGS[d.type];
      const el = document.createElement('div');
      el.className = 'entity defender';
      el.style.left = (((d.col + .5) / COLS) * 100) + '%';
      el.style.top = (((d.row + .5) / ROWS) * 100) + '%';
      const hp = Math.max(0, d.hp / d.maxHp * 100);
      el.innerHTML = `<span class="sprite">${bug.icon}</span><span class="hp"><span style="width:${hp}%"></span></span>`;
      entityLayer.appendChild(el);
    }

    for (const z of state.zombies) {
      const info = ZOMBIES[z.type];
      const el = document.createElement('div');
      el.className = 'entity zombie' + (z.slowFactor < 1 ? ' slowed' : '');
      el.style.left = ((z.x / COLS) * 100) + '%';
      el.style.top = (((z.row + .5) / ROWS) * 100) + '%';
      const hp = Math.max(0, z.hp / z.maxHp * 100);
      const hat = z.type === 'tinhead' ? '<span style="position:absolute;top:-18%;font-size:42%">🪣</span>' : z.type === 'brute' ? '<span style="position:absolute;top:-16%;font-size:40%">🪵</span>' : '';
      el.innerHTML = `${hat}<span class="sprite">${info.icon}</span><span class="hp"><span style="width:${hp}%"></span></span>`;
      entityLayer.appendChild(el);
    }

    renderDrops();
  }

  function renderDrops() {
    dropLayer.innerHTML = '';
    for (const d of state.drops) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nectar-drop';
      btn.style.left = d.x + '%';
      btn.style.top = d.y + '%';
      btn.textContent = '+' + d.amount;
      btn.setAttribute('aria-label', `Collect ${d.amount} nectar`);
      btn.addEventListener('click', () => collectDrop(d.id));
      dropLayer.appendChild(btn);
    }
  }

  function updateUI() {
    nectarValue.textContent = Math.floor(state.nectar);
    heartValue.textContent = '❤️'.repeat(Math.max(0,state.hearts)) + '🖤'.repeat(Math.max(0,3-state.hearts));
    waveText.textContent = `Wave ${state.wave}/${FINAL_WAVE}`;
    const spawnProgress = state.waveQuota ? Math.min(1, state.waveSpawned / state.waveQuota) : 0;
    waveFill.style.width = `${Math.round(spawnProgress * 100)}%`;
    if (state.betweenWaves > 0 && state.wave > 1) statusText.textContent = `Wave ${state.wave} begins in ${Math.max(1, Math.ceil(state.betweenWaves))}…`;
  }

  function updateCardStates() {
    document.querySelectorAll('.bug-card').forEach(btn => {
      const key = btn.dataset.bug;
      const bug = BUGS[key];
      const cd = state.cooldowns[key] || 0;
      btn.classList.toggle('selected', state.selected === key);
      btn.disabled = state.ended || state.paused || state.nectar < bug.cost || cd > 0;
      btn.querySelector('.cooldown').style.height = `${Math.min(100, cd / bug.cooldown * 100)}%`;
      btn.setAttribute('aria-label', `${bug.name}, costs ${bug.cost} nectar, ${bug.role}${cd > 0 ? `, ready in ${Math.ceil(cd)} seconds` : ''}`);
    });
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function togglePause(force) {
    if (!state.running || state.ended) return;
    state.paused = typeof force === 'boolean' ? force : !state.paused;
    pauseOverlay.classList.toggle('show', state.paused);
    pauseOverlay.setAttribute('aria-hidden', String(!state.paused));
    pauseBtn.textContent = state.paused ? '▶️' : '⏸️';
    pauseBtn.setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    if (!state.paused) state.lastTime = performance.now();
    updateCardStates();
  }

  function endGame(won) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    document.getElementById('endIcon').textContent = won ? '🏆🐝' : '🪦🐌';
    document.getElementById('endTitle').textContent = won ? 'Garden Saved!' : 'Garden Overrun';
    document.getElementById('endText').textContent = won
      ? `All ${FINAL_WAVE} waves cleared. The bugs live to snack another day.`
      : 'The gate fell, but the bugs demand an immediate rematch.';
    endOverlay.classList.add('show');
    endOverlay.setAttribute('aria-hidden','false');
    tone(won ? 760 : 120, won ? .18 : .28);
    updateCardStates();
  }

  function tone(freq, duration) {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      if (!tone.ctx) tone.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = tone.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(.028, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  function loop(now) {
    if (!state.running && state.ended) return;
    const dt = Math.min(.05, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    if (!state.paused) update(dt);
    updateUI();
    updateCardStates();
    render();
    if (!state.ended) raf = requestAnimationFrame(loop);
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('againBtn').addEventListener('click', resetGame);
  document.getElementById('menuBtn').addEventListener('click', () => {
    cancelAnimationFrame(raf);
    state.running = false;
    state.ended = true;
    game.classList.remove('active');
    menu.classList.add('active');
    endOverlay.classList.remove('show');
  });
  pauseBtn.addEventListener('click', () => togglePause());
  document.getElementById('resumeBtn').addEventListener('click', () => togglePause(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running && !state.paused && !state.ended) togglePause(true);
  });

  makeGrid();
  makeCards();
  updateUI();
})();
