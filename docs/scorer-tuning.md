# Tuning the matching scorer

**Who this is for:** contributors who work on the matcher in
`packages/fingerprint-core`. End users do not need this page. If you just want to
know what the "Matching corpus" card in the extension does, see
[run-guide.md](./run-guide.md).

## The idea in plain words

When Specpin tries to attach a spec to an element on a page, it first looks for a
sure thing (a test id, an `id`, a unique CSS selector). If none of those work,
a **scorer** compares the element it remembers against the elements now on the
page and picks the closest one, but only if it is clearly the best. When nothing
is close enough, it stays silent and marks the spec "orphaned" rather than guess
wrong.

The **corpus** is a notebook of these hard cases, recorded on your own machine
only when you turn it on. It holds two kinds of notes:

- **Re-pin** - you found the drifted element and re-attached the spec yourself.
  This note has the **correct answer** in it (old element -> the right new one).
- **Auto-capture** - the scorer was unsure at match time, so it saved what it
  saw. This note has **no confirmed answer**; it is just a snapshot.

## The one rule before you tune

**You can only tune with Re-pin notes.** They are the only ones with a known
correct answer, so they are the only ones that tell us whether a change is an
improvement. Auto-capture notes alone cannot tune anything (there is nothing to
check a change against).

So if you export the corpus and it is all Auto-capture, the tuner will say it has
nothing to work with. Go re-pin some orphaned specs first (open the pages, attach
the specs to the right elements), then export again.

## Step by step

1. In the extension Options, turn on the **Matching corpus** card.
2. Use the app as normal. When specs go orphaned after a UI change, **re-pin
   them** (or click **Correct** on a low-confidence match to confirm it). Each of
   those writes a Re-pin note.
3. In Options, click **Export corpus (JSON)** and save the file.
4. From the repo root, run the tuner on that file:

   ```bash
   pnpm --filter @specpin/fingerprint-core tune ~/Downloads/specpin-drift-corpus.json
   ```

5. Read the output (next section).
6. If a change looks worthwhile, edit `WEIGHTS` and/or `THRESHOLDS` in
   `packages/fingerprint-core/src/score.ts`, then re-run the tests:

   ```bash
   pnpm --filter @specpin/fingerprint-core test
   ```

## Reading the output

The report has three parts.

### Re-pin notes (the ones with correct answers)

```
== Supervised pairs (ground truth old -> new) ==
count 12 (confirmed 3) · mean score 0.78
tiers: HIGH 7 (58%) · MID 3 (25%) · below 2 (17%)
per-signal mean similarity across re-pin corrections (higher = signal survived):
  textContent   0.91
  nearbyLabels  0.74
  attributes    0.88
  tagName       1.00
  domPath       0.34
  positionHint  0.62
```

- **count / confirmed** - how many Re-pin notes, and how many were just "Correct"
  confirmations (the element did not actually move).
- **mean score** - on average, how strongly the scorer would recognize the
  correct new element. Higher is better. Closer to 1 means "easily recognized".
- **tiers** - of those correct answers, how many the scorer would accept
  confidently (**HIGH**), accept but flag for review (**MID**), or miss entirely
  (**below**). You want most in HIGH and few in "below".
- **per-signal similarity** - this is the useful part. Each row is one clue the
  scorer uses. The number is how much that clue stayed the same across your real
  UI changes. A **high** number means the clue is reliable and deserves more
  weight; a **low** number means it broke during refactors and is misleading. In
  the example, `domPath` (the element's position in the HTML tree) scored 0.34,
  so structure changed a lot, that clue should probably carry less weight, while
  `textContent` and `attributes` held up well.

### Auto-capture notes (the ones without answers)

```
== Passive candidate sets (weak labels) ==
count 45 (with candidates 38)
top candidate score: mean 0.52 · reaches MID(0.6): 9/38
top-vs-runner-up margin: mean 0.31
would render 6/38 · abstain: no content signal 4 · top below MID 27 · near-tie (< DELTA 0.1) 1
```

- **count / with candidates** - how many snapshots, and how many had at least one
  element to compare against (the rest found nothing to compare, a true dead end).
- **top candidate score** - how good the best match was, on average, and how
  often it cleared the **MID** bar (0.6) needed to render at all.
- **would render / abstain** - would the scorer have shown a match, or stayed
  silent, and **why** it stayed silent:
  - **no content signal** - the element had no text/label/attributes to judge by,
    so the scorer refuses on principle (structure alone is too risky).
  - **top below MID** - the best match just was not good enough (under 0.6).
  - **near-tie** - two candidates were too close to call, so it would not guess.

If almost everything is "top below MID", the scorer is being very cautious on
your data: it sees drifted elements but does not trust any of them enough. That
is a hint (not proof) that the thresholds or weights may be too strict. To know
for sure, re-pin those specs so they become Re-pin notes with real answers.

### Weight suggestion

```
== Weight suggestion (coordinate ascent) ==
current   J 0.31  { textContent 0.30, ... }
suggested J 0.44  { textContent 0.55, ... }
```

The tuner tries many weight combinations and suggests one that separates correct
answers from wrong ones better (higher **J**). Treat this as a **starting idea,
not a final answer** - it is built from limited, partly-unconfirmed data. Use it
together with the per-signal table above and your own judgment.

## What the knobs mean

In `score.ts`:

- **`WEIGHTS`** - how much each clue counts. Only the ratios between them matter,
  not the absolute numbers. Raise clues that survived your refactors (high
  per-signal similarity), lower the brittle ones.
- **`THRESHOLDS`**:
  - **HIGH** (0.85) - score needed to show a match confidently.
  - **MID** (0.6) - minimum score to show a match at all (below this = no match).
  - **DELTA** (0.1) - how far the best candidate must beat the runner-up to win.
    Prevents guessing between two similar elements.

## Cautions

- Lowering **MID** makes the scorer match more often, but also lets more **wrong**
  matches through. Specpin is deliberately cautious here; loosen it only with
  evidence from Re-pin notes.
- Never apply the suggested weights blindly. Change one thing, re-run the tests,
  and sanity-check against `score.test.ts`.
- The corpus stores fingerprints only (no page HTML), with emails and long
  numbers masked. It never leaves the machine unless you export it.
