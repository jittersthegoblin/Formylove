(() => {
  'use strict';

  const ROWS = 5;
  const COLS = 8;
  const FINAL_LEVEL = 10;
  const MOVE_COST = 10;
  const DOUBLE_TAP_MS = 380;
  const STARTING_HONEYDEW = 160;
  const MAX_ANT_LEVEL = 3;

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
  const statusStrip = document.querySelector('.status-strip');

  const UNITS = {
    aphids: { name: 'Aphid Herd', cost: 50, hp: 120, cooldown: 4.5, role: 'Produces Honeydew', kind: 'generator', rate: 9.0, amount: 30 },
    woodant: { name: 'Wood Ant', cost: 85, hp: 115, cooldown: 3.8, role: 'Sprays formic acid', kind: 'shooter', rate: 1.08, damage: 22, shot: 'acid' },
    major: { name: 'Major Soldier', cost: 100, hp: 470, cooldown: 7.0, role: 'Heavy blocker — soaks damage', kind: 'tank' },
    weaver: { name: 'Weaver Ant', cost: 125, hp: 120, cooldown: 6.2, role: 'Sticky slowing shot', kind: 'shooter', rate: 1.65, damage: 13, slow: 0.5, slowTime: 3.2, shot: 'silk' },
    fireant: { name: 'Fire Ant', cost: 175, hp: 145, cooldown: 8.3, role: 'Venom splash', kind: 'shooter', rate: 2.15, damage: 42, splash: 0.78, shot: 'venom' },
    trapjaw: { name: 'Trap-jaw Ant', cost: 150, hp: 165, cooldown: 6.0, role: 'Snaps zombies backward', kind: 'melee', rate: 1.75, damage: 54, knockback: 0.62 }
  };

  const ZOMBIES = {
    shambler: { name: 'Shambler', icon: '🧟', hp: 110, speed: 0.125, damage: 24, rate: 1.15 },
    runner: { name: 'Runner', icon: '🧟‍♀️', hp: 82, speed: 0.19, damage: 18, rate: 0.95 },
    conehead: { name: 'Conehead', icon: '🧟', hp: 165, speed: 0.112, damage: 26, rate: 1.12 },
    tinhead: { name: 'Tinhead', icon: '🧟‍♂️', hp: 255, speed: 0.088, damage: 30, rate: 1.25 },
    gardener: { name: 'Gardener', icon: '🧟', hp: 210, speed: 0.105, damage: 38, rate: 0.98 },
    exterminator: { name: 'Exterminator', icon: '🧟', hp: 275, speed: 0.082, damage: 24, rate: 1.35, reach: 1.25 },
    brute: { name: 'Compost Brute', icon: '🧟', hp: 430, speed: 0.067, damage: 44, rate: 1.4 }
  };

  const state = {
    running: false, paused: false, ended: false,
    honeydew: STARTING_HONEYDEW, hearts: 3,
    level: 1, wave: 1, waveElapsed: 0, waveDuration: 18, waveSpawned: 0, waveQuota: 6, betweenWaves: 0,
    defenders: [], zombies: [], drops: [], selected: null, inspectDefenderId: null, moveDefenderId: null,
    lastTapKey: '', lastTapAt: 0, cooldowns: {}, lastTime: 0, wildAphidTimer: 5.5, id: 1, toastTimer: 0
  };

  let raf = 0;

  const upgradeBtn = document.createElement('button');
  upgradeBtn.type = 'button';
  upgradeBtn.className = 'upgrade-btn';
  upgradeBtn.hidden = true;
  upgradeBtn.setAttribute('aria-label', 'Upgrade selected ant');
  statusStrip.appendChild(upgradeBtn);

  const mechanicsStyle = document.createElement('style');
  mechanicsStyle.textContent = `
    .upgrade-btn { flex:0 0 auto; min-height:34px; padding:6px 10px; border:1px solid rgba(255,235,139,.45); border-radius:10px; background:linear-gradient(#6a783d,#4d6032); color:#fff3a8; font:inherit; font-size:11px; font-weight:1000; cursor:pointer; white-space:nowrap; touch-action:manipulation; }
    .upgrade-btn[disabled] { opacity:.45; cursor:not-allowed; }
    .cell.inspect-source { background:rgba(255,232,121,.10)!important; box-shadow:inset 0 0 0 2px rgba(255,232,121,.45); }
    .entity.selected-ant { filter:drop-shadow(0 0 6px rgba(255,229,121,.75)); }
    .ant-level { position:absolute; z-index:9; right:-4px; top:-7px; min-width:24px; padding:1px 4px; border-radius:8px; background:rgba(34,46,24,.92); border:1px solid rgba(255,229,121,.55); color:#ffe579; font-size:9px; font-weight:1000; line-height:14px; text-align:center; }
    @media (orientation:landscape) and (max-height:560px) { .upgrade-btn{min-height:30px;padding:4px 8px;font-size:10px}.status-strip strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ant-level{font-size:8px;line-height:12px;min-width:21px} }
  `;
  document.head.appendChild(mechanicsStyle);

  function antSprite(type, compact = false) {
    if (type === 'aphids') return `<span class="aphid-herd${compact ? ' compact' : ''}" aria-hidden="true"><span class="aphid-leaf"></span><span class="aphid a1"></span><span class="aphid a2"></span><span class="aphid a3"></span><span class="dew-bead"></span></span>`;
    return `<span class="ant-sprite ant-${type}${compact ? ' compact' : ''}" aria-hidden="true"><span class="ant-leg l1"></span><span class="ant-leg l2"></span><span class="ant-leg l3"></span><span class="ant-leg r1"></span><span class="ant-leg r2"></span><span class="ant-leg r3"></span><span class="ant-abdomen"></span><span class="ant-thorax"></span><span class="ant-head"></span><span class="ant-mandible m1"></span><span class="ant-mandible m2"></span></span>`;
  }

  function wavesForLevel(level) { if (level <= 3) return 3; if (level <= 7) return 4; return 5; }
  function quotaForWave(level, wave) { return 5 + Math.floor((level - 1) * 0.65) + wave; }
  function durationForWave(level, wave) { return Math.max(13, 19.2 - level * 0.35 - wave * 0.4); }
  function waveBonus(level, wave) { return 16 + level * 2 + wave * 2; }
  function roundToFive(value) { return Math.max(5, Math.round(value / 5) * 5); }
  function upgradeCost(defender) { const unit = UNITS[defender.type]; if ((defender.level || 1) >= MAX_ANT_LEVEL) return 0; return defender.level === 1 ? roundToFive(unit.cost * 0.6) : roundToFive(unit.cost); }
  function maxHpFor(type, level) { const unit = UNITS[type]; if (unit.kind === 'tank') return Math.round(unit.hp * (level === 1 ? 1 : level === 2 ? 1.45 : 2.05)); return Math.round(unit.hp * (level === 1 ? 1 : level === 2 ? 1.2 : 1.45)); }

  function effectiveUnit(defender) {
    const base = UNITS[defender.type], level = defender.level || 1, bonus = level - 1, unit = { ...base };
    if (base.kind === 'generator') { unit.amount = base.amount + bonus * 10; unit.rate = Math.max(6.8, base.rate - bonus); }
    else if (defender.type === 'woodant') { unit.damage = Math.round(base.damage * (1 + bonus * 0.38)); unit.rate = Math.max(0.76, base.rate - bonus * 0.13); }
    else if (defender.type === 'weaver') { unit.damage = Math.round(base.damage * (1 + bonus * 0.30)); unit.rate = Math.max(1.25, base.rate - bonus * 0.18); unit.slow = Math.max(0.34, base.slow - bonus * 0.08); unit.slowTime = base.slowTime + bonus * 0.55; }
    else if (defender.type === 'fireant') { unit.damage = Math.round(base.damage * (1 + bonus * 0.33)); unit.rate = Math.max(1.65, base.rate - bonus * 0.22); unit.splash = base.splash + bonus * 0.12; }
    else if (defender.type === 'trapjaw') { unit.damage = Math.round(base.damage * (1 + bonus * 0.32)); unit.rate = Math.max(1.35, base.rate - bonus * 0.18); unit.knockback = base.knockback + bonus * 0.14; }
    return unit;
  }

  function zombieMultipliers() { return { hp: 1 + (state.level - 1) * 0.12 + (state.wave - 1) * 0.025, damage: 1 + (state.level - 1) * 0.08, speed: 1 + Math.min(0.18, (state.level - 1) * 0.018) }; }
  function zombiePool() {
    const l = state.level, w = state.wave, pool = ['shambler','shambler'];
    if (l === 1 && w >= 2) pool.push('runner');
    if (l >= 2) pool.push('runner','conehead','conehead');
    if (l >= 3) pool.push('tinhead'); if (l >= 4) pool.push('gardener'); if (l >= 5) pool.push('exterminator'); if (l >= 6) pool.push('brute');
    if (l >= 7) pool.push('runner','tinhead','gardener'); if (l >= 8) pool.push('conehead','exterminator'); if (l >= 9) pool.push('brute','tinhead','gardener'); if (l >= 10) pool.push('exterminator','brute','runner');
    if (w >= 3 && l >= 4) pool.push('conehead','gardener'); if (w >= 4 && l >= 6) pool.push('tinhead','exterminator'); if (w >= 5 && l >= 8) pool.push('brute');
    return pool;
  }
  function debutForCurrentWave() { if (state.level===1&&state.wave===2) return 'runner'; if (state.level===2&&state.wave===1) return 'conehead'; if (state.level===3&&state.wave===1) return 'tinhead'; if (state.level===4&&state.wave===1) return 'gardener'; if (state.level===5&&state.wave===1) return 'exterminator'; if (state.level===6&&state.wave===1) return 'brute'; return null; }

  function getDefenderAt(row,col){return state.defenders.find(d=>d.hp>0&&d.row===row&&d.col===col)||null}
  function inspectedDefender(){return state.defenders.find(d=>d.id===state.inspectDefenderId&&d.hp>0)||null}
  function clearInspection(updateStatus=false){state.inspectDefenderId=null;updateUpgradeButton();refreshCellHints();if(updateStatus&&!state.selected&&state.moveDefenderId===null)statusText.textContent='Choose an ant, then tap a garden square.'}
  function refreshCellHints(){const moving=state.defenders.find(d=>d.id===state.moveDefenderId&&d.hp>0)||null,inspected=inspectedDefender();document.querySelectorAll('.cell').forEach(cell=>{const row=Number(cell.dataset.row),col=Number(cell.dataset.col),occupied=getDefenderAt(row,col);cell.classList.toggle('placeable',Boolean(state.selected)&&!occupied&&col!==0);cell.classList.toggle('move-source',Boolean(moving)&&moving.row===row&&moving.col===col);cell.classList.toggle('move-placeable',Boolean(moving)&&!occupied&&col!==0);cell.classList.toggle('inspect-source',Boolean(inspected)&&inspected.row===row&&inspected.col===col)})}
  function cancelMoveMode(updateStatus=true){state.moveDefenderId=null;state.lastTapKey='';state.lastTapAt=0;refreshCellHints();if(updateStatus&&!state.selected&&!inspectedDefender())statusText.textContent='Choose an ant, then tap a garden square.'}
  function beginMoveMode(defender){if(state.honeydew<MOVE_COST){showToast(`Need ${MOVE_COST} Honeydew to move an ant.`);return}state.selected=null;state.inspectDefenderId=null;updateUpgradeButton();state.moveDefenderId=defender.id;state.lastTapKey='';state.lastTapAt=0;refreshCellHints();const name=UNITS[defender.type].name;statusText.textContent=`Moving ${name} — tap an empty square. Cost: ${MOVE_COST} Honeydew.`;showToast(`↔️ Move ${name} for ${MOVE_COST} Honeydew`);updateCardStates()}

  function inspectAnt(defender){state.inspectDefenderId=defender.id;state.selected=null;updateCardStates();refreshCellHints();updateUpgradeButton();const name=UNITS[defender.type].name,level=defender.level||1;statusText.textContent=level>=MAX_ANT_LEVEL?`${name} Lv.${level} — MAX upgrade. Double-tap to move for ${MOVE_COST}.`:`${name} Lv.${level} — upgrade for ${upgradeCost(defender)} Honeydew. Double-tap to move for ${MOVE_COST}.`}
  function updateUpgradeButton(){const defender=inspectedDefender();if(!defender||state.moveDefenderId!==null||state.ended){upgradeBtn.hidden=true;return}const level=defender.level||1;upgradeBtn.hidden=false;if(level>=MAX_ANT_LEVEL){upgradeBtn.textContent='★ MAX';upgradeBtn.disabled=true;return}const cost=upgradeCost(defender);upgradeBtn.textContent=`⬆ Lv.${level+1} · ${cost}`;upgradeBtn.disabled=state.paused||state.honeydew<cost}
  function upgradeInspectedAnt(){if(!state.running||state.paused||state.ended)return;const defender=inspectedDefender();if(!defender)return;const level=defender.level||1;if(level>=MAX_ANT_LEVEL)return;const cost=upgradeCost(defender);if(state.honeydew<cost){showToast(`Need ${cost-state.honeydew} more Honeydew.`);return}const oldMax=defender.maxHp;defender.level=level+1;defender.maxHp=maxHpFor(defender.type,defender.level);defender.hp=Math.min(defender.maxHp,defender.hp+(defender.maxHp-oldMax));const stats=effectiveUnit(defender);if(stats.kind==='generator')defender.genTimer=Math.min(defender.genTimer,stats.rate*.65);state.honeydew-=cost;const name=UNITS[defender.type].name;showToast(`⭐ ${name} upgraded to Lv.${defender.level}!`);tone(820,.07);inspectAnt(defender);updateUI();updateCardStates();render()}

  function makeGrid(){board.innerHTML='';for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const cell=document.createElement('button');cell.type='button';cell.className='cell';cell.dataset.row=String(r);cell.dataset.col=String(c);cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',`Garden row ${r+1}, column ${c+1}`);cell.addEventListener('click',onCellTap);board.appendChild(cell)}}
  function makeCards(){defenderBar.innerHTML='';Object.entries(UNITS).forEach(([key,unit])=>{const btn=document.createElement('button');btn.type='button';btn.className='bug-card ant-card';btn.dataset.bug=key;btn.innerHTML=`<div class="top"><span class="bug-icon">${antSprite(key,true)}</span><span class="cost"><span class="dew-icon mini" aria-hidden="true"></span>${unit.cost}</span></div><div class="name">${unit.name}</div><div class="role">${unit.role}</div><div class="cooldown"></div>`;btn.addEventListener('click',()=>selectUnit(key));defenderBar.appendChild(btn)})}
  function prepareWave(){state.waveElapsed=0;state.waveSpawned=0;state.waveDuration=durationForWave(state.level,state.wave);state.waveQuota=quotaForWave(state.level,state.wave)}

  function resetGame(){Object.assign(state,{running:true,paused:false,ended:false,honeydew:STARTING_HONEYDEW,hearts:3,level:1,wave:1,waveElapsed:0,waveDuration:durationForWave(1,1),waveSpawned:0,waveQuota:quotaForWave(1,1),betweenWaves:1.8,defenders:[],zombies:[],drops:[],selected:null,inspectDefenderId:null,moveDefenderId:null,lastTapKey:'',lastTapAt:0,cooldowns:{},wildAphidTimer:5.5,lastTime:performance.now(),id:1});entityLayer.innerHTML='';dropLayer.innerHTML='';endOverlay.classList.remove('show');pauseOverlay.classList.remove('show');endOverlay.setAttribute('aria-hidden','true');pauseOverlay.setAttribute('aria-hidden','true');pauseBtn.textContent='⏸️';statusText.textContent='Level 1 — establish a fresh defense.';upgradeBtn.hidden=true;refreshCellHints();updateUI();updateCardStates();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)}
  function startGame(){menu.classList.remove('active');game.classList.add('active');resetGame()}
  function selectUnit(key){if(!state.running||state.paused||state.ended)return;if(state.moveDefenderId!==null)cancelMoveMode(false);clearInspection(false);const unit=UNITS[key];if((state.cooldowns[key]||0)>0){showToast(`${unit.name} is regrouping.`);return}if(state.honeydew<unit.cost){showToast(`Need ${unit.cost-state.honeydew} more Honeydew.`);return}state.selected=state.selected===key?null:key;refreshCellHints();updateCardStates();statusText.textContent=state.selected?`${unit.name} selected — tap an empty square.`:'Choose an ant, then tap a garden square.'}

  function onCellTap(event){if(!state.running||state.paused||state.ended)return;const row=Number(event.currentTarget.dataset.row),col=Number(event.currentTarget.dataset.col),occupant=getDefenderAt(row,col);
    if(state.moveDefenderId!==null){const moving=state.defenders.find(d=>d.id===state.moveDefenderId&&d.hp>0);if(!moving){cancelMoveMode();return}if(occupant&&occupant.id===moving.id){cancelMoveMode();showToast('Move cancelled.');return}if(col===0){showToast('Keep the first column clear for the human refuge.');return}if(occupant){showToast('That patch is already occupied.');return}if(state.honeydew<MOVE_COST){cancelMoveMode();showToast(`Need ${MOVE_COST} Honeydew to move an ant.`);return}state.honeydew-=MOVE_COST;moving.row=row;moving.col=col;state.moveDefenderId=null;state.lastTapKey='';state.lastTapAt=0;refreshCellHints();statusText.textContent=`${UNITS[moving.type].name} moved for ${MOVE_COST} Honeydew.`;showToast(`↔️ Ant moved! −${MOVE_COST} Honeydew`);tone(440,.05);updateUI();updateCardStates();render();return}
    if(!state.selected&&occupant){const now=performance.now(),key=`${row}:${col}`;if(state.lastTapKey===key&&now-state.lastTapAt<=DOUBLE_TAP_MS)beginMoveMode(occupant);else{state.lastTapKey=key;state.lastTapAt=now;inspectAnt(occupant)}return}
    state.lastTapKey='';state.lastTapAt=0;if(!state.selected){clearInspection(true);return}if(col===0){showToast('Keep the first column clear for the human refuge.');return}if(occupant){showToast('That patch is already occupied.');return}const key=state.selected,unit=UNITS[key];if(state.honeydew<unit.cost||(state.cooldowns[key]||0)>0)return;state.honeydew-=unit.cost;state.cooldowns[key]=unit.cooldown;const maxHp=maxHpFor(key,1);state.defenders.push({id:state.id++,type:key,level:1,row,col,hp:maxHp,maxHp,attackTimer:Math.random()*.25,genTimer:unit.kind==='generator'?unit.rate*.5:0});tone(360,.05);state.selected=null;refreshCellHints();statusText.textContent=`${unit.name} deployed.`;updateUI();updateCardStates();render()}

  function spawnZombie(){const debut=debutForCurrentWave();let type;if(state.waveSpawned===0&&debut)type=debut;else{const pool=zombiePool();type=pool[Math.floor(Math.random()*pool.length)]}const base=ZOMBIES[type],mult=zombieMultipliers(),maxHp=Math.round(base.hp*mult.hp);state.zombies.push({id:state.id++,type,row:Math.floor(Math.random()*ROWS),x:8.35,hp:maxHp,maxHp,damage:Math.round(base.damage*mult.damage),speed:base.speed*mult.speed,attackTimer:0,slowFactor:1,slowTimer:0});if(state.waveSpawned===0&&debut)showToast(`⚠️ New threat: ${base.name}!`);state.waveSpawned++}
  function spawnHoneydew(xPct,yPct,amount=25,source='aphid'){state.drops.push({id:state.id++,x:Math.max(7,Math.min(93,xPct)),y:Math.max(9,Math.min(91,yPct)),amount,source,life:9});renderDrops()}
  function collectDrop(id){if(!state.running||state.paused||state.ended)return;const index=state.drops.findIndex(d=>d.id===id);if(index<0)return;const drop=state.drops[index];state.honeydew+=drop.amount;state.drops.splice(index,1);tone(620,.04);updateUI();updateCardStates();renderDrops()}

  function advanceWaveOrLevel(){const wavesHere=wavesForLevel(state.level);if(state.wave<wavesHere){state.wave++;prepareWave();state.betweenWaves=2.7;const bonus=waveBonus(state.level,state.wave);state.honeydew+=bonus;cancelMoveMode(false);clearInspection(false);state.selected=null;refreshCellHints();statusText.textContent=`Level ${state.level}, wave ${state.wave} incoming — +${bonus} Honeydew.`;showToast(`🌙 Wave ${state.wave}/${wavesHere} incoming! +${bonus}`);tone(700,.08);return}if(state.level>=FINAL_LEVEL){endGame(true);return}state.level++;state.wave=1;state.hearts=3;state.honeydew=STARTING_HONEYDEW;state.defenders=[];state.zombies=[];state.drops=[];state.cooldowns={};state.selected=null;state.inspectDefenderId=null;state.moveDefenderId=null;state.lastTapKey='';state.lastTapAt=0;state.wildAphidTimer=5;entityLayer.innerHTML='';dropLayer.innerHTML='';prepareWave();state.betweenWaves=4.2;upgradeBtn.hidden=true;refreshCellHints();statusText.textContent=`LEVEL ${state.level} — new battlefield. Rebuild your defense.`;showToast(`🌱 LEVEL ${state.level}/${FINAL_LEVEL} — board cleared!`);tone(860,.11);updateUI();updateCardStates()}

  function update(dt){if(!state.running||state.paused||state.ended)return;Object.keys(state.cooldowns).forEach(k=>state.cooldowns[k]=Math.max(0,state.cooldowns[k]-dt));state.wildAphidTimer-=dt;if(state.wildAphidTimer<=0){spawnHoneydew(10+Math.random()*26,12+Math.random()*74,20,'wild');state.wildAphidTimer=9.2+Math.random()*2.1}state.drops.forEach(d=>d.life-=dt);state.drops=state.drops.filter(d=>d.life>0);if(state.betweenWaves>0)state.betweenWaves-=dt;else{state.waveElapsed+=dt;const spawnEvery=state.waveDuration/state.waveQuota;if(state.waveSpawned<state.waveQuota&&state.waveElapsed>=state.waveSpawned*spawnEvery)spawnZombie()}
    for(const defender of state.defenders){if(defender.hp<=0)continue;const unit=effectiveUnit(defender);if(unit.kind==='generator'){defender.genTimer-=dt;if(defender.genTimer<=0){spawnHoneydew(((defender.col+.5)/COLS)*100,((defender.row+.5)/ROWS)*100,unit.amount,'aphid');defender.genTimer=unit.rate}continue}if(unit.kind==='tank')continue;defender.attackTimer-=dt;const targets=state.zombies.filter(z=>z.hp>0&&z.row===defender.row&&z.x>defender.col+.25).sort((a,b)=>a.x-b.x),target=targets[0];if(!target||defender.attackTimer>0)continue;if(unit.kind==='melee'){if(target.x-defender.col<=1.15){hitZombie(target,unit.damage);target.x=Math.min(8.25,target.x+unit.knockback);defender.attackTimer=unit.rate;flashProjectile(defender,target,'snap',.16);tone(190,.035)}}else{hitZombie(target,unit.damage);if(unit.slow){target.slowFactor=unit.slow;target.slowTimer=unit.slowTime}if(unit.splash)state.zombies.forEach(other=>{if(other.id!==target.id&&other.hp>0&&other.row===target.row&&Math.abs(other.x-target.x)<=unit.splash)hitZombie(other,Math.round(unit.damage*.55))});defender.attackTimer=unit.rate;flashProjectile(defender,target,unit.shot,.22);tone(unit.shot==='silk'?420:unit.shot==='venom'?210:520,.025)}}
    for(const zombie of state.zombies){if(zombie.hp<=0)continue;const base=ZOMBIES[zombie.type];zombie.attackTimer-=dt;if(zombie.slowTimer>0){zombie.slowTimer-=dt;if(zombie.slowTimer<=0)zombie.slowFactor=1}const reach=base.reach||.62,blocker=state.defenders.filter(d=>d.hp>0&&d.row===zombie.row&&d.col<zombie.x&&zombie.x-d.col<reach).sort((a,b)=>b.col-a.col)[0];if(blocker){if(zombie.attackTimer<=0){blocker.hp-=zombie.damage;zombie.attackTimer=base.rate;tone(zombie.type==='exterminator'?165:120,.025)}}else{zombie.x-=zombie.speed*zombie.slowFactor*dt;if(zombie.x<=.22){zombie.hp=0;state.hearts--;showToast('A zombie reached the human refuge!');tone(90,.16);if(state.hearts<=0)endGame(false)}}}
    state.zombies=state.zombies.filter(z=>z.hp>0);state.defenders=state.defenders.filter(d=>d.hp>0);if(state.moveDefenderId!==null&&!state.defenders.some(d=>d.id===state.moveDefenderId))cancelMoveMode();if(state.inspectDefenderId!==null&&!state.defenders.some(d=>d.id===state.inspectDefenderId))clearInspection(true);if(state.waveSpawned>=state.waveQuota&&state.zombies.length===0&&state.betweenWaves<=0)advanceWaveOrLevel()}

  function hitZombie(zombie,damage){zombie.hp-=damage}
  function flashProjectile(defender,zombie,kind,duration){const projectile=document.createElement('div');projectile.className=`projectile ${kind}`;projectile.style.left=`${((defender.col+.62)/COLS)*100}%`;projectile.style.top=`${((defender.row+.5)/ROWS)*100}%`;const targetX=(zombie.x/COLS)*100;entityLayer.appendChild(projectile);requestAnimationFrame(()=>{projectile.style.transition=`left ${duration}s linear, transform ${duration}s ease`;projectile.style.left=`${targetX}%`;if(kind==='venom'||kind==='snap')projectile.style.transform='scale(2.05)'});setTimeout(()=>projectile.remove(),duration*1000+70)}

  function render(){entityLayer.querySelectorAll('.entity').forEach(node=>node.remove());const inspected=inspectedDefender();for(const defender of state.defenders){const el=document.createElement('div');el.className=`entity defender${defender.id===state.moveDefenderId?' moving-ant':''}${inspected&&defender.id===inspected.id?' selected-ant':''}`;el.style.left=`${((defender.col+.5)/COLS)*100}%`;el.style.top=`${((defender.row+.5)/ROWS)*100}%`;const hp=Math.max(0,defender.hp/defender.maxHp*100),levelBadge=(defender.level||1)>1?`<span class="ant-level">★${defender.level}</span>`:'';el.innerHTML=`${antSprite(defender.type)}${levelBadge}<span class="hp"><span style="width:${hp}%"></span></span>`;entityLayer.appendChild(el)}for(const zombie of state.zombies){const info=ZOMBIES[zombie.type],el=document.createElement('div');el.className=`entity zombie${zombie.slowFactor<1?' slowed':''}`;el.dataset.zombieType=zombie.type;el.style.left=`${(zombie.x/COLS)*100}%`;el.style.top=`${((zombie.row+.5)/ROWS)*100}%`;const hp=Math.max(0,zombie.hp/zombie.maxHp*100);el.innerHTML=`<span class="sprite">${info.icon}</span><span class="hp"><span style="width:${hp}%"></span></span>`;entityLayer.appendChild(el)}renderDrops()}
  function renderDrops(){const liveIds=new Set(state.drops.map(d=>String(d.id)));for(const child of Array.from(dropLayer.children))if(!liveIds.has(child.dataset.dropId))child.remove();for(const drop of state.drops){let button=dropLayer.querySelector(`[data-drop-id="${drop.id}"]`);if(!button){button=document.createElement('button');button.type='button';button.className='honeydew-drop';button.dataset.dropId=String(drop.id);button.innerHTML=`<span class="drop-gem" aria-hidden="true"></span><span class="drop-value">+${drop.amount}</span>`;button.setAttribute('aria-label',`Collect ${drop.amount} Honeydew`);button.addEventListener('pointerdown',event=>{event.preventDefault();collectDrop(drop.id)},{passive:false});dropLayer.appendChild(button)}button.style.left=`${drop.x}%`;button.style.top=`${drop.y}%`}}

  function updateUI(){honeydewValue.textContent=String(Math.floor(state.honeydew));heartValue.textContent='❤️'.repeat(Math.max(0,state.hearts))+'🖤'.repeat(Math.max(0,3-state.hearts));waveText.textContent=`Level ${state.level}/${FINAL_LEVEL} · Wave ${state.wave}/${wavesForLevel(state.level)}`;waveFill.style.width=`${Math.round((state.waveQuota?Math.min(1,state.waveSpawned/state.waveQuota):0)*100)}%`;if(state.betweenWaves>0&&state.moveDefenderId===null&&!state.selected&&!inspectedDefender())statusText.textContent=`Level ${state.level} · Wave ${state.wave} begins in ${Math.max(1,Math.ceil(state.betweenWaves))}…`;updateUpgradeButton()}
  function updateCardStates(){document.querySelectorAll('.bug-card').forEach(button=>{const key=button.dataset.bug,unit=UNITS[key],cooldown=state.cooldowns[key]||0;button.classList.toggle('selected',state.selected===key);button.disabled=state.ended||state.paused||state.honeydew<unit.cost||cooldown>0;button.querySelector('.cooldown').style.height=`${Math.min(100,cooldown/unit.cooldown*100)}%`;button.setAttribute('aria-label',`${unit.name}, costs ${unit.cost} Honeydew, ${unit.role}${cooldown>0?`, ready in ${Math.ceil(cooldown)} seconds`:''}`)});updateUpgradeButton()}
  function showToast(text){toast.textContent=text;toast.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>toast.classList.remove('show'),1500)}
  function togglePause(force){if(!state.running||state.ended)return;state.paused=typeof force==='boolean'?force:!state.paused;pauseOverlay.classList.toggle('show',state.paused);pauseOverlay.setAttribute('aria-hidden',String(!state.paused));pauseBtn.textContent=state.paused?'▶️':'⏸️';pauseBtn.setAttribute('aria-label',state.paused?'Resume game':'Pause game');if(!state.paused)state.lastTime=performance.now();updateCardStates()}
  function endGame(won){if(state.ended)return;state.ended=true;state.running=false;cancelMoveMode(false);clearInspection(false);document.getElementById('endIcon').textContent=won?'🏆🐜':'🪦🐜';document.getElementById('endTitle').textContent=won?'Humanity Saved!':'Refuge Overrun';document.getElementById('endText').textContent=won?`All ${FINAL_LEVEL} levels cleared. The tiny human refuge is safe — for now.`:`The refuge fell during Level ${state.level}, Wave ${state.wave}. The ants are demanding a rematch.`;endOverlay.classList.add('show');endOverlay.setAttribute('aria-hidden','false');tone(won?760:120,won?.18:.28);updateCardStates()}
  function tone(freq,duration){try{if(!window.AudioContext&&!window.webkitAudioContext)return;if(!tone.ctx)tone.ctx=new(window.AudioContext||window.webkitAudioContext)();const ctx=tone.ctx,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.028,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration)}catch(_){}}
  function loop(now){if(!state.running&&state.ended)return;const dt=Math.min(.05,Math.max(0,(now-state.lastTime)/1000));state.lastTime=now;if(!state.paused)update(dt);updateUI();updateCardStates();render();if(!state.ended)raf=requestAnimationFrame(loop)}

  upgradeBtn.addEventListener('click',upgradeInspectedAnt);
  document.getElementById('startBtn').addEventListener('click',startGame);
  document.getElementById('againBtn').addEventListener('click',resetGame);
  document.getElementById('menuBtn').addEventListener('click',()=>{cancelAnimationFrame(raf);state.running=false;state.ended=true;cancelMoveMode(false);clearInspection(false);game.classList.remove('active');menu.classList.add('active');endOverlay.classList.remove('show')});
  pauseBtn.addEventListener('click',()=>togglePause());
  document.getElementById('resumeBtn').addEventListener('click',()=>togglePause(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused&&!state.ended)togglePause(true)});

  makeGrid();
  makeCards();
  updateUI();
})();