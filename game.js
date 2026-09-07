(() => {
  'use strict';

  const ROWS = 5;
  const COLS = 8;
  const FINAL_WAVE = 10;
  const MOVE_COST = 10;
  const DOUBLE_TAP_MS = 380;

  const menu = document.getElementById('menu');
  const game = document.getElementById('game');
  const board = document.getElementById('board');
  const entityLayer = document.getElementById('entities');
  const dropLayer = document.getElementById('drops');
  const defenderBar = document.getElementById('defenderBar');
  const honeydewValue = document.getElementById('nectarValue');
  const heartValue = document.getElementById('heartValue');
  const waveText = document.getElementById('waveText');
  const waveFill = document.getElementById('waveFill');
  const statusText = document.getElementById('statusText');
  const toast = document.getElementById('toast');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const endOverlay = document.getElementById('endOverlay');
  const pauseBtn = document.getElementById('pauseBtn');

  const UNITS = {
    aphids: {
      name: 'Aphid Herd', cost: 50, hp: 120, cooldown: 4.5,
      role: 'Produces Honeydew', kind: 'generator', rate: 9.0, amount: 30
    },
    woodant: {
      name: 'Wood Ant', cost: 85, hp: 115, cooldown: 3.8,
      role: 'Sprays formic acid', kind: 'shooter', rate: 1.08, damage: 22, shot: 'acid'
    },
    major: {
      name: 'Major Soldier', cost: 100, hp: 470, cooldown: 7.0,
      role: 'Heavy blocker — soaks damage', kind: 'tank'
    },
    weaver: {
      name: 'Weaver Ant', cost: 125, hp: 120, cooldown: 6.2,
      role: 'Sticky slowing shot', kind: 'shooter', rate: 1.65, damage: 13,
      slow: 0.5, slowTime: 3.2, shot: 'silk'
    },
    fireant: {
      name: 'Fire Ant', cost: 175, hp: 145, cooldown: 8.3,
      role: 'Venom splash', kind: 'shooter', rate: 2.15, damage: 42,
      splash: 0.78, shot: 'venom'
    },
    trapjaw: {
      name: 'Trap-jaw Ant', cost: 150, hp: 165, cooldown: 6.0,
      role: 'Snaps zombies backward', kind: 'melee', rate: 1.75,
      damage: 54, knockback: 0.62
    }
  };

  const ZOMBIES = {
    shambler: {
      name: 'Shambler', icon: '🧟', hp: 110, speed: 0.125, damage: 24, rate: 1.15
    },
    runner: {
      name: 'Runner', icon: '🧟‍♀️', hp: 82, speed: 0.19, damage: 18, rate: 0.95
    },
    conehead: {
      name: 'Conehead', icon: '🧟', hp: 165, speed: 0.112, damage: 26, rate: 1.12
    },
    tinhead: {
      name: 'Tinhead', icon: '🧟‍♂️', hp: 255, speed: 0.088, damage: 30, rate: 1.25
    },
    gardener: {
      name: 'Gardener', icon: '🧟', hp: 210, speed: 0.105, damage: 38, rate: 0.98
    },
    exterminator: {
      name: 'Exterminator', icon: '🧟', hp: 275, speed: 0.082, damage: 24, rate: 1.35,
      reach: 1.25
    },
    brute: {
      name: 'Compost Brute', icon: '🧟', hp: 430, speed: 0.067, damage: 44, rate: 1.4
    }
  };

  const DEBUTS = {
    2: 'runner',
    3: 'conehead',
    4: 'tinhead',
    5: 'gardener',
    6: 'exterminator',
    7: 'brute'
  };

  const state = {
    running: false,
    paused: false,
    ended: false,
    honeydew: 175,
    hearts: 3,
    wave: 1,
    waveElapsed: 0,
    waveDuration: 24,
    waveSpawned: 0,
    waveQuota: 6,
    betweenWaves: 0,
    defenders: [],
    zombies: [],
    drops: [],
    selected: null,
    moveDefenderId: null,
    lastTapKey: '',
    lastTapAt: 0,
    cooldowns: {},
    lastTime: 0,
    wildAphidTimer: 5.5,
    id: 1,
    toastTimer: 0
  };

  let raf = 0;

  function antSprite(type, compact = false) {
    if (type === 'aphids') {
      return `<span class="aphid-herd${compact ? ' compact' : ''}" aria-hidden="true">
        <span class="aphid-leaf"></span>
        <span class="aphid a1"></span><span class="aphid a2"></span><span class="aphid a3"></span>
        <span class="dew-bead"></span>
      </span>`;
    }

    return `<span class="ant-sprite ant-${type}${compact ? ' compact' : ''}" aria-hidden="true">
      <span class="ant-leg l1"></span><span class="ant-leg l2"></span><span class="ant-leg l3"></span>
      <span class="ant-leg r1"></span><span class="ant-leg r2"></span><span class="ant-leg r3"></span>
      <span class="ant-abdomen"></span><span class="ant-thorax"></span><span class="ant-head"></span>
      <span class="ant-mandible m1"></span><span class="ant-mandible m2"></span>
    </span>`;
  }

  function getDefenderAt(row, col) {
    return state.defenders.find(defender => defender.hp > 0 && defender.row === row && defender.col === col) || null;
  }

  function refreshCellHints() {
    const moving = state.defenders.find(defender => defender.id === state.moveDefenderId && defender.hp > 0) || null;
    document.querySelectorAll('.cell').forEach(cell => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const occupied = getDefenderAt(row, col);
      cell.classList.toggle('placeable', Boolean(state.selected) && !occupied && col !== 0);
      cell.classList.toggle('move-source', Boolean(moving) && moving.row === row && moving.col === col);
      cell.classList.toggle('move-placeable', Boolean(moving) && !occupied && col !== 0);
    });
  }

  function cancelMoveMode(updateStatus = true) {
    state.moveDefenderId = null;
    state.lastTapKey = '';
    state.lastTapAt = 0;
    refreshCellHints();
    if (updateStatus && !state.selected) {
      statusText.textContent = 'Choose an ant, then tap a garden square.';
    }
  }

  function beginMoveMode(defender) {
    if (state.honeydew < MOVE_COST) {
      showToast(`Need ${MOVE_COST} Honeydew to move an ant.`);
      return;
    }
    state.selected = null;
    state.moveDefenderId = defender.id;
    state.lastTapKey = '';
    state.lastTapAt = 0;
    refreshCellHints();
    const name = UNITS[defender.type].name;
    statusText.textContent = `Moving ${name} — tap an empty square. Cost: ${MOVE_COST} Honeydew.`;
    showToast(`↔️ Move ${name} for ${MOVE_COST} Honeydew`);
    updateCardStates();
  }

  function makeGrid() {
    board.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Garden row ${r + 1}, column ${c + 1}`);
        cell.addEventListener('click', onCellTap);
        board.appendChild(cell);
      }
    }
  }

  function makeCards() {
    defenderBar.innerHTML = '';
    Object.entries(UNITS).forEach(([key, unit]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bug-card ant-card';
      btn.dataset.bug = key;
      btn.innerHTML = `
        <div class="top">
          <span class="bug-icon">${antSprite(key, true)}</span>
          <span class="cost"><span class="dew-icon mini" aria-hidden="true"></span>${unit.cost}</span>
        </div>
        <div class="name">${unit.name}</div>
        <div class="role">${unit.role}</div>
        <div class="cooldown"></div>`;
      btn.addEventListener('click', () => selectUnit(key));
      defenderBar.appendChild(btn);
    });
  }

  function resetGame() {
    Object.assign(state, {
      running: true,
      paused: false,
      ended: false,
      honeydew: 175,
      hearts: 3,
      wave: 1,
      waveElapsed: 0,
      waveDuration: durationForWave(1),
      waveSpawned: 0,
      waveQuota: quotaForWave(1),
      betweenWaves: 1.3,
      defenders: [],
      zombies: [],
      drops: [],
      selected: null,
      moveDefenderId: null,
      lastTapKey: '',
      lastTapAt: 0,
      cooldowns: {},
      wildAphidTimer: 5.5,
      lastTime: performance.now(),
      id: 1
    });

    entityLayer.innerHTML = '';
    dropLayer.innerHTML = '';
    endOverlay.classList.remove('show');
    pauseOverlay.classList.remove('show');
    endOverlay.setAttribute('aria-hidden', 'true');
    pauseOverlay.setAttribute('aria-hidden', 'true');
    pauseBtn.textContent = '⏸️';
    statusText.textContent = 'Choose an ant, then tap a garden square.';
    refreshCellHints();
    updateUI();
    updateCardStates();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function quotaForWave(wave) {
    return 5 + Math.round(wave * 1.3);
  }

  function durationForWave(wave) {
    return Math.max(17, 25 - wave * 0.8);
  }

  function zombiePoolForWave(wave) {
    const pool = ['shambler', 'shambler'];
    if (wave >= 2) pool.push('runner');
    if (wave >= 3) pool.push('conehead', 'conehead');
    if (wave >= 4) pool.push('tinhead');
    if (wave >= 5) pool.push('gardener');
    if (wave >= 6) pool.push('exterminator');
    if (wave >= 7) pool.push('brute');
    if (wave >= 8) pool.push('runner', 'tinhead', 'gardener');
    if (wave >= 9) pool.push('conehead', 'exterminator', 'brute');
    if (wave >= 10) pool.push('tinhead', 'gardener', 'exterminator', 'brute');
    return pool;
  }

  function startGame() {
    menu.classList.remove('active');
    game.classList.add('active');
    resetGame();
  }

  function selectUnit(key) {
    if (!state.running || state.paused || state.ended) return;
    if (state.moveDefenderId !== null) cancelMoveMode(false);

    const unit = UNITS[key];
    if ((state.cooldowns[key] || 0) > 0) {
      showToast(`${unit.name} is regrouping.`);
      return;
    }
    if (state.honeydew < unit.cost) {
      showToast(`Need ${unit.cost - state.honeydew} more Honeydew.`);
      return;
    }

    state.selected = state.selected === key ? null : key;
    refreshCellHints();
    updateCardStates();
    statusText.textContent = state.selected
      ? `${unit.name} selected — tap an empty square.`
      : 'Choose an ant, then tap a garden square.';
  }

  function onCellTap(event) {
    if (!state.running || state.paused || state.ended) return;

    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);
    const occupant = getDefenderAt(row, col);

    if (state.moveDefenderId !== null) {
      const moving = state.defenders.find(defender => defender.id === state.moveDefenderId && defender.hp > 0);
      if (!moving) {
        cancelMoveMode();
        return;
      }

      if (occupant && occupant.id === moving.id) {
        cancelMoveMode();
        showToast('Move cancelled.');
        return;
      }
      if (col === 0) {
        showToast('Keep the first column clear for the human refuge.');
        return;
      }
      if (occupant) {
        showToast('That patch is already occupied.');
        return;
      }
      if (state.honeydew < MOVE_COST) {
        cancelMoveMode();
        showToast(`Need ${MOVE_COST} Honeydew to move an ant.`);
        return;
      }

      state.honeydew -= MOVE_COST;
      moving.row = row;
      moving.col = col;
      state.moveDefenderId = null;
      state.lastTapKey = '';
      state.lastTapAt = 0;
      refreshCellHints();
      statusText.textContent = `${UNITS[moving.type].name} moved for ${MOVE_COST} Honeydew.`;
      showToast(`↔️ Ant moved! −${MOVE_COST} Honeydew`);
      tone(440, 0.05);
      updateUI();
      updateCardStates();
      render();
      return;
    }

    if (!state.selected && occupant) {
      const now = performance.now();
      const key = `${row}:${col}`;
      if (state.lastTapKey === key && now - state.lastTapAt <= DOUBLE_TAP_MS) {
        beginMoveMode(occupant);
      } else {
        state.lastTapKey = key;
        state.lastTapAt = now;
        statusText.textContent = `Double-tap ${UNITS[occupant.type].name} to move it for ${MOVE_COST} Honeydew.`;
      }
      return;
    }

    state.lastTapKey = '';
    state.lastTapAt = 0;

    if (!state.selected) return;

    if (col === 0) {
      showToast('Keep the first column clear for the human refuge.');
      return;
    }
    if (occupant) {
      showToast('That patch is already occupied.');
      return;
    }

    const key = state.selected;
    const unit = UNITS[key];
    if (state.honeydew < unit.cost || (state.cooldowns[key] || 0) > 0) return;

    state.honeydew -= unit.cost;
    state.cooldowns[key] = unit.cooldown;
    state.defenders.push({
      id: state.id++,
      type: key,
      row,
      col,
      hp: unit.hp,
      maxHp: unit.hp,
      attackTimer: Math.random() * 0.25,
      genTimer: unit.kind === 'generator' ? unit.rate * 0.5 : 0
    });

    tone(360, 0.05);
    state.selected = null;
    refreshCellHints();
    statusText.textContent = `${unit.name} deployed.`;
    updateUI();
    updateCardStates();
    render();
  }

  function spawnZombie() {
    const debut = DEBUTS[state.wave];
    let type;

    if (state.waveSpawned === 0 && debut) {
      type = debut;
    } else {
      const pool = zombiePoolForWave(state.wave);
      type = pool[Math.floor(Math.random() * pool.length)];
    }

    const zombie = ZOMBIES[type];
    state.zombies.push({
      id: state.id++,
      type,
      row: Math.floor(Math.random() * ROWS),
      x: 8.35,
      hp: zombie.hp,
      maxHp: zombie.hp,
      attackTimer: 0,
      slowFactor: 1,
      slowTimer: 0
    });

    if (state.waveSpawned === 0 && debut) {
      showToast(`⚠️ New threat: ${zombie.name}!`);
    }
    state.waveSpawned += 1;
  }

  function spawnHoneydew(xPct, yPct, amount = 25, source = 'aphid') {
    state.drops.push({
      id: state.id++,
      x: Math.max(7, Math.min(93, xPct)),
      y: Math.max(9, Math.min(91, yPct)),
      amount,
      source,
      life: 9
    });
    renderDrops();
  }

  function collectDrop(id) {
    if (!state.running || state.paused || state.ended) return;
    const index = state.drops.findIndex(drop => drop.id === id);
    if (index < 0) return;

    const drop = state.drops[index];
    state.honeydew += drop.amount;
    state.drops.splice(index, 1);
    tone(620, 0.04);
    updateUI();
    updateCardStates();
    renderDrops();
  }

  function update(dt) {
    if (!state.running || state.paused || state.ended) return;

    Object.keys(state.cooldowns).forEach(key => {
      state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
    });

    state.wildAphidTimer -= dt;
    if (state.wildAphidTimer <= 0) {
      spawnHoneydew(10 + Math.random() * 26, 12 + Math.random() * 74, 20, 'wild');
      state.wildAphidTimer = 8.5 + Math.random() * 2.0;
    }

    state.drops.forEach(drop => { drop.life -= dt; });
    state.drops = state.drops.filter(drop => drop.life > 0);

    if (state.betweenWaves > 0) {
      state.betweenWaves -= dt;
    } else {
      state.waveElapsed += dt;
      const spawnEvery = state.waveDuration / state.waveQuota;
      if (state.waveSpawned < state.waveQuota && state.waveElapsed >= state.waveSpawned * spawnEvery) {
        spawnZombie();
      }
    }

    for (const defender of state.defenders) {
      if (defender.hp <= 0) continue;
      const unit = UNITS[defender.type];

      if (unit.kind === 'generator') {
        defender.genTimer -= dt;
        if (defender.genTimer <= 0) {
          spawnHoneydew(
            ((defender.col + 0.5) / COLS) * 100,
            ((defender.row + 0.5) / ROWS) * 100,
            unit.amount,
            'aphid'
          );
          defender.genTimer = unit.rate;
        }
        continue;
      }

      if (unit.kind === 'tank') continue;

      defender.attackTimer -= dt;
      const targets = state.zombies
        .filter(zombie => zombie.hp > 0 && zombie.row === defender.row && zombie.x > defender.col + 0.25)
        .sort((a, b) => a.x - b.x);
      const target = targets[0];
      if (!target || defender.attackTimer > 0) continue;

      if (unit.kind === 'melee') {
        if (target.x - defender.col <= 1.15) {
          hitZombie(target, unit.damage);
          target.x = Math.min(8.25, target.x + unit.knockback);
          defender.attackTimer = unit.rate;
          flashProjectile(defender, target, 'snap', 0.16);
          tone(190, 0.035);
        }
      } else {
        hitZombie(target, unit.damage);
        if (unit.slow) {
          target.slowFactor = unit.slow;
          target.slowTimer = unit.slowTime;
        }
        if (unit.splash) {
          state.zombies.forEach(other => {
            if (other.id !== target.id && other.hp > 0 && other.row === target.row && Math.abs(other.x - target.x) <= unit.splash) {
              hitZombie(other, Math.round(unit.damage * 0.55));
            }
          });
        }
        defender.attackTimer = unit.rate;
        flashProjectile(defender, target, unit.shot, 0.22);
        tone(unit.shot === 'silk' ? 420 : unit.shot === 'venom' ? 210 : 520, 0.025);
      }
    }

    for (const zombie of state.zombies) {
      if (zombie.hp <= 0) continue;
      const info = ZOMBIES[zombie.type];
      zombie.attackTimer -= dt;

      if (zombie.slowTimer > 0) {
        zombie.slowTimer -= dt;
        if (zombie.slowTimer <= 0) zombie.slowFactor = 1;
      }

      const reach = info.reach || 0.62;
      const blocker = state.defenders
        .filter(defender => defender.hp > 0 && defender.row === zombie.row && defender.col < zombie.x && zombie.x - defender.col < reach)
        .sort((a, b) => b.col - a.col)[0];

      if (blocker) {
        if (zombie.attackTimer <= 0) {
          blocker.hp -= info.damage;
          zombie.attackTimer = info.rate;
          tone(zombie.type === 'exterminator' ? 165 : 120, 0.025);
        }
      } else {
        zombie.x -= info.speed * zombie.slowFactor * dt;
        if (zombie.x <= 0.22) {
          zombie.hp = 0;
          state.hearts -= 1;
          showToast('A zombie reached the human refuge!');
          tone(90, 0.16);
          if (state.hearts <= 0) endGame(false);
        }
      }
    }

    state.zombies = state.zombies.filter(zombie => zombie.hp > 0);
    state.defenders = state.defenders.filter(defender => defender.hp > 0);

    if (state.moveDefenderId !== null && !state.defenders.some(defender => defender.id === state.moveDefenderId)) {
      cancelMoveMode();
    }

    if (state.waveSpawned >= state.waveQuota && state.zombies.length === 0 && state.betweenWaves <= 0) {
      if (state.wave >= FINAL_WAVE) {
        endGame(true);
      } else {
        state.wave += 1;
        state.waveElapsed = 0;
        state.waveSpawned = 0;
        state.waveDuration = durationForWave(state.wave);
        state.waveQuota = quotaForWave(state.wave);
        state.betweenWaves = 3;
        const waveBonus = 25 + state.wave * 2;
        state.honeydew += waveBonus;
        cancelMoveMode(false);
        state.selected = null;
        refreshCellHints();
        statusText.textContent = `Wave ${state.wave} incoming — aphid harvest +${waveBonus} Honeydew.`;
        showToast(`🌙 Wave ${state.wave} incoming! +${waveBonus}`);
        tone(700, 0.08);
      }
    }
  }

  function hitZombie(zombie, damage) {
    zombie.hp -= damage;
  }

  function flashProjectile(defender, zombie, kind, duration) {
    const projectile = document.createElement('div');
    projectile.className = `projectile ${kind}`;
    const startX = ((defender.col + 0.62) / COLS) * 100;
    const startY = ((defender.row + 0.5) / ROWS) * 100;
    const targetX = (zombie.x / COLS) * 100;
    projectile.style.left = `${startX}%`;
    projectile.style.top = `${startY}%`;
    entityLayer.appendChild(projectile);

    requestAnimationFrame(() => {
      projectile.style.transition = `left ${duration}s linear, transform ${duration}s ease`;
      projectile.style.left = `${targetX}%`;
      if (kind === 'venom' || kind === 'snap') projectile.style.transform = 'scale(2.05)';
    });

    setTimeout(() => projectile.remove(), duration * 1000 + 70);
  }

  function render() {
    entityLayer.querySelectorAll('.entity').forEach(node => node.remove());

    for (const defender of state.defenders) {
      const el = document.createElement('div');
      el.className = `entity defender${defender.id === state.moveDefenderId ? ' moving-ant' : ''}`;
      el.style.left = `${((defender.col + 0.5) / COLS) * 100}%`;
      el.style.top = `${((defender.row + 0.5) / ROWS) * 100}%`;
      const hp = Math.max(0, defender.hp / defender.maxHp * 100);
      el.innerHTML = `${antSprite(defender.type)}<span class="hp"><span style="width:${hp}%"></span></span>`;
      entityLayer.appendChild(el);
    }

    for (const zombie of state.zombies) {
      const info = ZOMBIES[zombie.type];
      const el = document.createElement('div');
      el.className = `entity zombie${zombie.slowFactor < 1 ? ' slowed' : ''}`;
      el.dataset.zombieType = zombie.type;
      el.style.left = `${(zombie.x / COLS) * 100}%`;
      el.style.top = `${((zombie.row + 0.5) / ROWS) * 100}%`;
      const hp = Math.max(0, zombie.hp / zombie.maxHp * 100);
      el.innerHTML = `<span class="sprite">${info.icon}</span><span class="hp"><span style="width:${hp}%"></span></span>`;
      entityLayer.appendChild(el);
    }

    renderDrops();
  }

  function renderDrops() {
    const liveIds = new Set(state.drops.map(drop => String(drop.id)));

    for (const child of Array.from(dropLayer.children)) {
      if (!liveIds.has(child.dataset.dropId)) child.remove();
    }

    for (const drop of state.drops) {
      let button = dropLayer.querySelector(`[data-drop-id="${drop.id}"]`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'honeydew-drop';
        button.dataset.dropId = String(drop.id);
        button.innerHTML = `<span class="drop-gem" aria-hidden="true"></span><span class="drop-value">+${drop.amount}</span>`;
        button.setAttribute('aria-label', `Collect ${drop.amount} Honeydew`);
        button.addEventListener('pointerdown', event => {
          event.preventDefault();
          collectDrop(drop.id);
        }, { passive: false });
        dropLayer.appendChild(button);
      }
      button.style.left = `${drop.x}%`;
      button.style.top = `${drop.y}%`;
    }
  }

  function updateUI() {
    honeydewValue.textContent = String(Math.floor(state.honeydew));
    heartValue.textContent = '❤️'.repeat(Math.max(0, state.hearts)) + '🖤'.repeat(Math.max(0, 3 - state.hearts));
    waveText.textContent = `Wave ${state.wave}/${FINAL_WAVE}`;
    const progress = state.waveQuota ? Math.min(1, state.waveSpawned / state.waveQuota) : 0;
    waveFill.style.width = `${Math.round(progress * 100)}%`;

    if (state.betweenWaves > 0 && state.wave > 1 && state.moveDefenderId === null && !state.selected) {
      statusText.textContent = `Wave ${state.wave} begins in ${Math.max(1, Math.ceil(state.betweenWaves))}…`;
    }
  }

  function updateCardStates() {
    document.querySelectorAll('.bug-card').forEach(button => {
      const key = button.dataset.bug;
      const unit = UNITS[key];
      const cooldown = state.cooldowns[key] || 0;
      button.classList.toggle('selected', state.selected === key);
      button.disabled = state.ended || state.paused || state.honeydew < unit.cost || cooldown > 0;
      button.querySelector('.cooldown').style.height = `${Math.min(100, cooldown / unit.cooldown * 100)}%`;
      button.setAttribute(
        'aria-label',
        `${unit.name}, costs ${unit.cost} Honeydew, ${unit.role}${cooldown > 0 ? `, ready in ${Math.ceil(cooldown)} seconds` : ''}`
      );
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
    cancelMoveMode(false);
    document.getElementById('endIcon').textContent = won ? '🏆🐜' : '🪦🐜';
    document.getElementById('endTitle').textContent = won ? 'Humanity Saved!' : 'Refuge Overrun';
    document.getElementById('endText').textContent = won
      ? `All ${FINAL_WAVE} waves cleared. The tiny human refuge is safe and the Honeydew keeps flowing.`
      : 'The refuge fell, but the ants are already demanding a rematch.';
    endOverlay.classList.add('show');
    endOverlay.setAttribute('aria-hidden', 'false');
    tone(won ? 760 : 120, won ? 0.18 : 0.28);
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
      gain.gain.setValueAtTime(0.028, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {
      // Audio is optional; the game remains fully playable without it.
    }
  }

  function loop(now) {
    if (!state.running && state.ended) return;
    const dt = Math.min(0.05, Math.max(0, (now - state.lastTime) / 1000));
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
    cancelMoveMode(false);
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
