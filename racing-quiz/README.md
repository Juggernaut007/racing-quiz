# F1 Racing Quiz

An F1 racing quiz game for Grade 2 students, in a black & purple theme.
© 2026 Aayansh Panda. All rights reserved. Up to 5 drivers share one device and
race on a 100-mile track by answering Maths, General Science and General Knowledge
questions. A correct answer adds 10 MPH, a wrong answer or a timeout takes away
2 MPH, and the first car past 100 miles wins.

Race extras: top-down F1 cars numbered per driver, a five-light F1 start
sequence, live P1-P5 positions with gained/lost-place badges, kerbed lanes with a
grid box and chequered finish, speed trails and an engine sweep while the cars
move, and confetti on the results screen.

Built from `Racing Quiz Game Requirements.pdf` and `SKILL_car racing.md` in the
folder above.

## Run

ES modules and the `questions.json` fetch need a local server; opening
`index.html` straight from disk will block the question load.

```sh
cd racing-quiz
python -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

After the first load the game works with the network off (N2).

## Test

```sh
cd racing-quiz
node --test                    # 38 tests, Node 18+
```

> The skill file documents `node --test test/`. That directory form fails on
> Node 26 (it tries to resolve `test/` as a module). Use `node --test`, or
> `node --test test/game.test.js`, on newer Node.

All tests must pass before calling a change done. Then play one 2-driver race in
the browser: one driver answers everything right, one answers everything wrong,
and confirm the first finishes in round 14 and the second stays at 0 MPH.

## Deploy to Vercel

The site is fully static - there is no build step, so Vercel just serves the
folder. The app lives in the `racing-quiz/` subfolder of this repo, which is the
one setting that matters when importing.

### Via the Vercel dashboard (git integration)

1. [vercel.com/new](https://vercel.com/new) &rarr; import `Juggernaut007/racing-quiz`
2. **Root Directory: `racing-quiz`** - click Edit and pick the folder. Without
   this, Vercel serves the repo root and you get a 404.
3. Framework Preset: **Other**. Leave Build Command and Install Command empty.
4. Deploy. Every push to `main` redeploys from then on.

### Via the CLI

```sh
cd "04. Car Racing game/racing-quiz"
npx vercel login      # one time, opens a browser
npx vercel --prod     # run from this folder, so it is the deployment root
```

`vercel.json` pins `framework: null` and `outputDirectory: "."`, so nothing is
auto-detected and nothing is built. `questions.json` and `sw.js` are served with
`must-revalidate` so a new deploy is picked up rather than cached forever.

## Offline support

A service worker (`sw.js`, registered by `sw-register.js`) precaches the app
shell and the question bank, which is what makes N2 ("works offline once
loaded") true on a real deployment and not just on localhost. Verified by
loading the site, cutting the network, reloading, and starting a race from cache.

Service workers need https or localhost, so opening `index.html` straight from
disk just skips registration - the game still runs from a local server.

**When you change a shell file, bump `CACHE_NAME` in `sw.js`** (`racing-quiz-v1`
&rarr; `-v2`). Tablets that already cached the old version will otherwise keep
serving it. Fetches use stale-while-revalidate, so a bumped cache lands on the
second load.

`manifest.webmanifest` plus the icons let a teacher add the game to a tablet
home screen as a standalone app.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The four screens: setup, race, results, pause overlay |
| `styles.css` | Layout and the large touch targets (answers 72px tall, 26px text) |
| `config.js` | Every rule number, in one place (N6) |
| `game.js` | Pure race logic, no DOM: `createRace`, `answer`, `endRound`, `getWinner`, `ranking`, `pickQuestion` |
| `ui.js` | DOM rendering, car animation, sounds, read-aloud, timer |
| `questions.json` | The question bank (164 questions) |
| `sw.js`, `sw-register.js` | Offline cache for the deployed site |
| `manifest.webmanifest`, `favicon.svg`, `icon-*.png` | Install-to-home-screen metadata and icons |
| `vercel.json`, `.vercelignore` | Hosting config (static, no build) |
| `assets/car.svg` | Reference copy of the car artwork |
| `test/game.test.js` | Unit tests for the rules |

## Rules as built

| Setting | Value |
| --- | --- |
| Drivers | 1 to 5, one shared device, fixed turn order |
| Start | 0 MPH, 0 miles |
| Correct answer | +10 MPH |
| Wrong answer or timeout | &minus;2 MPH, never below 0 MPH |
| Top speed | none |
| Round | every driver answers one question, then all cars move |
| Distance per round | speed x 0.1 miles (one round = 6 minutes of race time) |
| Track length | 100 miles |
| Answer timer | 30 s, host can switch it off |
| Winner | first past 100 miles at round end; tie &rarr; furthest past 100, then higher speed, then shared |

A driver who is always correct finishes in round 14 (1 + 2 + ... + 14 = 105 miles).
`test/game.test.js` guards that property - keep it passing whenever the numbers change.

## Question bank

164 questions: 58 Maths, 52 General Science, 54 General Knowledge. All drivers in a
round get the same subject but a different question, and the subject rotates
Maths &rarr; Science &rarr; General Knowledge each round across whichever subjects
the host switched on.

To add or edit questions, edit `questions.json` only. Each entry is:

```json
{ "id": "m-059", "subject": "maths", "text": "What is 20 + 5?", "options": ["25", "15", "30"], "answer": 0 }
```

- `id` must be unique; `subject` is `maths`, `science` or `gk`
- exactly 3 options, `answer` is the index of the correct one
- question text is at most 15 words
- options are shuffled on screen, so the order in the file does not matter

Validate after editing:

```sh
node -e "const b=require('fs').readFileSync('questions.json','utf8');JSON.parse(b);console.log('json ok')"
node --test                    # the bank validator runs as a test
```

A single-subject race with 5 drivers needs 70 questions, which is more than any one
subject holds. In that case the game reuses questions only after the whole enabled
bank is exhausted, and sets `recycledQuestions` on the state.

## Changing rules

Edit `config.js`, then re-run the tests. If you change the speed or distance
numbers, update the round-14 test to match the new arithmetic.

## Accessibility and classroom notes

- Answer buttons are 72px tall with 26px text; keys `1`, `2`, `3` also answer
- Right and wrong are shown with an icon and words, never colour alone (N5)
- `Read aloud` uses the browser's speech synthesis to speak the question and all
  three options (Q5)
- Correct plays a short engine vroom, wrong plays a soft two-note sound - no buzzer
- `Escape` pauses and resumes; the pause overlay stops the timer
- No login, no network calls, no personal data: driver names live in memory only
  and are gone when the page closes (N3)
