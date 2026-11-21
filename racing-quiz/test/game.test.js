/**
 * Unit tests for the race rules (requirement N7).
 * Run with: node --test test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CONFIG } from '../config.js';
import {
  answer,
  answerTimeout,
  createRace,
  createRng,
  endRound,
  getWinner,
  isRoundComplete,
  pickQuestion,
  ranking,
  shuffleOptions,
  subjectForRound,
  validateQuestionBank,
} from '../game.js';

const here = dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(readFileSync(join(here, '..', 'questions.json'), 'utf8'));

const DRIVERS = [
  { name: 'Ada', color: 'red' },
  { name: 'Bo', color: 'blue' },
  { name: 'Cleo', color: 'green' },
  { name: 'Dev', color: 'yellow' },
  { name: 'Eli', color: 'purple' },
];

/** Answer for every driver in turn order, then move the cars. */
function playRound(state, results) {
  for (const isCorrect of results) {
    state = answer(state, isCorrect);
  }
  return endRound(state);
}

function racer(name, color, speed, distance) {
  return { name, color, speed, distance, correct: 0, wrong: 0, timeouts: 0, answered: 0 };
}

function finishedState(drivers, round = 14) {
  return {
    round,
    turnIndex: 0,
    drivers,
    subjects: ['maths'],
    timerEnabled: true,
    usedQuestionIds: [],
    finished: true,
    recycledQuestions: false,
  };
}

/* ------------------------------------------------------------------ setup */

test('P1: setup accepts 1 to 5 drivers', () => {
  for (let count = CONFIG.minDrivers; count <= CONFIG.maxDrivers; count++) {
    const state = createRace({ drivers: DRIVERS.slice(0, count) });
    assert.equal(state.drivers.length, count);
  }
});

test('P1: a 6th driver is rejected', () => {
  const six = [...DRIVERS, { name: 'Fin', color: 'orange' }];
  assert.throws(() => createRace({ drivers: six }), /at most 5 drivers/);
});

test('P1: a race with no drivers is rejected', () => {
  assert.throws(() => createRace({ drivers: [] }), /at least 1 driver/);
});

test('P2: two drivers cannot share a colour', () => {
  assert.throws(
    () => createRace({ drivers: [{ name: 'Ada', color: 'red' }, { name: 'Bo', color: 'red' }] }),
    /same colour/
  );
});

test('P2: names are required and capped at 12 characters', () => {
  assert.throws(() => createRace({ drivers: [{ name: '   ', color: 'red' }] }), /needs a name/);
  assert.throws(
    () => createRace({ drivers: [{ name: 'A'.repeat(13), color: 'red' }] }),
    /at most 12 characters/
  );
  const ok = createRace({ drivers: [{ name: 'A'.repeat(12), color: 'red' }] });
  assert.equal(ok.drivers[0].name.length, 12);
});

test('P3: every car starts at 0 MPH and 0 miles', () => {
  const state = createRace({ drivers: DRIVERS.slice(0, 3) });
  for (const driver of state.drivers) {
    assert.equal(driver.speed, 0);
    assert.equal(driver.distance, 0);
  }
  assert.equal(state.round, 1);
  assert.equal(state.turnIndex, 0);
  assert.equal(state.finished, false);
});

test('P4: at least one subject must be on, and the order is kept', () => {
  assert.throws(
    () => createRace({ drivers: DRIVERS.slice(0, 1), subjects: [] }),
    /At least one subject/
  );
  const state = createRace({ drivers: DRIVERS.slice(0, 1), subjects: ['gk', 'maths'] });
  assert.deepEqual(state.subjects, ['maths', 'gk']);
});

test('P5: turn order follows the order drivers were entered', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 3) });
  assert.deepEqual(
    state.drivers.map((driver) => driver.name),
    ['Ada', 'Bo', 'Cleo']
  );
  state = answer(state, true);
  assert.equal(state.turnIndex, 1);
  state = answer(state, true);
  assert.equal(state.turnIndex, 2);
  state = answer(state, true);
  assert.equal(isRoundComplete(state), true);
});

/* ------------------------------------------------------------ speed rules */

test('R1: a correct answer adds exactly 10 MPH', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = endRound(answer(state, true));
  assert.equal(state.drivers[0].speed, 10);
  state = endRound(answer(state, true));
  assert.equal(state.drivers[0].speed, 20);
});

test('R2: a wrong answer takes away exactly 2 MPH', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = endRound(answer(state, true)); // 10 MPH
  state = answer(state, false);
  assert.equal(state.drivers[0].speed, 8);
});

test('R2: a timeout is treated as a wrong answer', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = endRound(answer(state, true)); // 10 MPH
  state = answerTimeout(state);
  assert.equal(state.drivers[0].speed, 8);
  assert.equal(state.drivers[0].wrong, 1);
  assert.equal(state.drivers[0].timeouts, 1);
});

test('R3: speed never drops below 0 MPH', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = answer(state, false);
  assert.equal(state.drivers[0].speed, 0);

  state = endRound(state);
  state = answer(state, false);
  assert.equal(state.drivers[0].speed, 0);
  assert.equal(state.drivers[0].distance, 0);
});

test('R3: there is no top speed', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  for (let i = 0; i < 12; i++) {
    state = endRound(answer(state, true));
  }
  assert.equal(state.drivers[0].speed, 120);
});

test('answer counters track correct and wrong separately', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = endRound(answer(state, true));
  state = endRound(answer(state, false));
  assert.equal(state.drivers[0].correct, 1);
  assert.equal(state.drivers[0].wrong, 1);
  assert.equal(state.drivers[0].answered, 2);
});

/* --------------------------------------------------------------- movement */

test('R4/R5: each car moves speed x 0.1 miles per round', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 2) });
  state = playRound(state, [true, false]); // Ada 10 MPH, Bo 0 MPH
  assert.equal(state.drivers[0].distance, 1);
  assert.equal(state.drivers[1].distance, 0);

  state = playRound(state, [true, true]); // Ada 20, Bo 10
  assert.equal(state.drivers[0].distance, 3);
  assert.equal(state.drivers[1].distance, 1);

  state = playRound(state, [true, true]); // Ada 30, Bo 20
  assert.equal(state.drivers[0].distance, 6);
  assert.equal(state.drivers[1].distance, 3);
});

test('R4: a car at 30 MPH travels 3 miles in a round', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = endRound(answer(state, true));
  state = endRound(answer(state, true));
  const before = state.drivers[0].distance;
  state = endRound(answer(state, true)); // now 30 MPH
  assert.equal(state.drivers[0].speed, 30);
  assert.equal(state.drivers[0].distance - before, 3);
});

test('R4: cars only move after every driver has answered', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 2) });
  state = answer(state, true);
  assert.throws(() => endRound(state), /must answer before the round ends/);
  state = answer(state, true);
  assert.doesNotThrow(() => endRound(state));
});

test('a driver cannot answer twice in one round', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = answer(state, true);
  assert.throws(() => answer(state, true), /End the round first/);
});

test('the round counter advances only while the race runs', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  state = endRound(answer(state, true));
  assert.equal(state.round, 2);
  assert.equal(state.turnIndex, 0);
});

/* ---------------------------------------------------- the round 14 finish */

test('a driver who answers everything correctly finishes in round 14', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  let rounds = 0;

  while (!state.finished) {
    state = playRound(state, [true]);
    rounds += 1;
    assert.ok(rounds <= 20, 'the race should have finished by now');
  }

  assert.equal(rounds, 14);
  assert.equal(state.round, 14, 'round stays on the finishing round');
  assert.equal(state.drivers[0].speed, 140);
  assert.equal(state.drivers[0].distance, 105); // 1 + 2 + ... + 14
});

test('a perfect driver is still short of the line after round 13', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  for (let i = 0; i < 13; i++) {
    state = playRound(state, [true]);
  }
  assert.equal(state.finished, false);
  assert.equal(state.drivers[0].distance, 91); // 1 + 2 + ... + 13
});

test('an always-wrong driver stays at 0 MPH and 0 miles', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 2) });
  while (!state.finished) {
    state = playRound(state, [true, false]);
  }
  assert.equal(state.round, 14);
  assert.equal(state.drivers[1].speed, 0);
  assert.equal(state.drivers[1].distance, 0);
  assert.equal(getWinner(state)[0].name, 'Ada');
});

test('R6: a finished race refuses more answers or rounds', () => {
  let state = createRace({ drivers: DRIVERS.slice(0, 1) });
  while (!state.finished) {
    state = playRound(state, [true]);
  }
  assert.throws(() => answer(state, true), /already over/);
  assert.throws(() => endRound(state), /already over/);
});

/* ------------------------------------------------------ winner and ranking */

test('R7: of two cars across the line, the furthest past 100 wins', () => {
  const state = finishedState([
    racer('Ada', 'red', 100, 102),
    racer('Bo', 'blue', 90, 105),
  ]);
  const winners = getWinner(state);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].name, 'Bo');
});

test('R8: level on distance, the higher speed wins', () => {
  const state = finishedState([
    racer('Ada', 'red', 90, 105),
    racer('Bo', 'blue', 140, 105),
  ]);
  const winners = getWinner(state);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].name, 'Bo');
});

test('R8: level on distance and speed means a shared first place', () => {
  const state = finishedState([
    racer('Ada', 'red', 140, 105),
    racer('Bo', 'blue', 140, 105),
    racer('Cleo', 'green', 60, 40),
  ]);
  const winners = getWinner(state);
  assert.deepEqual(
    winners.map((driver) => driver.name),
    ['Ada', 'Bo']
  );

  const places = ranking(state).map((driver) => [driver.name, driver.place]);
  assert.deepEqual(places, [
    ['Ada', 1],
    ['Bo', 1],
    ['Cleo', 3],
  ]);
});

test('R7/R8/R9: full tie-breaking order, then distance for 2nd to 5th', () => {
  const state = finishedState([
    racer('Ada', 'red', 100, 102),
    racer('Bo', 'blue', 90, 105),
    racer('Cleo', 'green', 140, 105),
    racer('Dev', 'yellow', 50, 60),
    racer('Eli', 'purple', 70, 60),
  ]);

  const order = ranking(state).map((driver) => [driver.place, driver.name]);
  assert.deepEqual(order, [
    [1, 'Cleo'], // 105 miles, fastest of the two on 105
    [2, 'Bo'], // 105 miles, slower
    [3, 'Ada'], // 102 miles
    [4, 'Eli'], // 60 miles, faster
    [5, 'Dev'], // 60 miles, slower
  ]);
  assert.equal(getWinner(state)[0].name, 'Cleo');
});

test('ranking marks who crossed the line', () => {
  const state = finishedState([
    racer('Ada', 'red', 140, 105),
    racer('Bo', 'blue', 90, 99.9),
  ]);
  const [first, second] = ranking(state);
  assert.equal(first.crossedLine, true);
  assert.equal(second.crossedLine, false);
});

test('there is no winner while the race is still running', () => {
  const state = createRace({ drivers: DRIVERS.slice(0, 2) });
  assert.deepEqual(getWinner(state), []);
});

/* -------------------------------------------------------------- questions */

test('Q1/Q3/Q4: the shipped question bank is valid', () => {
  assert.deepEqual(validateQuestionBank(bank), []);
});

test('Q1: at least 50 questions per subject', () => {
  for (const subject of CONFIG.subjectOrder) {
    const count = bank.filter((question) => question.subject === subject).length;
    assert.ok(count >= CONFIG.minQuestionsPerSubject, `${subject} has only ${count}`);
  }
});

test('Q2: no question repeats within a 5 driver race', () => {
  const rng = createRng(42);
  let state = createRace({ drivers: DRIVERS });
  const asked = [];

  while (!state.finished) {
    for (let i = 0; i < state.drivers.length; i++) {
      const picked = pickQuestion(state, bank, rng);
      state = picked.state;
      asked.push(picked.question.id);
      state = answer(state, i === 0); // one perfect driver, the rest wrong
    }
    state = endRound(state);
  }

  assert.equal(asked.length, 14 * 5);
  assert.equal(new Set(asked).size, asked.length, 'a question was asked twice');
  assert.equal(state.recycledQuestions, false);
  assert.deepEqual(state.usedQuestionIds, asked);
});

test('subjects rotate maths -> science -> gk across rounds', () => {
  const state = createRace({ drivers: DRIVERS.slice(0, 1) });
  const subjects = [];
  for (let round = 1; round <= 7; round++) {
    subjects.push(subjectForRound({ ...state, round }));
  }
  assert.deepEqual(subjects, ['maths', 'science', 'gk', 'maths', 'science', 'gk', 'maths']);
});

test('questions only come from the subjects the host switched on', () => {
  const rng = createRng(7);
  let state = createRace({ drivers: DRIVERS.slice(0, 2), subjects: ['science', 'gk'] });

  const seen = new Set();
  for (let round = 0; round < 10; round++) {
    for (let i = 0; i < state.drivers.length; i++) {
      const picked = pickQuestion(state, bank, rng);
      state = picked.state;
      assert.ok(['science', 'gk'].includes(picked.question.subject));
      seen.add(picked.question.subject);
      state = answer(state, true);
    }
    state = endRound(state);
  }
  assert.deepEqual([...seen].sort(), ['gk', 'science'], 'both subjects should appear');
});

test('Q3: options are shuffled and answerIndex follows the correct option', () => {
  const question = bank.find((item) => item.id === 'm-001');
  const correctText = question.options[question.answer];

  for (let seed = 1; seed <= 30; seed++) {
    const shown = shuffleOptions(question, createRng(seed));
    assert.equal(shown.options.length, CONFIG.optionCount);
    assert.deepEqual([...shown.options].sort(), [...question.options].sort());
    assert.equal(shown.options[shown.answerIndex], correctText);
  }
});

test('Q3: shuffling really does change the order sometimes', () => {
  const question = bank.find((item) => item.id === 'm-001');
  const orders = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    orders.add(shuffleOptions(question, createRng(seed)).options.join('|'));
  }
  assert.ok(orders.size > 1, 'options never changed order');
});

test('the bank validator catches bad questions', () => {
  const errors = validateQuestionBank([
    { id: 'x-1', subject: 'maths', text: 'Two options only?', options: ['a', 'b'], answer: 0 },
    { id: 'x-1', subject: 'cooking', text: '', options: ['a', 'b', 'c'], answer: 9 },
  ]);
  assert.ok(errors.some((error) => /exactly 3 options/.test(error)));
  assert.ok(errors.some((error) => /Duplicate id/.test(error)));
  assert.ok(errors.some((error) => /unknown subject/.test(error)));
  assert.ok(errors.some((error) => /empty question text/.test(error)));
  assert.ok(errors.some((error) => /answer must be an option index/.test(error)));
  assert.ok(errors.some((error) => /at least 50 needed/.test(error)));
});

/* -------------------------------------------------------- config guardrail */

test('the config still holds the documented rule values', () => {
  assert.equal(CONFIG.correctSpeedChange, 10);
  assert.equal(CONFIG.wrongSpeedChange, -2);
  assert.equal(CONFIG.minSpeed, 0);
  assert.equal(CONFIG.maxSpeed, null);
  assert.equal(CONFIG.trackLength, 100);
  assert.equal(CONFIG.milesPerMphPerRound, 0.1);
  assert.equal(CONFIG.answerTimerSeconds, 30);
  assert.equal(CONFIG.maxDrivers, 5);
});
