/**
 * Everything that touches the DOM: screens, track rendering, car animation,
 * sounds, read-aloud and the answer timer. All rule maths lives in game.js.
 */
import { CONFIG } from './config.js';
import {
  answer,
  answerTimeout,
  createRace,
  createRng,
  currentDriver,
  endRound,
  formatMiles,
  getWinner,
  isRoundComplete,
  pickQuestion,
  ranking,
  shuffleOptions,
  subjectForRound,
} from './game.js';

/* ------------------------------------------------------------- elements */

const $ = (id) => document.getElementById(id);

const el = {
  screens: {
    setup: $('screen-setup'),
    race: $('screen-race'),
    results: $('screen-results'),
  },
  driverCount: $('driver-count'),
  driverList: $('driver-list'),
  subjectToggles: $('subject-toggles'),
  timerToggle: $('timer-toggle'),
  timerState: $('timer-state'),
  startRace: $('start-race'),
  setupError: $('setup-error'),
  roundBadge: $('round-badge'),
  turnBadge: $('turn-badge'),
  progressBadge: $('progress-badge'),
  pauseBtn: $('pause-btn'),
  track: $('track'),
  questionCard: $('question-card'),
  subjectBadge: $('subject-badge'),
  countdown: $('countdown'),
  questionText: $('question-text'),
  options: $('options'),
  feedback: $('feedback'),
  readAloud: $('read-aloud'),
  winnerName: $('winner-name'),
  winnerSub: $('winner-sub'),
  rankingBody: $('ranking-body'),
  playAgain: $('play-again'),
  newPlayers: $('new-players'),
  overlayPause: $('overlay-pause'),
  resumeBtn: $('resume-btn'),
  quitBtn: $('quit-btn'),
  overlayLights: $('overlay-lights'),
  lights: $('start-lights'),
  lightsCaption: $('lights-caption'),
  confetti: $('confetti'),
};

/* ----------------------------------------------------------------- state */

const setup = {
  count: 2,
  drivers: CONFIG.carColors.slice(0, CONFIG.maxDrivers).map((color) => ({
    name: '',
    color: color.id,
  })),
  subjects: new Set(CONFIG.subjectOrder),
  timerEnabled: CONFIG.timerEnabledByDefault,
};

let bank = [];
let bankError = '';
let race = null;
let rng = createRng();
let question = null; // the shuffled, display-ready question
let phase = 'setup'; // setup | question | feedback | moving | paused | results
let phaseBeforePause = null;
let laneEls = [];
let timerId = null;
let remaining = 0;
let pendingTimeout = null;
let lastPlaces = []; // place per driver index after the previous round

/* ----------------------------------------------------------- small utils */

function colorHex(id) {
  return CONFIG.carColors.find((color) => color.id === id)?.hex ?? '#888888';
}

function colorLabel(id) {
  return CONFIG.carColors.find((color) => color.id === id)?.label ?? id;
}

function showScreen(name) {
  for (const [key, node] of Object.entries(el.screens)) {
    node.hidden = key !== name;
  }
}

function clearPending() {
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
}

function later(ms, fn) {
  clearPending();
  pendingTimeout = setTimeout(() => {
    pendingTimeout = null;
    fn();
  }, ms);
}

/* ------------------------------------------------------------ setup screen */

function renderDriverCount() {
  for (const button of el.driverCount.querySelectorAll('.btn-count')) {
    const active = Number(button.dataset.count) === setup.count;
    button.setAttribute('aria-pressed', String(active));
  }
}

function renderDriverList() {
  el.driverList.innerHTML = '';

  for (let i = 0; i < setup.count; i++) {
    const driver = setup.drivers[i];
    const card = document.createElement('div');
    card.className = 'driver-card';
    card.style.borderLeftColor = colorHex(driver.color);

    const heading = document.createElement('h3');
    heading.textContent = `Driver ${i + 1}`;
    card.append(heading);

    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('label');
    label.setAttribute('for', `name-${i}`);
    label.textContent = `Name (max ${CONFIG.maxNameLength} characters)`;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `name-${i}`;
    input.maxLength = CONFIG.maxNameLength;
    input.placeholder = `Driver ${i + 1}`;
    input.value = driver.name;
    input.addEventListener('input', () => {
      driver.name = input.value;
    });

    field.append(label, input);
    card.append(field);

    const swatchLabel = document.createElement('p');
    swatchLabel.className = 'rules-note';
    swatchLabel.style.margin = '12px 0 0';
    swatchLabel.textContent = `Car colour: ${colorLabel(driver.color)}`;
    card.append(swatchLabel);

    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', `Car colour for driver ${i + 1}`);

    for (const color of CONFIG.carColors) {
      const takenBy = setup.drivers
        .slice(0, setup.count)
        .findIndex((other, j) => j !== i && other.color === color.id);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.style.background = color.hex;
      button.setAttribute('aria-pressed', String(driver.color === color.id));
      button.disabled = takenBy !== -1;
      button.title = takenBy === -1 ? color.label : `${color.label} (taken by driver ${takenBy + 1})`;
      button.setAttribute(
        'aria-label',
        takenBy === -1 ? color.label : `${color.label}, already taken`
      );
      button.addEventListener('click', () => {
        driver.color = color.id;
        renderDriverList();
      });
      swatches.append(button);
    }

    card.append(swatches);
    el.driverList.append(card);
  }
}

function renderSubjectToggles() {
  el.subjectToggles.innerHTML = '';

  for (const subject of CONFIG.subjectOrder) {
    const on = setup.subjects.has(subject);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle';
    button.setAttribute('aria-pressed', String(on));
    button.innerHTML = `
      <span aria-hidden="true">${on ? '&#9745;' : '&#9744;'}</span>
      <span>${CONFIG.subjectLabels[subject]}</span>
      <span class="toggle-state">${on ? 'on' : 'off'}</span>`;
    button.addEventListener('click', () => {
      if (setup.subjects.has(subject)) {
        setup.subjects.delete(subject);
      } else {
        setup.subjects.add(subject);
      }
      renderSubjectToggles();
    });
    el.subjectToggles.append(button);
  }
}

function renderTimerToggle() {
  el.timerToggle.setAttribute('aria-pressed', String(setup.timerEnabled));
  el.timerState.textContent = setup.timerEnabled ? 'on' : 'off';
}

function renderSetup() {
  renderDriverCount();
  renderDriverList();
  renderSubjectToggles();
  renderTimerToggle();
  el.setupError.textContent = bankError;
}

/* ------------------------------------------------------------ track render */

/**
 * Top-down Formula 1 car, nose pointing right (towards the finish line).
 * Body and wings take the driver's colour; the number sits on the engine cover.
 */
function carSvg(hex, number) {
  return `
    <svg class="f1" viewBox="0 0 80 32" width="80" height="32" aria-hidden="true" focusable="false">
      <!-- rear wing -->
      <rect x="1" y="4" width="6" height="24" rx="1.5" fill="#111" />
      <rect x="1" y="4" width="6" height="3" fill="${hex}" />
      <rect x="1" y="25" width="6" height="3" fill="${hex}" />
      <!-- rear tyres -->
      <rect x="8" y="0.5" width="13" height="7.5" rx="2.5" fill="#15121c" stroke="#d9d4e4" stroke-width="1.2" />
      <rect x="8" y="24" width="13" height="7.5" rx="2.5" fill="#15121c" stroke="#d9d4e4" stroke-width="1.2" />
      <!-- front tyres -->
      <rect x="53" y="1.5" width="11" height="6.5" rx="2.2" fill="#15121c" stroke="#d9d4e4" stroke-width="1.2" />
      <rect x="53" y="24" width="11" height="6.5" rx="2.2" fill="#15121c" stroke="#d9d4e4" stroke-width="1.2" />
      <!-- suspension arms -->
      <path d="M15 8l5 4M15 24l5-4M58 8l-4 5.5M58 24l-4-5.5" stroke="#333" stroke-width="1.4" />
      <!-- body, sidepods and nose -->
      <path d="M7 13.5L13 11 22 8.5h13l11 3 8 2.6 18 0.9v2l-18 0.9-8 2.6-11 3H22L13 21 7 18.5z"
            fill="${hex}" stroke="rgba(0,0,0,0.55)" stroke-width="1" stroke-linejoin="round" />
      <!-- front wing -->
      <rect x="70" y="2.5" width="7" height="27" rx="1.5" fill="${hex}" stroke="rgba(0,0,0,0.55)" stroke-width="1" />
      <rect x="74.5" y="2.5" width="2.5" height="27" rx="1" fill="#111" />
      <!-- cockpit, helmet and halo -->
      <ellipse cx="40" cy="16" rx="6.5" ry="3.6" fill="#0c0a12" />
      <circle cx="39" cy="16" r="2.6" fill="#f5f0ff" stroke="#111" stroke-width="0.8" />
      <path d="M33 13.2q9 -2.4 12.5 2.8q-3.5 5.2 -12.5 2.8" fill="none" stroke="#2a2a2a" stroke-width="1.5" />
      <!-- engine cover number -->
      <text x="25.5" y="18.6" font-size="8" font-weight="800" text-anchor="middle"
            fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="0.5"
            font-family="Segoe UI, Verdana, sans-serif">${number}</text>
    </svg>`;
}

function buildTrack() {
  el.track.innerHTML = '';
  laneEls = [];
  lastPlaces = race.drivers.map(() => 1);

  race.drivers.forEach((driver, i) => {
    const lane = document.createElement('div');
    lane.className = 'lane';

    const pos = document.createElement('div');
    pos.className = 'lane-pos';

    const info = document.createElement('div');
    info.className = 'lane-info';

    const name = document.createElement('div');
    name.className = 'lane-name';
    const dot = document.createElement('span');
    dot.className = 'lane-dot';
    dot.style.background = colorHex(driver.color);
    const nameText = document.createElement('span');
    nameText.textContent = driver.name;
    name.append(dot, nameText);

    const stats = document.createElement('div');
    stats.className = 'lane-stats';

    const turn = document.createElement('div');
    turn.className = 'lane-turn';
    turn.textContent = '';

    info.append(name, stats, turn);

    const road = document.createElement('div');
    road.className = 'lane-road';

    const car = document.createElement('div');
    car.className = 'car no-anim';
    car.innerHTML = `<span class="trail" aria-hidden="true"></span>${carSvg(colorHex(driver.color), i + 1)}`;
    road.append(car);

    lane.append(pos, info, road);
    el.track.append(lane);

    laneEls.push({ lane, pos, stats, turn, car });
  });

  const markers = document.createElement('div');
  markers.className = 'mile-markers';
  for (const mile of [0, 25, 50, 75, 100]) {
    const span = document.createElement('span');
    span.textContent = mile === 100 ? '100 mi' : String(mile);
    markers.append(span);
  }
  el.track.append(markers);

  // First paint: put the cars on the grid without sliding.
  updateTrack();
  requestAnimationFrame(() => {
    for (const lane of laneEls) {
      lane.car.classList.remove('no-anim');
    }
  });
}

/**
 * @param {boolean} [showMoves] true right after a round, to flash
 *   gained / lost places next to the position number.
 */
function updateTrack(showMoves = false) {
  const showTurn = phase === 'question' || phase === 'feedback' || phase === 'paused';
  const places = [];
  for (const entry of ranking(race)) {
    places[entry.index] = entry.place;
  }
  const topSpeed = Math.max(1, ...race.drivers.map((driver) => driver.speed));

  race.drivers.forEach((driver, i) => {
    const lane = laneEls[i];
    if (!lane) {
      return;
    }
    const pct = Math.min((driver.distance / CONFIG.trackLength) * 100, 100);
    lane.car.style.setProperty('--pct', pct.toFixed(2));
    lane.car.style.setProperty('--trail', (driver.speed / topSpeed).toFixed(2));
    lane.stats.textContent = `${driver.speed} MPH · ${formatMiles(driver.distance)} / ${CONFIG.trackLength} miles`;

    const place = places[i] ?? i + 1;
    const delta = showMoves ? lastPlaces[i] - place : 0;
    lane.pos.innerHTML = '';
    const posText = document.createElement('span');
    posText.textContent = `P${place}`;
    lane.pos.append(posText);
    if (delta !== 0) {
      const move = document.createElement('span');
      move.className = delta > 0 ? 'pos-move is-up' : 'pos-move is-down';
      move.textContent = delta > 0 ? `▲${delta}` : `▼${-delta}`;
      move.title = delta > 0 ? `Gained ${delta}` : `Lost ${-delta}`;
      lane.pos.append(move);
    }
    lane.pos.classList.toggle('is-leader', place === 1 && driver.distance > 0);

    const isCurrent = showTurn && i === race.turnIndex && !race.finished;
    lane.lane.classList.toggle('is-current', isCurrent);
    lane.turn.textContent = isCurrent ? '▶ Your turn' : '';
  });

  if (showMoves) {
    lastPlaces = places;
  }
}

function renderBadges() {
  el.roundBadge.textContent = `Round ${race.round}`;
  const driver = currentDriver(race);
  el.turnBadge.textContent =
    phase === 'moving' || !driver ? 'Cars moving…' : `Turn: ${driver.name}`;

  const leader = [...race.drivers].sort((a, b) => b.distance - a.distance)[0];
  el.progressBadge.textContent = `Leader: ${formatMiles(leader.distance)} / ${CONFIG.trackLength} mi`;
}

/* ------------------------------------------------------------------ sound */

let audioCtx = null;

function ensureAudio() {
  // Sound is a nice-to-have: never let a blocked audio context stop the race.
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        return null;
      }
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Short engine "vroom" for a correct answer. */
function playVroom() {
  const ctx = ensureAudio();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(70, now);
  osc.frequency.exponentialRampToValueAtTime(240, now + 0.3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(700, now);
  filter.frequency.linearRampToValueAtTime(1800, now + 0.3);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.46);
}

/** Soft two-note "not quite" sound - deliberately not a buzzer. */
function playSoftWrong() {
  const ctx = ensureAudio();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;

  [
    [392, 0],
    [294, 0.16],
  ].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + offset);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.linearRampToValueAtTime(0.14, now + offset + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.3);
  });
}

/** Start-light beep: short and low for each red light, high for "lights out". */
function playBeep(high = false) {
  const ctx = ensureAudio();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(high ? 880 : 440, now);
  const gain = ctx.createGain();
  const length = high ? 0.5 : 0.18;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + length + 0.02);
}

/** Engine sweep while the cars move; pitch and loudness follow the top speed. */
function playRaceSweep(topSpeed) {
  const ctx = ensureAudio();
  if (!ctx || topSpeed <= 0) {
    return;
  }
  const now = ctx.currentTime;
  const seconds = CONFIG.carAnimationMs / 1000;
  const peak = Math.min(120 + topSpeed * 3, 520);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(peak * 0.55, now);
  osc.frequency.exponentialRampToValueAtTime(peak, now + seconds * 0.6);
  osc.frequency.exponentialRampToValueAtTime(peak * 0.7, now + seconds);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.min(0.06 + topSpeed / 1000, 0.18), now + seconds * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + seconds + 0.05);
}

/* ------------------------------------------------------------- read aloud */

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function readAloud() {
  if (!question) {
    return;
  }
  if (!('speechSynthesis' in window)) {
    el.feedback.className = 'feedback';
    el.feedback.textContent = 'Read aloud is not available in this browser.';
    return;
  }
  stopSpeech();
  const spoken = [question.text, ...question.options.map((option, i) => `Option ${i + 1}. ${option}`)];
  const utterance = new SpeechSynthesisUtterance(spoken.join('. '));
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

/* ------------------------------------------------------------------ timer */

function clearTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function renderCountdown() {
  if (!race.timerEnabled) {
    el.countdown.textContent = 'No timer';
    el.countdown.classList.remove('is-low');
    return;
  }
  el.countdown.textContent = `⏱ ${remaining}s`;
  el.countdown.classList.toggle('is-low', remaining <= 5);
}

function runTimer() {
  clearTimer();
  if (!race.timerEnabled) {
    renderCountdown();
    return;
  }
  renderCountdown();
  timerId = setInterval(() => {
    remaining -= 1;
    renderCountdown();
    if (remaining <= 0) {
      clearTimer();
      handleTimeout();
    }
  }, 1000);
}

function startTimer() {
  remaining = CONFIG.answerTimerSeconds;
  runTimer();
}

/* ------------------------------------------------------------- race flow */

function startRace() {
  const names = setup.drivers.slice(0, setup.count);

  for (let i = 0; i < names.length; i++) {
    if (!names[i].name.trim()) {
      el.setupError.textContent = `Driver ${i + 1} needs a name.`;
      return;
    }
  }
  if (!setup.subjects.size) {
    el.setupError.textContent = 'Switch on at least one subject.';
    return;
  }
  if (!bank.length) {
    el.setupError.textContent = bankError || 'Questions have not loaded yet.';
    return;
  }

  try {
    race = createRace({
      drivers: names.map((driver) => ({ name: driver.name.trim(), color: driver.color })),
      subjects: [...setup.subjects],
      timerEnabled: setup.timerEnabled,
    });
  } catch (error) {
    el.setupError.textContent = error.message;
    return;
  }

  el.setupError.textContent = '';
  rng = createRng();
  question = null;
  ensureAudio(); // the click that started the race also unlocks audio
  showScreen('race');
  buildTrack();
  renderBadges();
  startLights();
}

/**
 * F1-style start: five red lights come on one by one, then go out together.
 * Purely for show - no question is on screen and the timer is not running.
 */
function startLights() {
  phase = 'lights';
  el.pauseBtn.disabled = true;
  el.readAloud.disabled = true;
  el.options.innerHTML = '';
  el.questionCard.className = 'question-card';
  el.countdown.textContent = '';
  el.subjectBadge.textContent = 'Grid';
  el.questionText.textContent = 'Drivers, get ready…';
  el.feedback.className = 'feedback';
  el.feedback.textContent = '';

  const bulbs = [...el.lights.querySelectorAll('.light-pod')];
  for (const bulb of bulbs) {
    bulb.classList.remove('is-on');
  }
  el.lights.classList.remove('is-out');
  el.lightsCaption.textContent = 'Get ready…';
  el.overlayLights.hidden = false;

  const step = (n) => {
    if (n < bulbs.length) {
      bulbs[n].classList.add('is-on');
      el.lightsCaption.textContent = String(n + 1);
      playBeep(false);
      later(CONFIG.startLightMs, () => step(n + 1));
      return;
    }
    // all five lit: short hold, then lights out
    later(CONFIG.startLightMs, () => {
      for (const bulb of bulbs) {
        bulb.classList.remove('is-on');
      }
      el.lights.classList.add('is-out');
      el.lightsCaption.textContent = 'Lights out - GO!';
      playBeep(true);
      later(CONFIG.startLightMs, () => {
        el.overlayLights.hidden = true;
        nextTurn();
      });
    });
  };
  later(CONFIG.startLightMs, () => step(0));
}

function nextTurn() {
  if (race.finished) {
    showResults();
    return;
  }
  if (isRoundComplete(race)) {
    moveCars();
    return;
  }
  presentQuestion();
}

function presentQuestion() {
  const picked = pickQuestion(race, bank, rng);
  race = picked.state;
  question = shuffleOptions(picked.question, rng);

  phase = 'question';
  el.questionCard.className = 'question-card';
  el.feedback.className = 'feedback';
  el.feedback.textContent = '';
  el.subjectBadge.textContent = CONFIG.subjectLabels[subjectForRound(race)];
  el.questionText.textContent = question.text;
  el.readAloud.disabled = false;
  el.pauseBtn.disabled = false;

  el.options.innerHTML = '';
  question.options.forEach((option, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer-btn';
    button.dataset.index = String(i);

    const key = document.createElement('span');
    key.className = 'answer-key';
    key.setAttribute('aria-hidden', 'true');
    key.textContent = String(i + 1);

    const text = document.createElement('span');
    text.textContent = option;

    button.append(key, text);
    button.addEventListener('click', () => handleAnswer(i));
    el.options.append(button);
  });

  renderBadges();
  updateTrack();
  startTimer();
}

function lockOptions() {
  for (const button of el.options.querySelectorAll('.answer-btn')) {
    button.disabled = true;
  }
}

function markOptions(chosenIndex) {
  for (const button of el.options.querySelectorAll('.answer-btn')) {
    const index = Number(button.dataset.index);
    if (index === question.answerIndex) {
      button.classList.add('is-right');
    } else if (index === chosenIndex) {
      button.classList.add('is-wrong');
    }
  }
}

function handleAnswer(index) {
  if (phase !== 'question') {
    return;
  }
  resolveTurn(index === question.answerIndex, index, false);
}

function handleTimeout() {
  if (phase !== 'question') {
    return;
  }
  resolveTurn(false, -1, true);
}

/**
 * Show 2 seconds of feedback (Q6, N5: icon + words, not colour alone), then
 * hand the turn on.
 */
function resolveTurn(isCorrect, chosenIndex, timedOut) {
  clearTimer();
  stopSpeech();
  phase = 'feedback';
  el.pauseBtn.disabled = true;
  el.readAloud.disabled = true;
  lockOptions();
  markOptions(chosenIndex);

  const driver = currentDriver(race);
  const correctText = question.options[question.answerIndex];

  if (isCorrect) {
    el.questionCard.classList.add('flash-right');
    el.feedback.className = 'feedback is-right';
    el.feedback.innerHTML =
      `<span class="feedback-icon" aria-hidden="true">&#10004;</span>` +
      `<span>Correct! ${driver.name} speeds up by ${CONFIG.correctSpeedChange} MPH.</span>`;
    playVroom();
  } else {
    const lost = Math.min(Math.abs(CONFIG.wrongSpeedChange), driver.speed);
    const change =
      lost === 0
        ? 'Speed stays at 0 MPH.'
        : `Speed drops by ${Math.abs(CONFIG.wrongSpeedChange)} MPH.`;
    el.questionCard.classList.add('flash-wrong');
    el.feedback.className = 'feedback is-wrong';
    el.feedback.innerHTML =
      `<span class="feedback-icon" aria-hidden="true">&#10006;</span>` +
      `<span>${timedOut ? 'Out of time!' : 'Not quite.'} The answer was "${correctText}". ${change}</span>`;
    playSoftWrong();
  }

  race = timedOut ? answerTimeout(race) : answer(race, isCorrect);

  later(CONFIG.feedbackMs, () => {
    nextTurn();
  });
}

/** End of round: every car moves speed x 0.1 miles, with a 1 second slide. */
function moveCars() {
  phase = 'moving';
  clearTimer();
  stopSpeech();
  el.pauseBtn.disabled = true;
  el.readAloud.disabled = true;
  el.options.innerHTML = '';
  el.questionCard.className = 'question-card';
  el.countdown.textContent = '';
  el.subjectBadge.textContent = 'Round over';
  el.questionText.textContent = 'All cars move forward…';
  el.feedback.className = 'feedback';
  el.feedback.textContent = 'Each car travels its speed × 0.1 miles.';

  race = endRound(race);
  renderBadges();
  el.track.classList.add('is-moving');
  updateTrack(true);
  playRaceSweep(Math.max(...race.drivers.map((driver) => driver.speed)));

  later(CONFIG.carAnimationMs, () => {
    el.track.classList.remove('is-moving');
    nextTurn();
  });
}

/* --------------------------------------------------------------- results */

function showResults() {
  phase = 'results';
  clearTimer();
  clearPending();
  stopSpeech();

  const winners = getWinner(race);
  const standings = ranking(race);

  if (winners.length === 1) {
    el.winnerName.textContent = `${winners[0].name} wins!`;
    el.winnerSub.textContent =
      `Crossed the ${CONFIG.trackLength} mile line in round ${race.round} ` +
      `with ${formatMiles(winners[0].distance)} miles at ${winners[0].speed} MPH.`;
  } else if (winners.length > 1) {
    el.winnerName.textContent = `${winners.map((w) => w.name).join(' & ')} share first place!`;
    el.winnerSub.textContent =
      `All level on ${formatMiles(winners[0].distance)} miles at ${winners[0].speed} MPH ` +
      `in round ${race.round}.`;
  } else {
    el.winnerName.textContent = 'Race stopped';
    el.winnerSub.textContent = 'Nobody reached the finish line.';
  }

  el.rankingBody.innerHTML = '';
  for (const driver of standings) {
    const row = document.createElement('tr');
    if (driver.place === 1 && driver.crossedLine) {
      row.className = 'is-winner';
    }

    const place = document.createElement('td');
    place.textContent = driver.place === 1 && driver.crossedLine ? `1 \u{1F3C6}` : String(driver.place);

    const name = document.createElement('td');
    const dot = document.createElement('span');
    dot.className = 'lane-dot';
    dot.style.background = colorHex(driver.color);
    dot.style.display = 'inline-block';
    dot.style.marginRight = '8px';
    name.append(dot, document.createTextNode(driver.name));

    const distance = document.createElement('td');
    distance.className = 'num';
    distance.textContent = `${formatMiles(driver.distance)} mi`;

    const speed = document.createElement('td');
    speed.className = 'num';
    speed.textContent = `${driver.speed} MPH`;

    const correct = document.createElement('td');
    correct.className = 'num';
    correct.textContent = `${driver.correct} / ${driver.answered}`;

    row.append(place, name, distance, speed, correct);
    el.rankingBody.append(row);
  }

  showScreen('results');
  launchConfetti(winners.map((winner) => colorHex(winner.color)));
  el.playAgain.focus();
}

/** Purple, white, gold and the winner's own colour fall over the banner. */
function launchConfetti(extraColors) {
  el.confetti.innerHTML = '';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const colors = ['#a855f7', '#c4b5fd', '#ffffff', '#f5c542', ...extraColors];
  for (let i = 0; i < 60; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti-bit';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.8}s`;
    bit.style.animationDuration = `${2 + Math.random() * 1.6}s`;
    bit.style.setProperty('--spin', `${Math.random() > 0.5 ? '' : '-'}${360 + Math.random() * 360}deg`);
    el.confetti.append(bit);
  }
}

/* ----------------------------------------------------------------- pause */

function pauseRace() {
  if (phase !== 'question') {
    return;
  }
  phaseBeforePause = phase;
  phase = 'paused';
  clearTimer();
  stopSpeech();
  el.overlayPause.hidden = false;
  el.resumeBtn.focus();
}

function resumeRace() {
  if (phase !== 'paused') {
    return;
  }
  el.overlayPause.hidden = true;
  phase = phaseBeforePause ?? 'question';
  phaseBeforePause = null;
  runTimer(); // picks up from the seconds that were left
  el.options.querySelector('.answer-btn')?.focus();
}

function quitToSetup() {
  el.overlayPause.hidden = true;
  el.overlayLights.hidden = true;
  el.track.classList.remove('is-moving');
  clearTimer();
  clearPending();
  stopSpeech();
  race = null;
  question = null;
  phase = 'setup';
  showScreen('setup');
  renderSetup();
}

/* ------------------------------------------------------------------ wiring */

el.driverCount.addEventListener('click', (event) => {
  const button = event.target.closest('.btn-count');
  if (!button) {
    return;
  }
  setup.count = Number(button.dataset.count);
  el.setupError.textContent = '';
  renderDriverCount();
  renderDriverList();
});

el.timerToggle.addEventListener('click', () => {
  setup.timerEnabled = !setup.timerEnabled;
  renderTimerToggle();
});

el.startRace.addEventListener('click', startRace);
el.readAloud.addEventListener('click', readAloud);
el.pauseBtn.addEventListener('click', pauseRace);
el.resumeBtn.addEventListener('click', resumeRace);
el.quitBtn.addEventListener('click', quitToSetup);

el.playAgain.addEventListener('click', () => {
  startRace();
});

el.newPlayers.addEventListener('click', () => {
  quitToSetup();
});

// 1 / 2 / 3 answer the question; Escape pauses.
document.addEventListener('keydown', (event) => {
  if (phase === 'question' && ['1', '2', '3'].includes(event.key)) {
    const index = Number(event.key) - 1;
    if (index < question.options.length) {
      handleAnswer(index);
    }
    return;
  }
  if (event.key === 'Escape') {
    if (phase === 'question') {
      pauseRace();
    } else if (phase === 'paused') {
      resumeRace();
    }
  }
});

/* -------------------------------------------------------------- bootstrap */

async function loadQuestions() {
  try {
    const response = await fetch('questions.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    bank = await response.json();
    bankError = '';
  } catch (error) {
    bank = [];
    bankError =
      'Could not load questions.json. Serve this folder over http (see README) rather than opening the file directly.';
  }
  renderSetup();
}

showScreen('setup');
renderSetup();
loadQuestions();
