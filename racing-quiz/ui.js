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

function carSvg(hex) {
  return `
    <svg class="car no-anim" viewBox="0 0 68 34" width="68" height="34" aria-hidden="true" focusable="false">
      <path d="M2 25h64v-6c0-2.2-1.6-3.6-3.8-3.6h-5.4l-6.3-7.6C49.3 6.6 47.9 6 46.4 6H24.6c-1.6 0-3 .7-4 1.9l-5.4 7.5H5.8C3.6 15.4 2 16.8 2 19z"
            fill="${hex}" stroke="rgba(0,0,0,0.4)" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M25 9.5h10.5v5.9H20.4z" fill="#d6e9ff" opacity="0.95" />
      <path d="M38 9.5h7.4l5 5.9H38z" fill="#d6e9ff" opacity="0.95" />
      <circle cx="18" cy="26" r="6.4" fill="#1d2329" />
      <circle cx="18" cy="26" r="2.5" fill="#c6d1da" />
      <circle cx="50" cy="26" r="6.4" fill="#1d2329" />
      <circle cx="50" cy="26" r="2.5" fill="#c6d1da" />
    </svg>`;
}

function buildTrack() {
  el.track.innerHTML = '';
  laneEls = [];

  race.drivers.forEach((driver, i) => {
    const lane = document.createElement('div');
    lane.className = 'lane';

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
    road.innerHTML = carSvg(colorHex(driver.color));

    lane.append(info, road);
    el.track.append(lane);

    laneEls.push({ lane, stats, turn, car: road.querySelector('.car') });
  });

  const markers = document.createElement('div');
  markers.className = 'mile-markers';
  for (const mile of [0, 25, 50, 75, 100]) {
    const span = document.createElement('span');
    span.textContent = mile === 100 ? '100 mi' : String(mile);
    markers.append(span);
  }
  el.track.append(markers);

  // First paint: put the cars at the start line without sliding.
  updateTrack();
  requestAnimationFrame(() => {
    for (const lane of laneEls) {
      lane.car.classList.remove('no-anim');
    }
  });
}

function updateTrack() {
  const showTurn = phase === 'question' || phase === 'feedback' || phase === 'paused';

  race.drivers.forEach((driver, i) => {
    const lane = laneEls[i];
    if (!lane) {
      return;
    }
    const pct = Math.min((driver.distance / CONFIG.trackLength) * 100, 100);
    lane.car.style.setProperty('--pct', pct.toFixed(2));
    lane.stats.textContent = `${driver.speed} MPH · ${formatMiles(driver.distance)} / ${CONFIG.trackLength} miles`;

    const isCurrent = showTurn && i === race.turnIndex && !race.finished;
    lane.lane.classList.toggle('is-current', isCurrent);
    lane.turn.textContent = isCurrent ? '▶ Your turn' : '';
  });
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
  nextTurn();
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
  updateTrack();

  later(CONFIG.carAnimationMs, () => {
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
  el.playAgain.focus();
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
