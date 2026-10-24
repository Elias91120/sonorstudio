import '@fontsource-variable/instrument-sans/wdth.css';
import { BASS, DRILL_PATTERNS } from '../core/drillPatterns';
import { colorAt } from '../core/palette';
import './landing.css';

/** The hero: PAV's first pattern as a step grid, lit in each channel's color, with a playhead at the beat's tempo. */
const STEPS = 32;
const BPM = 148;
const STEP_MS = 60_000 / BPM / 4;
// Top to bottom like a rack: hats, snares, kicks, then the 808.
const ROWS = [6, 4, 2, 3, 0, 1, BASS];
const LABELS = ['Hihat Monolith', 'Hihat Blazed', 'Countersnare', 'Countersnare 2', 'Kick Axel', 'Kick Chemist', '808 Omen'];

function buildGrid(el: HTMLElement) {
  const pattern = DRILL_PATTERNS[0];
  const cells: HTMLElement[][] = Array.from({ length: STEPS }, () => []);
  el.style.setProperty('--steps', String(STEPS));
  ROWS.forEach((ch, r) => {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.style.setProperty('--c', colorAt(ch));
    const label = document.createElement('span');
    label.className = 'grid-label';
    label.textContent = LABELS[r];
    row.append(label);
    const on = new Map<number, number>();
    if (ch === BASS) for (const [step, , len] of pattern.bass) on.set(step, len);
    else for (const [step, chans] of pattern.hits) if (chans.includes(ch)) on.set(step, 1);
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('span');
      cell.className = 'cell';
      if (s % 4 === 0) cell.classList.add('beat');
      if (s >= 16) cell.classList.add('bar2');
      const len = on.get(s);
      if (len) {
        cell.classList.add('on');
        if (len > 1) cell.style.setProperty('--len', String(len));
      }
      row.append(cell);
      cells[s].push(cell);
    }
    el.append(row);
  });
  return cells;
}

function animate(cells: HTMLElement[][]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let current = -1;
  let start = performance.now();
  let visible = true;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start = performance.now() - Math.max(0, current) * STEP_MS;
  }).observe(cells[0][0].closest('.grid')!);
  const frame = (now: number) => {
    if (visible) {
      // The frame time can be a little earlier than the start.
      const step = Math.floor(Math.max(0, now - start) / STEP_MS) % STEPS;
      if (step !== current) {
        if (current >= 0) for (const c of cells[current]) c.classList.remove('now');
        for (const c of cells[step]) {
          c.classList.add('now');
          if (c.classList.contains('on')) {
            // Restart the hit animation on every pass.
            c.classList.remove('hit');
            void c.offsetWidth;
            c.classList.add('hit');
          }
        }
        current = step;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const grid = document.getElementById('grid');
if (grid) animate(buildGrid(grid));

/** The demo film starts on a click, with its sound fading in, and pauses when it scrolls out of view. */
function setupVideo(video: HTMLVideoElement, button: HTMLButtonElement) {
  const fadeIn = () => {
    video.volume = 0;
    const start = performance.now();
    const step = (now: number) => {
      // The first frame time can come slightly before the click.
      video.volume = Math.min(0.85, Math.max(0, (now - start) / 1600) * 0.85);
      if (video.volume < 0.85 && !video.paused) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  button.addEventListener('click', () => {
    video.controls = true;
    video.muted = false;
    button.hidden = true;
    fadeIn();
    void video.play();
  });
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && !video.paused) video.pause();
  }, { threshold: 0.25 }).observe(video);
}

const video = document.getElementById('demo-video');
const play = document.getElementById('demo-play');
if (video instanceof HTMLVideoElement && play instanceof HTMLButtonElement) setupVideo(video, play);
