import './style.css';
import { Sfx } from './audio';
import { type Challenge, challengeFor, challengeResult } from './challenges';
import { Game } from './game';
import { giftFor, type Gift, LIVERIES, type LiveryId } from './liveries';
import { H, W } from './layout';
import { buildGentlerLevel, buildGradedLevel } from './grade';
import { twistFor } from './level';
import { Renderer } from './render';
import {
  BANK_CAP,
  bankAfterWin,
  bonusSpots,
  freeBoosters,
  rateLevel,
  spotGoal,
  starPoints,
  STARS_PER_BONUS,
} from './stars';
import type { Difficulty, LevelData, Twist } from './types';

const LEVEL_KEY = 'pack-a-bus.level';
const SOUND_KEY = 'pack-a-bus.muted';
const SHAPES_KEY = 'pack-a-bus.shapes';
const starsKey = (n: number) => `pack-a-bus.stars.${n}`;
/** Difficulty flag of a won level, so its stars keep their multiplier in the total. */
const diffKey = (n: number) => `pack-a-bus.diff.${n}`;
const SEEN_LOCKS_KEY = 'pack-a-bus.seen.locks';
/** Legacy: older saves counted spent bonus +Spots instead of keeping a bank. */
const BONUS_SPENT_KEY = 'pack-a-bus.bonus-spent';
const BANK_KEY = 'pack-a-bus.bank';
/** How many liveries beyond Classic are unlocked, and which one is equipped. */
const LIVERIES_KEY = 'pack-a-bus.liveries';
const LIVERY_KEY = 'pack-a-bus.livery';
/** Stars from gift boxes opened after every livery is collected. */
const GIFT_STARS_KEY = 'pack-a-bus.gift-stars';

const TWIST_INFO: Record<Twist, { title: string; text: string }> = {
  mystery: {
    title: 'Mystery Mayhem',
    text: 'Most buses hide their color until their way out is clear.',
  },
  rush: { title: 'Rush Hour', text: 'Less time on the clock. Move fast!' },
  tight: { title: 'Tight Squeeze', text: 'One parking spot is closed. Plan every move.' },
};

const DIFFICULTY_INFO: Record<Difficulty, { title: string; text: string; win: string }> = {
  hard: {
    title: '⚠ Hard Level',
    text: 'Our test bot needed both boosters to get through this one. Your first booster is free, and stars count ×2.',
    win: 'Hard Level Beaten!',
  },
  super: {
    title: '☠ Super Hard',
    text: 'Our test bot couldn’t beat this one, even with both boosters. Boosters are free, and stars count ×3.',
    win: 'Super Hard Beaten!',
  },
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
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
renderer.reducedMotion = !!reducedMotion?.matches;
reducedMotion?.addEventListener?.('change', (e) => (renderer.reducedMotion = e.matches));
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
  modalNote: $('#modal-note'),
  modalBar: $('#modal-bar'),
  modalSegs: $('#modal-segs'),
  modalBtn: $<HTMLButtonElement>('#modal-btn'),
  modalAlt: $<HTMLButtonElement>('#modal-alt'),
  modalGift: $('#modal-gift'),
  shapes: $<HTMLButtonElement>('#btn-shapes'),
  challenge: $('#challenge'),
  garageBtn: $<HTMLButtonElement>('#btn-garage'),
  garage: $('#garage'),
  garageGrid: $('#garage .grid'),
  garageClose: $<HTMLButtonElement>('#garage-close'),
};

/** Saved non-negative integer, or `fallback` if missing or junk; never above `max`. */
function loadInt(key: string, max: number, fallback = 0): number {
  const v = parseInt(load(key) ?? '', 10);
  return Number.isSafeInteger(v) && v >= 0 ? Math.min(v, max) : fallback;
}

const unlockedLiveries = () => loadInt(LIVERIES_KEY, LIVERIES.length - 1);

/** The equipped livery, if it's actually unlocked; otherwise Classic. */
function equippedLivery(): LiveryId {
  const id = load(LIVERY_KEY);
  const i = LIVERIES.findIndex((l) => l.id === id);
  return i >= 0 && i <= unlockedLiveries() ? LIVERIES[i].id : 'classic';
}

function equipLivery(id: LiveryId): void {
  save(LIVERY_KEY, id);
  renderer.livery = id;
}
renderer.livery = equippedLivery();

// Saved progress is untrusted (other pages on this origin can write it), so clamp it.
const MAX_LEVEL = 100_000;
const clampLevel = (n: number): number =>
  Number.isSafeInteger(n) && n >= 1 ? Math.min(n, MAX_LEVEL) : 1;

let levelNum = clampLevel(parseInt(load(LEVEL_KEY) ?? '1', 10));
let game: Game;
let paused = true;
let modalAction: () => void = () => {};
let altAction: (() => void) | null = null;
/** Level whose intro cards were already shown, so retries skip straight to play. */
let introShownFor = 0;
/** Losses on the current level this session; after a few, a gentler layout is offered. */
let failsOnLevel = 0;
const FAILS_BEFORE_HELP = 3;
/** Playing the opt-in gentler layout, which tops out at 2 stars. */
let gentle = false;
const GENTLE_STAR_CAP = 2;
/** The current level's bonus challenge, if it has one. */
let challenge: Challenge | null = null;

// Generate before saving, so a level that fails to build is never persisted and
// can't brick every reload. On failure, skip ahead a few levels, then fall back to 1.
function buildLevel(n: number, easier: boolean): { n: number; level: LevelData } {
  const build = easier ? buildGentlerLevel : buildGradedLevel;
  for (let i = 0; i < 5 && n + i <= MAX_LEVEL; i++) {
    try {
      return { n: n + i, level: build(n + i) };
    } catch (err) {
      console.error(err);
    }
  }
  return { n: 1, level: buildGradedLevel(1) };
}

function startLevel(requested: number, easier = false): void {
  const { n, level } = buildLevel(clampLevel(requested), easier);
  if (n !== levelNum) failsOnLevel = 0;
  gentle = easier && n === requested;
  levelNum = n;
  save(LEVEL_KEY, String(n));
  game = new Game(level, {
    sound: (name, detail) => sfx.play(name, detail),
    toast,
    stuck: () => {
      el.vip.classList.toggle('pulse', game.canUseVip());
      el.slot.classList.toggle('pulse', game.canUseSlot());
    },
    end: (won, reason) => (won ? showWin(reason) : showFail(reason)),
    closeCall: () => showBanner('CLOSE CALL!'),
    bonusSpotUsed: () => setBank(bank() - 1),
  }, bank());
  challenge = challengeFor(level);
  el.challenge.classList.toggle('hidden', !challenge);
  el.level.textContent = String(n);
  const pill = el.level.parentElement!;
  pill.classList.toggle('special', !!level.twist);
  pill.classList.toggle('hard', level.difficulty === 'hard');
  pill.classList.toggle('super', level.difficulty === 'super');
  el.vip.classList.remove('pulse');
  el.slot.classList.remove('pulse');
  showTwistOrPlay();
  if (gentle) toast(`Gentler layout: up to ${GENTLE_STAR_CAP}★`);
}

/** Losing says how close you got, retries in one tap, and after a few losses offers an
 *  opt-in gentler layout (never forced, never sold). */
function showFail(reason: string): void {
  failsOnLevel++;
  const total = game.queue.length;
  const seated = total - game.remaining;
  const frac = total > 0 ? seated / total : 0;
  const pct = Math.round(frac * 100);
  const title = frac >= 0.85 ? 'So close!' : 'Level Failed';
  const offerHelp = failsOnLevel >= FAILS_BEFORE_HELP && !gentle;
  showModal(title, `${reason} You seated ${seated} of ${total} passengers.`, 'Try Again', () => startLevel(levelNum, gentle), {
    bar: { value: frac, label: `${pct}% seated` },
    alt: offerHelp
      ? { label: `Try a gentler layout (max ${GENTLE_STAR_CAP}★)`, action: () => startLevel(levelNum, true) }
      : undefined,
  });
}

/** Best stars saved for a level, 0 if never won (or the saved value is junk). */
function bestStars(n: number): number {
  const v = parseInt(load(starsKey(n)) ?? '', 10);
  return v >= 1 && v <= 3 ? v : 0;
}

function savedDifficulty(n: number): Difficulty | null {
  const v = load(diffKey(n));
  return v === 'hard' || v === 'super' ? v : null;
}

/** Sum of the best stars on every level won so far, with Hard/Super Hard multipliers. */
function totalStars(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^pack-a-bus\.stars\.(\d+)$/.exec(localStorage.key(i) ?? '');
      if (m) total += starPoints(bestStars(Number(m[1])), savedDifficulty(Number(m[1])));
    }
  } catch {
    // storage unavailable — no stars banked
  }
  return total + loadInt(GIFT_STARS_KEY, 1_000_000);
}

/** Opens the gift for a completed challenge: the next livery, or bonus stars once the
 *  collection is complete. */
function openGift(): Gift {
  const gift = giftFor(unlockedLiveries());
  if (gift.kind === 'livery') save(LIVERIES_KEY, String(unlockedLiveries() + 1));
  else save(GIFT_STARS_KEY, String(loadInt(GIFT_STARS_KEY, 1_000_000) + gift.stars));
  return gift;
}

/** Banked bonus +Spots (0 to BANK_CAP). Saves from before the bank existed are converted
 *  once from their star total and spent count. */
function bank(): number {
  const raw = load(BANK_KEY);
  if (raw === null) {
    const spent = parseInt(load(BONUS_SPENT_KEY) ?? '0', 10);
    const migrated = bonusSpots(totalStars(), Number.isSafeInteger(spent) && spent > 0 ? spent : 0);
    setBank(migrated);
    return migrated;
  }
  const v = parseInt(raw, 10);
  return Number.isSafeInteger(v) ? Math.max(0, Math.min(BANK_CAP, v)) : 0;
}

function setBank(n: number): void {
  save(BANK_KEY, String(Math.max(0, Math.min(BANK_CAP, n))));
}

function showWin(reason: string): void {
  const difficulty = game.level.difficulty;
  const free = freeBoosters(difficulty);
  const goal = spotGoal(game.level.slots);
  const rating = rateLevel({
    boostersUsed: game.boostersUsed,
    free,
    peakSpots: game.peakSpots,
    spotGoal: goal,
    cap: gentle ? GENTLE_STAR_CAP : 3,
  });
  const stars = rating.stars;
  const best = bestStars(levelNum);
  failsOnLevel = 0;
  const before = totalStars();
  if (stars > best) save(starsKey(levelNum), String(stars));
  if (difficulty) save(diffKey(levelNum), difficulty);
  const challengeMet = !!challenge && challengeResult(challenge, game.challengeStats(), true).met;
  const gift = challengeMet ? openGift() : null;
  const after = totalStars();
  const banked = bankAfterWin(bank(), before, after);
  setBank(banked.bank);

  // A checklist of the three stars, so it's clear what to do differently next time.
  const allowed = free > 0 ? `${free} free on this level` : 'none allowed';
  const lines = [
    reason,
    '✓ Cleared',
    rating.clean
      ? `✓ Clean: no extra boosters`
      : `✗ Clean: used ${game.boostersUsed} booster${game.boostersUsed > 1 ? 's' : ''} (${allowed})`,
    rating.efficient
      ? `✓ Efficient: kept a spot free (at most ${game.peakSpots} of ${game.level.slots} full)`
      : `✗ Efficient: keep one spot free (you filled ${game.peakSpots} of ${game.level.slots})`,
  ];
  if (challenge) lines.push(`${challengeMet ? '🎯' : '✗'} Bonus challenge: ${challenge.title}`);
  const extras: string[] = [];
  if (stars > best && best > 0) extras.push('New best!');
  else if (best > stars) extras.push(`Your best: ${'★'.repeat(best)}`);
  if (gentle) extras.push(`Gentler layout: replay the normal one for 3★.`);
  if (twistFor(levelNum + 1)) extras.push('Next up: a special level!');
  if (extras.length) lines.push(extras.join(' '));

  const notes: string[] = [];
  if (difficulty) notes.push(`×${difficulty === 'super' ? 3 : 2} stars: +${starPoints(stars, difficulty)} toward your total`);
  const title = difficulty
    ? DIFFICULTY_INFO[difficulty].win
    : gift
      ? 'Challenge Complete!'
      : game.closeCall
        ? 'Close Call!'
        : 'Level Complete!';
  if (difficulty) sfx.play('close');
  if (gift) window.setTimeout(() => sfx.play('unlock'), 900);
  const newLivery = gift?.kind === 'livery' ? gift.livery : null;
  showModal(title, lines.join('\n'), 'Next Level', () => startLevel(levelNum + 1), {
    stars,
    tone: difficulty ? 'danger' : gift ? 'gold' : undefined,
    note: notes.length ? notes.join(' · ') : undefined,
    segs: { before, after, earned: banked.earned, full: banked.full },
    gift: gift ?? undefined,
    alt: newLivery
      ? {
          label: `Paint my buses: ${newLivery.name}`,
          action: () => {
            equipLivery(newLivery.id);
            toast(`${newLivery.name} equipped`);
            startLevel(levelNum + 1);
          },
        }
      : undefined,
  });
}

/** The gift box on the win card: it shakes, pops, and reveals what was inside. */
function renderGift(gift: Gift): void {
  const canvas = el.modalGift.querySelector('canvas')!;
  const label = el.modalGift.querySelector('.label')!;
  // Re-create the box so its animation replays.
  const box = el.modalGift.querySelector('.box')!;
  box.replaceWith(box.cloneNode(true));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = 320 * dpr;
  canvas.height = 110 * dpr;
  const preview = new Renderer(canvas.getContext('2d')!);
  if (gift.kind === 'livery') {
    preview.drawPreview('blue', gift.livery.id, 320, 110, dpr);
    label.textContent = `🎁 New paint job: ${gift.livery.name}!`;
  } else {
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    label.textContent = `🎁 +${gift.stars} ★ (every paint job collected!)`;
  }
}

/** Progress toward the next bonus +Spot: the stars you already had, then this level's
 *  new ones lighting up one by one. Crossing the line fills the bar and announces it,
 *  or says the bank is full. */
function renderSegs(before: number, after: number, earned: boolean, full: boolean): void {
  const track = el.modalSegs.querySelector('.track')!;
  const label = el.modalSegs.querySelector('.label')!;
  const crossed = earned || full;
  const had = before % STARS_PER_BONUS;
  const have = crossed ? STARS_PER_BONUS : after % STARS_PER_BONUS;
  track.replaceChildren(
    ...Array.from({ length: STARS_PER_BONUS }, (_, i) => {
      const seg = document.createElement('span');
      if (i < had) seg.className = 'on';
      else if (i < have) {
        seg.className = 'on new';
        seg.style.animationDelay = `${0.55 + (i - had) * 0.12}s`;
      }
      return seg;
    }),
  );
  label.textContent = earned
    ? `🎁 Bonus +Spot earned! ${bank()}/${BANK_CAP} banked`
    : full
      ? `Bank full (${BANK_CAP}/${BANK_CAP}): spend a +Spot to earn more`
      : `${STARS_PER_BONUS - (after % STARS_PER_BONUS)} more ★ for a bonus +Spot`;
  el.modalSegs.classList.toggle('earned', earned);
}

interface Card {
  title: string;
  text: string;
  button: string;
  tone: 'gold' | 'danger';
  onClose?: () => void;
}

/** Intro cards for a level, shown one after another before play: the special-level
 *  twist, the Hard/Super Hard warning, and (once ever) how locked buses work.
 *  Retrying the same level skips them. */
function showTwistOrPlay(): void {
  const level = game.level;
  const cards: Card[] = [];
  if (introShownFor !== level.level) {
    if (level.twist) {
      const info = TWIST_INFO[level.twist];
      cards.push({ title: `★ ${info.title} ★`, text: `Special level! ${info.text}`, button: 'Go!', tone: 'gold' });
    }
    if (level.difficulty) {
      const info = DIFFICULTY_INFO[level.difficulty];
      cards.push({ title: info.title, text: info.text, button: 'Bring it on', tone: 'danger' });
    }
    if (challenge) {
      const next = giftFor(unlockedLiveries());
      const prize = next.kind === 'livery' ? `the ${next.livery.name} paint job` : `${next.stars} bonus ★`;
      cards.push({
        title: `🎯 Bonus Challenge: ${challenge.title}`,
        text: `${challenge.text}\nPull it off to open a 🎁 gift: ${prize}.`,
        button: 'Challenge accepted',
        tone: 'gold',
      });
    }
  }
  if (level.buses.some((b) => b.lock >= 0) && load(SEEN_LOCKS_KEY) !== '1') {
    cards.push({
      title: '🔒 Locked Buses',
      text: 'New! A bus with a padlock can’t leave until the bus with the matching key has left the lot.',
      button: 'Got it',
      tone: 'gold',
      // Only once it's actually been read (the title card can cover it at boot).
      onClose: () => save(SEEN_LOCKS_KEY, '1'),
    });
  }
  const next = (): void => {
    const card = cards.shift();
    if (!card) {
      introShownFor = level.level;
      hideModal();
      return;
    }
    showModal(card.title, card.text, card.button, () => {
      card.onClose?.();
      next();
    }, { tone: card.tone });
  };
  next();
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
  opts: {
    stars?: number;
    tone?: 'gold' | 'danger';
    note?: string;
    /** A plain progress bar (how much of a failed level got done). */
    bar?: { value: number; label: string };
    /** Star progress toward the next bonus +Spot. */
    segs?: { before: number; after: number; earned: boolean; full: boolean };
    /** A secondary, quieter choice under the main button. */
    alt?: { label: string; action: () => void };
    /** A gift box that opens on the card. */
    gift?: Gift;
  } = {},
): void {
  el.modalCard.classList.toggle('special', opts.tone === 'gold');
  el.modalCard.classList.toggle('danger', opts.tone === 'danger');
  el.modalNote.textContent = opts.note ?? '';
  el.modalNote.classList.toggle('hidden', !opts.note);
  el.modalBar.classList.toggle('hidden', !opts.bar);
  if (opts.bar) {
    const pct = Math.round(opts.bar.value * 100);
    el.modalBar.setAttribute('aria-valuenow', String(pct));
    (el.modalBar.querySelector('.fill') as HTMLElement).style.width = `${pct}%`;
    el.modalBar.querySelector('.label')!.textContent = opts.bar.label;
  }
  el.modalSegs.classList.toggle('hidden', !opts.segs);
  if (opts.segs) renderSegs(opts.segs.before, opts.segs.after, opts.segs.earned, opts.segs.full);
  el.modalGift.classList.toggle('hidden', !opts.gift);
  if (opts.gift) renderGift(opts.gift);
  el.modalAlt.classList.toggle('hidden', !opts.alt);
  el.modalAlt.textContent = opts.alt?.label ?? '';
  altAction = opts.alt?.action ?? null;
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
  startLevel(levelNum, gentle);
});
el.modalAlt.addEventListener('click', () => {
  sfx.unlock();
  altAction?.();
});
function setPassengerShapes(on: boolean): void {
  renderer.passengerShapes = on;
  el.shapes.setAttribute('aria-pressed', String(on));
  el.shapes.classList.toggle('active', on);
}
setPassengerShapes(load(SHAPES_KEY) === '1');
el.shapes.addEventListener('click', () => {
  sfx.unlock();
  const on = !renderer.passengerShapes;
  setPassengerShapes(on);
  save(SHAPES_KEY, on ? '1' : '0');
  toast(on ? 'Shapes on passengers: on' : 'Shapes on passengers: off');
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
  if (challenge) {
    const r = challengeResult(challenge, game.challengeStats(), game.status === 'won');
    el.challenge.querySelector('.label')!.textContent = r.label;
    el.challenge.classList.toggle('done', r.met);
    el.challenge.classList.toggle('failed', r.failed);
  }
}

/** Garage: preview every paint job; unlocked ones can be equipped, locked ones show which
 *  gift unlocks them, so the next reward is always in sight. */
let pausedBeforeGarage = false;
function openGarage(): void {
  pausedBeforeGarage = paused;
  paused = true;
  renderGarage();
  el.garage.classList.remove('hidden');
}

function renderGarage(): void {
  const unlocked = unlockedLiveries();
  const current = equippedLivery();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const sample = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'white'] as const;
  el.garageGrid.replaceChildren(
    ...LIVERIES.map((livery, i) => {
      const tile = document.createElement('button');
      const locked = i > unlocked;
      const isNext = i === unlocked + 1;
      tile.className = `tile${locked ? ' locked' : ''}${isNext ? ' next' : ''}${livery.id === current ? ' selected' : ''}`;
      const c = document.createElement('canvas');
      c.width = 170 * dpr;
      c.height = 64 * dpr;
      new Renderer(c.getContext('2d')!).drawPreview(sample[i % sample.length], livery.id, 170, 64, dpr);
      const name = document.createElement('span');
      name.textContent = locked ? (i === unlocked + 1 ? `🔒 Next gift: ${livery.name}` : `🔒 ${livery.name}`) : livery.name;
      tile.append(c, name);
      tile.setAttribute('aria-label', locked ? `${livery.name}, locked` : `Equip ${livery.name}`);
      tile.disabled = locked;
      tile.addEventListener('click', () => {
        sfx.play('tap');
        equipLivery(livery.id);
        renderGarage();
      });
      return tile;
    }),
  );
}

el.garageBtn.addEventListener('click', () => {
  sfx.unlock();
  openGarage();
});
el.garageClose.addEventListener('click', () => {
  el.garage.classList.add('hidden');
  paused = pausedBeforeGarage;
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !document.hidden) game.update(dt);
  renderer.draw(game, paused ? 0 : dt);
  syncHud();
  requestAnimationFrame(frame);
}

/** Star total, banked bonus spots, and how far off the next one is. */
function starSummary(): string {
  const total = totalStars();
  const banked = bank();
  const toNext = STARS_PER_BONUS - (total % STARS_PER_BONUS);
  const next = banked >= BANK_CAP ? 'bank full' : `${toNext} more for a bonus +Spot`;
  return `★ ${total} stars · ${next} · ${banked}/${BANK_CAP} +Spots banked`;
}

startLevel(levelNum);
showModal(
  'Pack-a-Bus',
  "Tap a bus to drive it out of the lot. It parks up top and picks up passengers of its color. Don't fill every spot with the wrong colors!",
  levelNum > 1 ? `Continue Level ${levelNum}` : 'Play',
  showTwistOrPlay,
  { note: starSummary() },
);
requestAnimationFrame(frame);
