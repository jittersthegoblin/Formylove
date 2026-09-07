(() => {
  'use strict';

  const zombieSprites = {
    shambler: 'assets/sprites/zombies/shambler_zombie.png',
    runner: 'assets/sprites/zombies/runner_zombie.png',
    tinhead: 'assets/sprites/zombies/tinhead_zombie.png',
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

      const hat = zombie.querySelector('.zombie-hat')?.textContent || '';
      const emoji = holder.textContent || '';
      let type = 'shambler';

      if (hat.includes('🪣')) type = 'tinhead';
      else if (hat.includes('🪵')) type = 'brute';
      else if (emoji.includes('🧟‍♀️')) type = 'runner';

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

      const oldHat = zombie.querySelector('.zombie-hat');
      if (oldHat) oldHat.style.display = 'none';
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
