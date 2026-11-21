/**
 * Race logic: speed, distance, winner, question picking.
 *
 * No DOM and no I/O in here (requirement N7). Every function takes a plain
 * state object and returns a new one, so the UI can never corrupt the rules.
 *
 * State shape:
 * {
 *   round: 1,
 *   turnIndex: 0,
 *   drivers: [{ name, color, speed, distance, correct, wrong, timeouts, answered }],
 *   subjects: ['maths', 'science', 'gk'],
 *   timerEnabled: true,
 *   usedQuestionIds: [],
 *   finished: false,
 *   recycledQuestions: false
 * }
 */
import { CONFIG } from './config.js';

const PRECISION = 6;

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Miles as shown on screen: 1 decimal place. State keeps full precision. */
export function formatMiles(miles) {
  return roundTo(miles, 1).toFixed(1);
}

/**
 * Small deterministic RNG (mulberry32) so tests can reproduce a shuffle.
 * Pass no seed in the browser and it still behaves randomly enough.
 */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ setup */

/**
 * Build a fresh race state.
 * Throws a message fit to show the host if the setup breaks P1 or P2.
 */
export function createRace({
  drivers = [],
  subjects = [...CONFIG.subjectOrder],
  timerEnabled = CONFIG.timerEnabledByDefault,
} = {}) {
  if (!Array.isArray(drivers)) {
    throw new Error('drivers must be an array.');
  }
  if (drivers.length < CONFIG.minDrivers) {
    throw new Error(`A race needs at least ${CONFIG.minDrivers} driver.`);
  }
  if (drivers.length > CONFIG.maxDrivers) {
    throw new Error(`A race can have at most ${CONFIG.maxDrivers} drivers.`);
  }

  const takenColors = new Set();
  const racers = drivers.map((driver, i) => {
    const name = String(driver?.name ?? '').trim();
    if (!name) {
      throw new Error(`Driver ${i + 1} needs a name.`);
    }
    if (name.length > CONFIG.maxNameLength) {
      throw new Error(`Names can be at most ${CONFIG.maxNameLength} characters.`);
    }
    const color = String(driver?.color ?? '').trim();
    if (!color) {
      throw new Error(`Driver ${i + 1} needs a car colour.`);
    }
    if (takenColors.has(color)) {
      throw new Error('Two drivers cannot pick the same colour.');
    }
    takenColors.add(color);

    return {
      name,
      color,
      speed: CONFIG.startSpeed,
      distance: CONFIG.startDistance,
      correct: 0,
      wrong: 0,
      timeouts: 0,
      answered: 0,
    };
  });

  // Keep the host's subjects in the canonical maths -> science -> gk order (P4).
  const enabled = CONFIG.subjectOrder.filter((subject) => subjects.includes(subject));
  if (!enabled.length) {
    throw new Error('At least one subject must be switched on.');
  }

  return {
    round: 1,
    turnIndex: 0,
    drivers: racers,
    subjects: enabled,
    timerEnabled: Boolean(timerEnabled),
    usedQuestionIds: [],
    finished: false,
    recycledQuestions: false,
  };
}

/* ------------------------------------------------------------- turn helpers */

export function currentDriver(state) {
  return state.drivers[state.turnIndex] ?? null;
}

/** True once every driver in the round has answered (R4). */
export function isRoundComplete(state) {
  return state.turnIndex >= state.drivers.length;
}

/** All drivers get the same subject in a round; it rotates maths -> science -> gk. */
export function subjectForRound(state) {
  return state.subjects[(state.round - 1) % state.subjects.length];
}

/* ------------------------------------------------------------ answering */

/**
 * Apply one answer for the driver whose turn it is (R1, R2, R3) and move the
 * turn on. Cars do not move here - that happens in endRound.
 */
export function answer(state, isCorrect, { timedOut = false } = {}) {
  if (state.finished) {
    throw new Error('The race is already over.');
  }
  if (isRoundComplete(state)) {
    throw new Error('Every driver has answered. End the round first.');
  }

  const drivers = state.drivers.map((driver) => ({ ...driver }));
  const driver = drivers[state.turnIndex];

  const change = isCorrect ? CONFIG.correctSpeedChange : CONFIG.wrongSpeedChange;
  let speed = driver.speed + change;
  if (speed < CONFIG.minSpeed) {
    speed = CONFIG.minSpeed; // R3: never below 0 MPH
  }
  if (CONFIG.maxSpeed !== null && speed > CONFIG.maxSpeed) {
    speed = CONFIG.maxSpeed;
  }

  driver.speed = speed;
  driver.answered += 1;
  if (isCorrect) {
    driver.correct += 1;
  } else {
    driver.wrong += 1;
    if (timedOut) {
      driver.timeouts += 1;
    }
  }

  return { ...state, drivers, turnIndex: state.turnIndex + 1 };
}

/** Running out of time counts as a wrong answer (R2). */
export function answerTimeout(state) {
  return answer(state, false, { timedOut: true });
}

/* --------------------------------------------------------------- round end */

/**
 * Move every car forward by speed x 0.1 miles, then either finish the race
 * (R6) or start the next round. `round` stays on the finishing round so the
 * results screen can report "finished in round 14".
 */
export function endRound(state) {
  if (state.finished) {
    throw new Error('The race is already over.');
  }
  if (!isRoundComplete(state)) {
    throw new Error('Every driver must answer before the round ends.');
  }

  const drivers = state.drivers.map((driver) => ({
    ...driver,
    distance: roundTo(driver.distance + driver.speed * CONFIG.milesPerMphPerRound, PRECISION),
  }));

  const finished = drivers.some((driver) => driver.distance >= CONFIG.trackLength);

  return {
    ...state,
    drivers,
    finished,
    round: finished ? state.round : state.round + 1,
    turnIndex: 0,
  };
}

/* ------------------------------------------------------- winner and ranking */

/**
 * Final standings, best first: furthest distance, then higher speed (R7, R8,
 * R9). Drivers level on both share a place, and the next place is skipped.
 */
export function ranking(state) {
  const sorted = state.drivers
    .map((driver, index) => ({ ...driver, index }))
    .sort((a, b) => b.distance - a.distance || b.speed - a.speed || a.index - b.index);

  let place = 1;
  let previous = null;

  return sorted.map((driver, i) => {
    if (previous && (previous.distance !== driver.distance || previous.speed !== driver.speed)) {
      place = i + 1;
    }
    previous = driver;
    return {
      ...driver,
      place,
      crossedLine: driver.distance >= CONFIG.trackLength,
    };
  });
}

/**
 * Winners of a finished race. Normally one driver; more than one only when
 * they are level on distance and speed, and then they share first place (R8).
 * Returns [] while the race is still running.
 */
export function getWinner(state) {
  if (!state.finished) {
    return [];
  }
  return ranking(state).filter((driver) => driver.place === 1 && driver.crossedLine);
}

/* -------------------------------------------------------------- questions */

/**
 * Pick an unused question for the current round's subject (Q2, Q3).
 * Returns the question plus the state that now remembers it.
 *
 * Falls back to the other enabled subjects if this subject runs dry, and only
 * starts reusing questions if the whole enabled bank is exhausted - which
 * needs more than 50 questions per subject to be drawn in one race.
 */
export function pickQuestion(state, bank, rng = Math.random) {
  if (!Array.isArray(bank) || bank.length === 0) {
    throw new Error('The question bank is empty.');
  }

  const used = new Set(state.usedQuestionIds);
  const subject = subjectForRound(state);
  const enabled = bank.filter((question) => state.subjects.includes(question.subject));
  if (!enabled.length) {
    throw new Error('No questions match the chosen subjects.');
  }

  const take = (pool) => pool[Math.floor(rng() * pool.length)];

  let pool = enabled.filter((question) => question.subject === subject && !used.has(question.id));
  if (!pool.length) {
    pool = enabled.filter((question) => !used.has(question.id));
  }
  if (!pool.length) {
    // Whole bank used up: start a fresh lap through it.
    const subjectPool = enabled.filter((question) => question.subject === subject);
    const question = take(subjectPool.length ? subjectPool : enabled);
    return {
      state: { ...state, usedQuestionIds: [question.id], recycledQuestions: true },
      question,
    };
  }

  const question = take(pool);
  return {
    state: { ...state, usedQuestionIds: [...state.usedQuestionIds, question.id] },
    question,
  };
}

/** Put the 3 options in random order for display (Q3). */
export function shuffleOptions(question, rng = Math.random) {
  const options = question.options.map((text, i) => ({ text, isCorrect: i === question.answer }));
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    id: question.id,
    subject: question.subject,
    text: question.text,
    options: options.map((option) => option.text),
    answerIndex: options.findIndex((option) => option.isCorrect),
  };
}

/** Check a question file against Q1, Q3 and Q4. Returns a list of problems. */
export function validateQuestionBank(bank) {
  const errors = [];
  if (!Array.isArray(bank)) {
    return ['The question bank must be an array.'];
  }

  const seenIds = new Set();
  const perSubject = Object.fromEntries(CONFIG.subjectOrder.map((subject) => [subject, 0]));

  for (const question of bank) {
    const id = question?.id ?? '(no id)';
    if (!question?.id) {
      errors.push('A question has no id.');
    } else if (seenIds.has(question.id)) {
      errors.push(`Duplicate id: ${question.id}`);
    } else {
      seenIds.add(question.id);
    }

    if (!CONFIG.subjectOrder.includes(question?.subject)) {
      errors.push(`${id}: unknown subject "${question?.subject}"`);
    } else {
      perSubject[question.subject] += 1;
    }

    const text = String(question?.text ?? '');
    if (!text.trim()) {
      errors.push(`${id}: empty question text`);
    }
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (words > CONFIG.maxQuestionWords) {
      errors.push(`${id}: ${words} words, limit is ${CONFIG.maxQuestionWords}`);
    }

    if (!Array.isArray(question?.options) || question.options.length !== CONFIG.optionCount) {
      errors.push(`${id}: needs exactly ${CONFIG.optionCount} options`);
    } else {
      if (question.options.some((option) => !String(option ?? '').trim())) {
        errors.push(`${id}: has an empty option`);
      }
      if (new Set(question.options).size !== question.options.length) {
        errors.push(`${id}: has repeated options`);
      }
      if (!Number.isInteger(question?.answer) || question.answer < 0 || question.answer >= question.options.length) {
        errors.push(`${id}: answer must be an option index (0-${question.options.length - 1})`);
      }
    }
  }

  for (const [subject, count] of Object.entries(perSubject)) {
    if (count < CONFIG.minQuestionsPerSubject) {
      errors.push(`${subject}: ${count} questions, at least ${CONFIG.minQuestionsPerSubject} needed`);
    }
  }

  return errors;
}
