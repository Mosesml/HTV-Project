# Fall model: how we get started

Owner: Kean (motion is Justin's area; Kean has taken this on). Tasks: PRD A15–A23, work order K12–K20.
Status on 2026-10-17: live AirPods motion works on the phone (state follows still, walking and dancing). No real recordings exist yet; every detector so far is tuned on synthetic clips.

We want a fall detector that catches **a teammate falling onto a couch** (the demo's fall) and never fires on sitting down or lying down on that couch. We get there in two steps: first measure and retune today's thresholds on real couch data, then train a small on-device model and keep it only if it beats the retuned thresholds. A model is never shipped on faith: the same replay bars judge both.

## The path at a glance

| Step | What | Output | Time |
| --- | --- | --- | --- |
| 0 | Recording tools: Mac now, phone recorder on Debug | A way to make labelled CSV takes | 0 h (Mac) / ~2 h (phone) |
| 1 | Baseline: 5 couch falls + 5 couch sit-downs through today's detector | A table of what fires and why | ~1 h |
| 2 | Recording session, all four people | ~280 labelled takes in `Motion/Fixtures/` | ~2 h |
| 3 | Data check | Every take valid; bad ones re-recorded | ~1 h |
| 4 | Retune the thresholds on the couch data | DET-7 passes, or the gap is known | ~2 h |
| 5 | Tiger Data: shared dataset and splits | Takes, samples and candidates in hosted Postgres | ~1.5 h |
| 6 | Candidate features (shared with the app) | `features.csv`, one row per candidate | ~3 h |
| 7 | Augmentation (training folds only) | 8 variants per training fall | ~1.5 h |
| 8 | Train (Create ML, on a Mac) | `FallModel.mlmodel` | ~1.5 h |
| 9 | Evaluate: thresholds vs retuned vs model | Results table and a ship / don't-ship decision | ~2 h |
| 10 | Integrate in the app | `LearnedFallDetector` with thresholds as fallback | ~3 h |
| 11 | Rehearse on the demo couch | Counts for the slides | ~1 h |

**Minimum path** if time runs short: steps 0–4 and 11. Retuned thresholds that pass DET-7 are a complete result; the model (steps 5–10) is P2 and second on the cut list.

## Step 0: recording tools

Every take is one CSV in the existing format (`Motion/MotionCSV.swift`): header lines `# label=…`, `# person=…`, then `t,pitch,roll,yaw,rotX,rotY,rotZ,accX,accY,accZ,gravX,gravY,gravZ` at ~50 Hz. Files are named `<person>_<label>_<take>.csv`.

- **On a Mac, today.** Pair the AirPods with the Mac, then from `app/modules/raveguard-native/ios`:
  `Tools/MotionProbe/run.sh record fall kean 15` (label, person, seconds). The take lands in the current folder. Downside: the AirPods must be connected to the Mac, not the phone, and stay within Bluetooth range.
- **On the phone (recommended, ~2 h).** Justin's `MotionRecorder` already runs inside `HeadMotionStream`; it only needs to be reachable. Add two module methods, `startRecording(label, person)` and `stopRecording() → file URI` (a `CONTRACT:` change, appended at the end), and a small "Record a take" panel on Debug: person, label picker, Start / Stop with a sample counter, then React Native's `Share` sheet to AirDrop the CSV to a Mac. This records on the same phone and AirPods as the demo, which is the point. Add `liedown` to `MotionRecorder.labels` (the protocol needs it).

## Step 1: baseline (do this first)

1. Record 5 couch falls and 5 hard couch sit-downs (Step 2's script).
2. Copy them into a scratch folder and run `swift run motion-probe replay <folder>` from `app/modules/raveguard-native/ios`.
3. For each take, note: did it fire; the peak g (the detector wants ≥ 2.5 g); the tilt reached (≥ 50°); seconds still afterwards (≥ 10 s).
4. Post the table to the team.

**Decision.** If today's detector already catches ≥ 8 of 10 couch falls with 0 sit-down triggers, Step 4 is a light touch and the model is optional. If falls are missed because the couch keeps peaks under 2.5 g (likely), Step 4 lowers the spike and leans on tilt and stillness, and the model earns its place by separating soft falls from hard sit-downs.

## Step 2: recording session

**Before.** Everyone agrees that their head-motion recordings (no audio, no location) are stored in the team's Tiger Data database until the hackathon ends (PRD open question). AirPods charged; the demo couch; one person recording, one spotting.

**Safety.** Fall onto the couch only: seat cushions or the back cushion, never head-first onto an arm or the frame, never onto the floor. Stop if anyone feels dizzy.

**Every take.** Stand (or sit, for lie-downs) upright and still for 3 s: that is the posture baseline. Do the one action.

- **Falls are 15 s:** 3 s still, fall right at the 3 s mark, then stay completely motionless until the recording stops. That leaves about 10–11 s of stillness after landing, and the detector needs 10, so a late fall or a fidget can make a real fall look missed. If the replay misses falls only because takes end too soon, go to 17 s.
- **Lie-downs:** after lying down, stay still for 15 s.

**Per person** (4 people, so ~280 takes and ~70 min of motion):

| Label | Count | How | Take |
| --- | --- | --- | --- |
| `fall` | 15 | 4 forward (face onto the seat cushions), 4 backward (onto the back cushion), 4 sideways (2 left, 2 right), 3 slow slumps (knees give, sink sideways) | 15 s: 3 s still, fall, motionless |
| `sitdown` | 15 | 5 hard drops onto the seat, 5 normal sits, 5 sit-and-lean-back | ~12 s |
| `liedown` | 5 | sit, then deliberately lie down along the couch | ~20 s |
| `dancing` | 1 | 5 min with music, jumps included | 5 min |
| `walking` | 1 | 2 min around the room, stopping now and then | 2 min |
| `nod` | 10 | two firm nods | ~6 s |
| `still` | 1 | 2 min standing or sitting still | 2 min |

Add `# surface=couch` and, for falls, `# direction=forward|backward|left|right|slump` to the header (the phone panel can do this; on a Mac, edit the first lines). Put every take in `app/modules/raveguard-native/ios/Motion/Fixtures/` and commit them on a data branch, then push: that folder is the master copy (the replay harness and tests read it), and Tiger Data is a queryable copy. A take is ~115 KB per 20 s (13 columns at 50 Hz); the whole session is ~27 MB, ~7 MB per person, which git handles without LFS. Keep the Step 1 baseline in a subfolder (`Motion/Fixtures/couch-baseline/`): the replay test reads only files directly in `Motion/Fixtures/`, so couch takes there would fail Justin's J6/J7 test before Step 4 retunes the thresholds.

## Step 3: data check

A short script (or the replay harness, extended) flags any take that:

- has a sample rate outside 40–60 Hz or gaps over 0.5 s;
- is shorter than its label needs (falls < 14.5 s, dancing < 4 min);
- does not start with 3 s of near-stillness (bad posture baseline);
- is a `fall` whose tilt passes 45° after the 5 s mark (fell too late to leave 10 s of stillness);
- is a `fall` that never tilts past 45°, or a `sitdown` that does.

Re-record what it flags. Five minutes now saves an hour of confusing model results later.

## Step 4: retune the thresholds

Change `FallDetectorConfig` (`Motion/FallDetector.swift`), replaying all takes after each change. Likely moves: a lower `spikeG` (couch landings may peak at 1.2–2 g), and let tilt plus 10 s of stillness carry the decision. Record each change and its replay table in `Motion/README.md`. Bars (all, on every person):

- couch falls caught ≥ 8 of 10, within 12 s of the fall;
- 0 triggers on `sitdown` and `liedown`;
- ≤ 1 trigger per 30 min of `dancing`; 0 on `walking`, `nod`, `still`.

If the retuned thresholds pass, DET-7 is done and ships, with or without a model.

## Step 5: dataset in Tiger Data

Tiger Data is hosted PostgreSQL with time-series tables; the hackathon gives $1,000 of credits for **30 days from sign-up**, so sign up when Step 2 is done, not before. The phone never talks to it: it is the team's shared copy of the data and the place for questions about it. The CSVs in `Motion/Fixtures/` stay the source of truth.

Connection string in `ml/.env` as `TIGER_DATABASE_URL` (`.env.*` is already git-ignored). Code in `ml/dataset/`:

```sql
-- ml/dataset/schema.sql
create table takes (
  id          text primary key,              -- file name without .csv, e.g. kean_fall_07
  person      text not null,
  label       text not null,
  surface     text,
  direction   text,
  source      text not null default 'airpods',
  recorded_at timestamptz not null default now(),
  sample_hz   real,
  duration_s  real,
  notes       text
);

create table motion_samples (
  take_id text not null references takes(id) on delete cascade,
  ts      timestamptz not null,               -- recorded_at + t
  t       double precision not null,          -- seconds from the take's start
  pitch double precision, roll double precision, yaw double precision,
  rot_x double precision, rot_y double precision, rot_z double precision,
  acc_x double precision, acc_y double precision, acc_z double precision,
  grav_x double precision, grav_y double precision, grav_z double precision
);
select create_hypertable('motion_samples', by_range('ts'));
create index on motion_samples (take_id, ts);

create table candidates (                     -- one row per Step 6 candidate, features as columns
  take_id text not null references takes(id) on delete cascade,
  t0      double precision not null,
  is_fall boolean not null
  -- feature columns added by the feature tool's export
);
```

- `upload.mjs` (Node + `pg`): reads every CSV in `Motion/Fixtures/`, skips takes already in `takes`, bulk-inserts samples with `COPY`.
- Splits are **by person**: train on three people, test on the fourth, four times ("leave one person out"). Never split by sample or by take, or the model learns each person's style and looks better than it is.
- Handy queries: takes per person and label; peak `sqrt(acc_x²+acc_y²+acc_z²)` per take (`time_bucket` for plots); the four folds.

## Step 6: candidates and features

A model looks at **candidates**, not every sample: a candidate starts when the head tilts past **45°** from the posture baseline (just under the detector's 50°, so nothing is missed), with at most one candidate per 5 s. Its window runs from 2 s before that moment (`t0`) to 3 s after.

Features per candidate (all from the existing sample fields):

| Feature | Window | Why |
| --- | --- | --- |
| Peak and mean user acceleration (g) | t0−1 to t0+1 | The impact, even a soft one |
| Lowest total acceleration, user + gravity (g) | t0−1.5 to t0 | A brief drop below 1 g is the fall itself; sitting has none |
| Peak rotation rate (rad/s) | t0−1 to t0+1 | Falls rotate the head fast |
| Tilt speed: time from 15° to 45° (s) and peak °/s | around t0 | Falls tip over fast; lying down is slow and controlled |
| Tilt at t0+3 and its direction (pitch, roll) | t0+3 | Where the head ended up |
| Mean acceleration and rotation before | t0−2 to t0−0.5 | What they were doing just before (dancing vs standing) |
| Mean rotation and acceleration after | t0+1.5 to t0+3 | Settling still after a fall vs adjusting after lying down |
| Peak jerk (change in acceleration between samples) | t0−1 to t0+1 | Sharpness of the landing |

**Labels.** In a `fall` take, the first candidate is the fall (the take has exactly one fall; Step 3 checks it has a candidate). Every candidate in any other take is not a fall, and `sitdown` and `liedown` give the hard negatives.

**One feature code path.** Put the extractor in `Motion/FallFeatures.swift`, compiled into the app. The training tool calls it, and later so does the app. Two implementations drift, and a model fed different numbers in the app than in training fails quietly.

## Step 7: augmentation

Four people's falls are too few to train on alone. On **training folds only** (never the held-out person), make 8 variants of every fall take before extracting features:

- rotate the sensor frame ±15° about the gravity axis (AirPods sit a little differently in each ear);
- scale acceleration and rotation by 0.8–1.2 (harder and softer landings);
- stretch time by 0.85–1.15 and resample to 50 Hz (faster and slower falls);
- add sensor noise (0.01 g, 0.02 rad/s);
- mirror left and right (flip roll and the matching rotation axes);
- splice the fall after 20 s of the same person dancing, so "before" features look like a real night.

A test asserts that no take from the test fold is ever augmented.

## Step 8: train

On a Mac (Create ML is in Xcode 27.1). One small command-line tool in the Swift package does the lot, so the whole team runs the same thing:

```text
swift run fall-lab features  Motion/Fixtures      > build/features.csv
swift run fall-lab augment   Motion/Fixtures --fold kean   # training variants for one fold
swift run fall-lab train     build/features.csv --holdout kean
swift run fall-lab eval      Motion/Fixtures --model build/FallModel.mlmodel
```

- Model: Create ML `MLBoostedTreeClassifier`, target `is_fall`, max depth 4, 100 iterations. Boosted trees suit a few hundred rows and stay readable (we can see which features matter).
- Positive and negative counts are uneven: weight the fall class up, or downsample negatives per fold.
- The model outputs a probability. Pick the cut-off on the training folds as the **lowest value that gives 0 triggers on sit-downs and lie-downs**, then check it on the held-out person.
- Train the final model on all four people with that cut-off. It should be well under 1 MB.

## Step 9: evaluate and decide

Run the Step 4 bars on each held-out person for three detectors: today's thresholds, the retuned thresholds and the model (model candidate, then the existing 10 s stillness check). Put the table in `Motion/README.md`:

| Detector | Falls caught (per person) | Sit-down / lie-down triggers | Dancing triggers per 30 min | Seconds to detect |
| --- | --- | --- | --- | --- |
| Today's thresholds | | | | |
| Retuned thresholds | | | | |
| Model | | | | |

**Ship the model only if** it passes every bar on every held-out person and catches more falls than the retuned thresholds. Otherwise the retuned thresholds ship, and that is a fine result to present.

## Step 10: integrate

- `FallModel.mlmodel` goes in `app/modules/raveguard-native/ios/Motion/Model/`; the podspec compiles it with the module, and `Package.swift` adds it as a resource so `swift test` can load it.
- `LearnedFallDetector` has `FallDetector`'s interface: candidate (tilt past 45°), then `FallFeatures`, then the model, then the existing 10 s stillness check. Reason strings stay readable, e.g. "model 0.93, head 70° sideways, still 10 s".
- `MotionPipeline` uses it when the model loads; otherwise it falls back to the thresholds and the session log says so.
- Tests: the app's code path reproduces Step 9's replay numbers exactly; a missing model falls back.

## Step 11: rehearse

On the demo couch, with the demo phone and AirPods, and the noise backend set to Off (so nothing else opens on screen): 10 falls, 10 sit-downs, 5 lie-downs. Record the counts for the slides (feeds A14) and say on stage that it was tuned and shown on a couch.

## Getting started today

1. Record 5 couch falls and 5 sit-downs on the Mac (`Tools/MotionProbe/run.sh record fall kean 15`, then `record sitdown kean 12`), and run the Step 1 replay. This needs nothing new.
2. Decide: build the phone recorder (Step 0) before the full session, or record everything on the Mac.
3. Agree a time for the recording session with the team, and get everyone's consent for Tiger Data.
4. Sign up for Tiger Data only once the recordings exist.

## Open questions

- Phone recorder or Mac for the full session? (The phone matches the demo; the Mac works today.)
- Who records with Kean, and when? All four are needed for the leave-one-person-out splits.
- Does Justin want to review the retuned thresholds before they replace his starting values?
