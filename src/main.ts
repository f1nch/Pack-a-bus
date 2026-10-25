import './style.css';
import { Sfx } from './audio';
import { Game } from './game';
import { H, W } from './layout';
import { generateLevel, twistFor } from './level';
import { Renderer } from './render';
import { starsFor } from './stars';
import type { LevelData, Twist } from './types';

const LEVEL_KEY = 'pack-a-bus.level';
const SOUND_KEY = 'pack-a-bus.muted';
const starsKey = (n: number) => `pack-a-bus.stars.${n}`;
const SEEN_LOCKS_KEY = 'pack-a-bus.seen.locks';

const TWIST_INFO: Record<Twist, { title: string; text: string }> = {
  mystery: {
    title: 'Mystery Mayhem',
    text: 'Most buses hide their color until their way out is clear.',
  },
  rush: { title: 'Rush Hour', text: 'Less time on the clock. Move fast!' },
  tight: { title: 'Tight Squeeze', text: 'One parking spot is closed. Plan every move.' },
};

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode etc.) — progress just won't persist
  }
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const stage = $<HTMLDivElement>('#stage');
const canvas = $<HTMLCanvasElement>('#game');
const ui = $<HTMLDivElement>('#ui');
const ctx = canvas.getContext('2d')!;
const renderer = new Renderer(ctx);
const sfx = new Sfx();
sfx.muted = load(SOUND_KEY) === '1';

const el = {
  level: $('#level'),
  time: $('#time'),
  timer: $('.timer'),
  remain: $('#remain'),
  vip: $<HTMLButtonElement>('#btn-vip'),
  slot: $<HTMLButtonElement>('#btn-slot'),
  vipCount: $('#btn-vip .count'),
  slotCount: $('#btn-slot .count'),
  sound: $<HTMLButtonElement>('#btn-sound'),
  restart: $<HTMLButtonElement>('#btn-restart'),
  toast: $('#toast'),
  banner: $('#banner'),
  modal: $('#modal'),
  modalCard: $('#modal .card'),
  modalTitle: $('#modal-title'),
  modalStars: $('#modal-stars'),
  modalText: $('#modal-text'),
  modalBtn: $<HTMLButtonElement>('#modal-btn'),
};

// Saved progress is untrusted (other pages on this origin can write it), so clamp it.
const MAX_LEVEL = 100_000;
const clampLevel = (n: number): number =>
  Number.isSafeInteger(n) && n >= 1 ? Math.min(n, MAX_LEVEL) : 1;

let levelNum = clampLevel(parseInt(load(LEVEL_KEY) ?? '1', 10));
let game: Game;
let paused = true;
let modalAction: () => void = () => {};

// Generate before saving, so a level that fails to build is never persisted and
// can't brick every reload. On failure, skip ahead a few levels, then fall back to 1.
function buildLevel(n: number): { n: number; level: LevelData } {
  for (let i = 0; i < 5 && n + i <= MAX_LEVEL; i++) {
    try {
      return { n: n + i, level: generateLevel(n + i) };
    } catch (err) {
      console.error(err);
    }
  }
  return { n: 1, level: generateLevel(1) };
}

function startLevel(requested: number): void {
  const { n, level } = buildLevel(clampLevel(requested));
  levelNum = n;
  save(LEVEL_KEY, String(n));
  game = new Game(level, {
    sound: (name) => sfx.play(name),
    toast,
    stuck: () => {
      el.vip.classList.toggle('pulse', game.canUseVip());
      el.slot.classList.toggle('pulse', game.canUseSlot());
    },
    end: (won, reason) => {
      if (won) showWin(reason);
      else showModal('Level Failed', reason, 'Try Again', () => startLevel(levelNum));
    },
    closeCall: () => showBanner('CLOSE CALL!'),
  });
  el.level.textContent = String(n);
  el.level.parentElement!.classList.toggle('special', !!level.twist);
  el.vip.classList.remove('pulse');
  el.slot.classList.remove('pulse');
  showTwistOrPlay();
}

/** Best stars saved for a level, 0 if never won (or the saved value is junk). */
function bestStars(n: number): number {
  const v = parseInt(load(starsKey(n)) ?? '', 10);
  return v >= 1 && v <= 3 ? v : 0;
}

function showWin(reason: string): void {
  const stars = starsFor(game.time, game.level.time, game.boostersUsed);
  const best = bestStars(levelNum);
  if (stars > best) save(starsKey(levelNum), String(stars));

  const lines = [reason];
  if (stars > best && best > 0) lines.push('New best!');
  else if (best > stars) lines.push(`Your best: ${'★'.repeat(best)}`);
  if (stars < 3) {
    lines.push(game.boostersUsed > 0 ? 'Skip the boosters for more stars.' : 'Finish faster for more stars.');
  }
  if (twistFor(levelNum + 1)) lines.push('Next up: a special level!');
  const title = game.closeCall ? 'Close Call!' : 'Level Complete!';
  showModal(title, lines.join(' '), 'Next Level', () => startLevel(levelNum + 1), { stars });
}

/** Special levels open with a card explaining their twist, and the first level
 *  with locked buses explains those once. */
function showTwistOrPlay(): void {
  const twist = game.level.twist;
  if (twist) {
    const info = TWIST_INFO[twist];
    showModal(`★ ${info.title} ★`, `Special level! ${info.text}`, 'Go!', hideModal, { special: true });
  } else if (game.level.buses.some((b) => b.lock >= 0) && load(SEEN_LOCKS_KEY) !== '1') {
    showModal(
      '🔒 Locked Buses',
      'New! A bus with a padlock can’t leave until the bus with the matching key has left the lot.',
      'Got it',
      () => {
        // Only once it's actually been read (the title card can cover it at boot).
        save(SEEN_LOCKS_KEY, '1');
        hideModal();
      },
      { special: true },
    );
  } else {
    hideModal();
  }
}

let bannerTimer = 0;
function showBanner(text: string): void {
  el.banner.textContent = text;
  el.banner.classList.remove('show');
  void el.banner.offsetWidth; // restart the animation
  el.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => el.banner.classList.remove('show'), 1700);
}

let toastTimer = 0;
function toast(msg: string): void {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 1600);
}

function showModal(
  title: string,
  text: string,
  button: string,
  action: () => void,
  opts: { stars?: number; special?: boolean } = {},
): void {
  el.modalCard.classList.toggle('special', !!opts.special);
  el.modalStars.classList.toggle('hidden', opts.stars === undefined);
  if (opts.stars !== undefined) {
    // Re-create the stars so their pop-in animation replays every time.
    el.modalStars.setAttribute('aria-label', `${opts.stars} of 3 stars`);
    el.modalStars.replaceChildren(
      ...[0, 1, 2].map((i) => {
        const s = document.createElement('span');
        s.textContent = '★';
        s.classList.toggle('on', i < opts.stars!);
        return s;
      }),
    );
  }
  el.modalTitle.textContent = title;
  el.modalText.textContent = text;
  el.modalBtn.textContent = button;
  modalAction = action;
  el.modal.classList.remove('hidden');
  paused = true;
}

function hideModal(): void {
  el.modal.classList.add('hidden');
  paused = false;
}

el.modalBtn.addEventListener('click', () => {
  sfx.unlock();
  modalAction();
});
el.restart.addEventListener('click', () => {
  sfx.unlock();
  startLevel(levelNum);
});
el.sound.addEventListener('click', () => {
  sfx.unlock();
  sfx.muted = !sfx.muted;
  save(SOUND_KEY, sfx.muted ? '1' : '0');
});
el.vip.addEventListener('click', () => {
  sfx.unlock();
  game.toggleVip();
  el.vip.classList.remove('pulse');
});
el.slot.addEventListener('click', () => {
  sfx.unlock();
  game.useSlotBooster();
  el.slot.classList.remove('pulse');
});

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (paused) return;
  const r = canvas.getBoundingClientRect();
  game.tap(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
});

function resize(): void {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  stage.style.width = `${W * s}px`;
  stage.style.height = `${H * s}px`;
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
  ui.style.transform = `scale(${s})`;
  renderer.resize(s * dpr);
}
window.addEventListener('resize', resize);
resize();

function fmtTime(t: number): string {
  const s = Math.ceil(t);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function syncHud(): void {
  el.time.textContent = fmtTime(game.time);
  el.timer.classList.toggle('danger', game.time <= 10 && game.status === 'playing');
  el.remain.textContent = String(game.remaining);
  el.vipCount.textContent = String(game.boosters.vip);
  el.slotCount.textContent = String(game.boosters.slot);
  el.vip.classList.toggle('active', game.vipMode);
  el.vip.disabled = game.boosters.vip === 0;
  el.slot.disabled = !game.canUseSlot();
  el.sound.textContent = sfx.muted ? '🔇' : '🔊';
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !document.hidden) game.update(dt);
  renderer.draw(game, paused ? 0 : dt);
  syncHud();
  requestAnimationFrame(frame);
}

startLevel(levelNum);
showModal(
  'Pack-a-Bus',
  'Tap a bus to drive it out of the lot. It parks up top and picks up passengers of its color. Don\'t fill every spot with the wrong colors!',
  levelNum > 1 ? `Continue Level ${levelNum}` : 'Play',
  showTwistOrPlay,
);
requestAnimationFrame(frame);
