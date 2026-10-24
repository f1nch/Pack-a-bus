import './style.css';
import { Sfx } from './audio';
import { Game } from './game';
import { H, W } from './layout';
import { generateLevel } from './level';
import { Renderer } from './render';

const LEVEL_KEY = 'pack-a-bus.level';
const SOUND_KEY = 'pack-a-bus.muted';

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
  modal: $('#modal'),
  modalTitle: $('#modal-title'),
  modalText: $('#modal-text'),
  modalBtn: $<HTMLButtonElement>('#modal-btn'),
};

let levelNum = Math.max(1, parseInt(load(LEVEL_KEY) ?? '1', 10) || 1);
let game: Game;
let paused = true;
let modalAction: () => void = () => {};

function startLevel(n: number): void {
  levelNum = n;
  save(LEVEL_KEY, String(n));
  game = new Game(generateLevel(n), {
    sound: (name) => sfx.play(name),
    toast,
    stuck: () => {
      el.vip.classList.toggle('pulse', game.canUseVip());
      el.slot.classList.toggle('pulse', game.canUseSlot());
    },
    end: (won, reason) => {
      if (won) {
        showModal('Level Complete!', reason, 'Next Level', () => startLevel(levelNum + 1));
      } else {
        showModal('Level Failed', reason, 'Try Again', () => startLevel(levelNum));
      }
    },
  });
  el.level.textContent = String(n);
  el.vip.classList.remove('pulse');
  el.slot.classList.remove('pulse');
  hideModal();
}

let toastTimer = 0;
function toast(msg: string): void {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 1600);
}

function showModal(title: string, text: string, button: string, action: () => void): void {
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
  hideModal,
);
requestAnimationFrame(frame);
