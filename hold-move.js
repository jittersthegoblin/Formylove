(() => {
  'use strict';

  const board = document.getElementById('board');
  const entityLayer = document.getElementById('entities');
  const statusText = document.getElementById('statusText');
  if (!board || !entityLayer) return;

  const HOLD_MS = 650;
  const MOVE_TOLERANCE = 18;
  let activeHold = null;
  let suppressTrustedClickUntil = 0;

  const style = document.createElement('style');
  style.textContent = `
    .hold-move-meter {
      --hold-angle: 0deg;
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 4;
      width: 36px;
      height: 36px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: conic-gradient(#ffe071 var(--hold-angle), rgba(255,255,255,.16) 0deg);
      box-shadow: 0 2px 8px rgba(0,0,0,.34);
      pointer-events: none;
    }
    .hold-move-meter::before {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      background: rgba(36,55,30,.94);
      border: 1px solid rgba(255,255,255,.18);
    }
    .hold-move-meter::after {
      content: '↔';
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff3a2;
      font-size: 17px;
      font-weight: 1000;
      line-height: 1;
    }
    .cell.hold-move-active {
      background: rgba(255,224,113,.09) !important;
      box-shadow: inset 0 0 0 2px rgba(255,224,113,.24);
    }
    .cell.hold-move-ready .hold-move-meter {
      box-shadow: 0 0 0 4px rgba(255,224,113,.20), 0 0 18px rgba(255,224,113,.62);
      transform: translate(-50%, -50%) scale(1.08);
    }

    /* In landscape the six ant cards stay in one horizontal row. */
    @media (orientation: landscape) and (max-height: 560px) {
      .defender-bar {
        display: flex !important;
        align-items: stretch;
        gap: 6px;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scroll-snap-type: x proximity;
        -webkit-overflow-scrolling: touch;
      }
      .bug-card {
        flex: 0 0 86px !important;
        width: 86px !important;
        min-width: 86px !important;
        scroll-snap-align: start;
      }
    }

    @media (orientation: landscape) and (max-height: 410px) {
      .bug-card {
        flex-basis: 78px !important;
        width: 78px !important;
        min-width: 78px !important;
      }
      .hold-move-meter { width: 31px; height: 31px; }
    }
  `;
  document.head.appendChild(style);

  function cellCoordinates(cell) {
    return {
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col)
    };
  }

  function defenderAtCell(cell) {
    const { row, col } = cellCoordinates(cell);
    const defenders = entityLayer.querySelectorAll('.entity.defender');

    for (const defender of defenders) {
      const left = parseFloat(defender.style.left);
      const top = parseFloat(defender.style.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;

      const defenderCol = Math.round((left / 100) * 8 - 0.5);
      const defenderRow = Math.round((top / 100) * 5 - 0.5);
      if (defenderCol === col && defenderRow === row) return defender;
    }
    return null;
  }

  function removeMeter(cell) {
    if (!cell) return;
    cell.classList.remove('hold-move-active', 'hold-move-ready');
    cell.querySelector('.hold-move-meter')?.remove();
  }

  function cancelHold() {
    if (!activeHold) return;
    cancelAnimationFrame(activeHold.raf);
    removeMeter(activeHold.cell);
    activeHold = null;
  }

  function triggerExistingMoveMode(cell) {
    const selectedCard = document.querySelector('.bug-card.selected');
    if (selectedCard) selectedCard.click();

    suppressTrustedClickUntil = performance.now() + 900;

    // game.js already contains the move logic. Two synthetic taps reliably
    // activate that existing mode even on browsers where physical double-tap
    // timing is swallowed by touch handling.
    cell.click();
    setTimeout(() => cell.click(), 36);
  }

  function finishHold(hold) {
    if (!activeHold || activeHold !== hold || hold.completed) return;
    hold.completed = true;
    hold.cell.classList.add('hold-move-ready');
    hold.meter.style.setProperty('--hold-angle', '360deg');
    if (statusText) statusText.textContent = 'Move ready — tap an empty square. Moving costs 10 Honeydew.';
    triggerExistingMoveMode(hold.cell);

    setTimeout(() => {
      if (activeHold === hold) {
        removeMeter(hold.cell);
        activeHold = null;
      }
    }, 180);
  }

  function animateHold(now) {
    const hold = activeHold;
    if (!hold || hold.completed) return;

    const elapsed = now - hold.startedAt;
    const progress = Math.max(0, Math.min(1, elapsed / HOLD_MS));
    hold.meter.style.setProperty('--hold-angle', `${progress * 360}deg`);

    if (progress >= 1) {
      finishHold(hold);
      return;
    }
    hold.raf = requestAnimationFrame(animateHold);
  }

  board.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const cell = event.target.closest('.cell');
    if (!cell || !board.contains(cell)) return;
    if (!defenderAtCell(cell)) return;

    cancelHold();

    const meter = document.createElement('span');
    meter.className = 'hold-move-meter';
    meter.setAttribute('aria-hidden', 'true');
    cell.appendChild(meter);
    cell.classList.add('hold-move-active');

    activeHold = {
      cell,
      meter,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      completed: false,
      raf: 0
    };

    try { cell.setPointerCapture(event.pointerId); } catch (_) {}
    activeHold.raf = requestAnimationFrame(animateHold);
  }, { passive: true });

  board.addEventListener('pointermove', event => {
    if (!activeHold || activeHold.pointerId !== event.pointerId || activeHold.completed) return;
    const dx = event.clientX - activeHold.startX;
    const dy = event.clientY - activeHold.startY;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE) cancelHold();
  }, { passive: true });

  board.addEventListener('pointerup', event => {
    if (!activeHold || activeHold.pointerId !== event.pointerId) return;
    if (!activeHold.completed) cancelHold();
  }, { passive: true });

  board.addEventListener('pointercancel', cancelHold, { passive: true });
  board.addEventListener('lostpointercapture', () => {
    if (activeHold && !activeHold.completed) cancelHold();
  });

  board.addEventListener('contextmenu', event => {
    const cell = event.target.closest('.cell');
    if (cell && defenderAtCell(cell)) event.preventDefault();
  });

  // A real click is normally emitted after a successful long press. Suppress
  // that one click so it does not immediately cancel the newly activated move.
  board.addEventListener('click', event => {
    if (event.isTrusted && performance.now() < suppressTrustedClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
