/**
 * Every tunable rule value lives in this file (requirement N6).
 * Change a number here, then re-run `node --test test/`.
 */

const roundMinutes = 6; // one round counts as 6 minutes of race time

export const CONFIG = {
  // --- Players (P1, P2) ---
  minDrivers: 1,
  maxDrivers: 5,
  maxNameLength: 12,

  // --- Starting values (P3) ---
  startSpeed: 0,
  startDistance: 0,

  // --- Speed rules (R1, R2, R3) ---
  correctSpeedChange: 10,
  wrongSpeedChange: -2,
  minSpeed: 0,
  maxSpeed: null, // null = no top speed limit

  // --- Track and movement (R4, R5, R6) ---
  trackLength: 100, // miles
  roundMinutes,
  milesPerMphPerRound: roundMinutes / 60, // 0.1 miles per MPH per round

  // --- Timer (default on, host can switch it off) ---
  answerTimerSeconds: 30,
  timerEnabledByDefault: true,

  // --- Presentation timings (Q6, UI) ---
  feedbackMs: 2000, // how long right/wrong feedback stays on screen
  carAnimationMs: 1000, // car slide at the end of a round

  // --- Question bank shape (Q1, Q3, Q4) ---
  optionCount: 3,
  maxQuestionWords: 15,
  minQuestionsPerSubject: 50,

  // --- Subjects (P4, question rotation) ---
  subjectOrder: ['maths', 'science', 'gk'],
  subjectLabels: {
    maths: 'Maths',
    science: 'General Science',
    gk: 'General Knowledge',
  },

  // --- Car colours (P2: two drivers cannot share one) ---
  carColors: [
    { id: 'red', label: 'Red', hex: '#e63946' },
    { id: 'blue', label: 'Blue', hex: '#1d6fd0' },
    { id: 'green', label: 'Green', hex: '#2a9d4a' },
    { id: 'yellow', label: 'Yellow', hex: '#e8a300' },
    { id: 'purple', label: 'Purple', hex: '#7b3fe4' },
    { id: 'orange', label: 'Orange', hex: '#ec6b1f' },
  ],
};
