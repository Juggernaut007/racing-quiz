---
name: racing-quiz-game
description: Build, run and test the Grade 2 car racing quiz game (up to 5 drivers, Maths/Science/GK questions, +10 MPH correct, -2 MPH wrong, 100-mile track).
---

# Racing quiz game: build and run

Use this skill when building, changing, running or testing the educational car racing
quiz game for Grade 2 students. The full requirements live in the "Racing Quiz Game
Requirements" doc; this file is the how-to.

## Rules to implement (source of truth: config.js)

| Setting | Default |
| --- | --- |
| Drivers | 1 to 5, one shared device, fixed turn order |
| Start | 0 MPH, 0 miles |
| Correct answer | +10 MPH |
| Wrong answer or timeout | -2 MPH, never below 0 MPH |
| Top speed | none |
| Round | every driver answers one question, then all cars move |
| Distance per round | speed x 0.1 miles (one round = 6 minutes of race time) |
| Track length | 100 miles |
| Answer timer | 30 s, host can turn it off |
| Winner | first to reach 100 miles at round end; tie -> furthest past 100, then higher speed, then shared |

A driver who is always correct finishes in round 14 (1+2+...+14 = 105 miles).
Keep this property as a regression test whenever the numbers change.

## Tech stack

Plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no backend,
works offline. Tests use Node's built-in test runner (Node 18+), so no npm install is needed.

## File layout

```
racing-quiz/
  index.html          # screens: setup, race, results, pause overlay
  styles.css          # large touch targets (buttons >= 64px tall, text >= 24px)
  config.js           # all rule numbers above, exported as one object
  game.js             # pure logic, no DOM: createRace, answer, endRound, getWinner, ranking
  ui.js               # DOM rendering, animation, sounds, read-aloud (speechSynthesis)
  questions.json      # question bank
  assets/             # car images, sounds
  test/game.test.js   # unit tests for game.js
```

## Build steps

1. Write `config.js` with the rule table above.
2. Write `game.js` as pure functions over a plain state object:
   `{ round, turnIndex, drivers: [{ name, color, speed, distance, correct }], usedQuestionIds, finished }`.
   - `answer(state, isCorrect)`: speed += 10, or speed = max(0, speed - 2); advance turn.
   - `endRound(state)`: distance += speed * 0.1 for every car; if any distance >= 100, set finished.
   - `getWinner(state)` and `ranking(state)` apply the tie rules.
   - Round distances to 1 decimal place for display only; keep full precision in state.
3. Write `questions.json`: at least 50 per subject, each
   `{ "id": "m-001", "subject": "maths" | "science" | "gk", "text": "...", "options": ["a","b","c"], "answer": 0 }`.
   Max 15 words, 3 options, one correct. Shuffle options at display time.
   Subjects rotate maths -> science -> gk per driver; never repeat a question in one race.
4. Write `ui.js` and `index.html`: one lane per driver with 0-100 mile markers, speed and
   distance labels, current driver highlighted, question card with 3 big buttons, countdown,
   Read aloud button, 2 s feedback (right/wrong plus the correct answer, icon and words not
   only colour), 1 s car animation at round end, results screen with ranking table.
5. Write tests in `test/game.test.js` covering at least:
   - 6th driver rejected
   - +10 on correct, -2 on wrong, floor at 0 (speed 0 -> wrong -> 0)
   - distance = speed x 0.1 per round
   - all-correct driver finishes in round 14
   - tie-breaking order
   - no repeated questions in a race

## Run

```
cd racing-quiz
python3 -m http.server 8000
# open http://localhost:8000
```

ES modules need a local server; opening index.html straight from disk may block the
JSON fetch. Any static server works (`npx serve` also fine).

## Test

```
cd racing-quiz
node --test test/
```

All tests must pass before calling a change done. Then play one 2-driver race in the
browser: one driver answers everything right, one answers everything wrong, and confirm
the first finishes in round 14 and the second stays at 0 MPH.

## Changing rules or questions

- Rule numbers: edit `config.js` only, then rerun the tests (update the round-14 test if
  the speed or distance numbers change).
- Questions: edit `questions.json`; keep ids unique and `answer` as the index of the
  correct option. Validate with `node -e "JSON.parse(require('fs').readFileSync('questions.json'))"`.
