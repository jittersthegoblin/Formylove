(() => {
  'use strict';

  /* Load the landscape/approach-lane overrides after the main stylesheets. */
  if (!document.querySelector('link[data-field-layout]')) {
    const layoutLink = document.createElement('link');
    layoutLink.rel = 'stylesheet';
    layoutLink.href = 'layout.css';
    layoutLink.dataset.fieldLayout = 'true';
    document.head.appendChild(layoutLink);
  }

  /* Load the reliable press-and-hold move control after game.js has initialized. */
  if (!document.querySelector('script[data-hold-move]')) {
    const holdScript = document.createElement('script');
    holdScript.src = 'hold-move.js';
    holdScript.dataset.holdMove = 'true';
    document.body.appendChild(holdScript);
  }

  const moveHelp = document.querySelector('.game-help span:last-child');
  if (moveHelp) {
    moveHelp.textContent = '4. Hold an ant until the circle fills to move it for 10 Honeydew';
  }

  const zombieSprites = {
    shambler: 'assets/sprites/zombies/shambler_zombie.png',
    runner: 'assets/sprites/zombies/runner_zombie.png',
    conehead: 'assets/sprites/zombies/conehead_zombie.png',
    tinhead: 'assets/sprites/zombies/tinhead_zombie.png',
    gardener: 'assets/sprites/zombies/gardener_zombie.png',
    exterminator: 'assets/sprites/zombies/exterminator_zombie.png',
    brute: 'assets/sprites/zombies/compost_brute_zombie.png'
  };

  Object.values(zombieSprites).forEach(src => {
    const image = new Image();
    image.src = src;
  });

  const entityLayer = document.getElementById('entities');
  if (!entityLayer) return;

  function applyZombieArt(root) {
    const zombies = [];
    if (root instanceof Element && root.matches('.entity.zombie')) zombies.push(root);
    if (root.querySelectorAll) zombies.push(...root.querySelectorAll('.entity.zombie'));

    zombies.forEach(zombie => {
      const holder = zombie.querySelector('.sprite');
      if (!holder || holder.dataset.spriteArt === 'ready') return;

      const type = zombie.dataset.zombieType && zombieSprites[zombie.dataset.zombieType]
        ? zombie.dataset.zombieType
        : 'shambler';

      zombie.classList.add(`zombie-art-${type}`);
      holder.textContent = '';
      holder.classList.add('zombie-sprite-holder');
      holder.dataset.spriteArt = 'ready';

      const image = document.createElement('img');
      image.src = zombieSprites[type];
      image.alt = '';
      image.draggable = false;
      image.setAttribute('aria-hidden', 'true');
      image.className = 'zombie-png-art';
      holder.appendChild(image);
    });
  }

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === 1) applyZombieArt(node);
      });
    });
  });

  observer.observe(entityLayer, { childList: true, subtree: true });
  applyZombieArt(entityLayer);
})();
