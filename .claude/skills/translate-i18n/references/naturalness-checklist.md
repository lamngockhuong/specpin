# Naturalness checklist

Apply per target value. Language-agnostic scan patterns first, then a
Vietnamese-specific section with worked examples. Extend the language sections
as new locales get reviewed.

## Universal scan patterns

1. **Literal calque** - word-for-word rendering of a source idiom or connector
   that no native speaker would write. Watch small function words ("or this",
   "as well") dragged in literally.
2. **Wrong nuance** - the chosen word is a dictionary match but carries the
   wrong connotation for the domain (e.g. a "drift" metaphor rendered as
   physically drifting/adrift).
3. **Dropped qualifier** - source says "all", "again", "yet", "still"; target
   silently omits it, weakening the meaning.
4. **Clumsy word order / register** - grammatically fine but stiff, or mixing
   formal/informal register inconsistently across sibling keys.
5. **Ambiguous short label** - a one-word UI label that collides with another
   common meaning in the target language (e.g. a word that also means a
   database "table").
6. **Placeholder / markup drift** - `{count}`, `{error}`, `<code>`, `\n`
   missing, reordered, or mistranslated. Placeholders are code, never words.
7. **Inconsistent term for one concept** - the same source word rendered two
   different ways across the file. Pick one and sweep.
8. **Spelling / diacritic variants** - the same word spelled two ways. Choose
   the dominant or modern-standard form and standardize.
9. **Untranslatable jargon** - terms the catalog header says to keep
   (`spec`, `sidecar`, `token`, `manual`, `badge`, brand names). Leaving them
   is correct; "fixing" them is a false positive.

## Vietnamese (vi) worked examples

Drawn from a real review pass. Format: `source -> before -> after (why)`.

- **Wrong nuance.** `matching drift data` -> "dữ liệu **trôi dạt** khớp" ->
  "dữ liệu **sai lệch khi** khớp". "trôi dạt" means adrift/floating; "drift"
  here is statistical deviation, so "sai lệch" fits.
- **Literal calque.** `Without domains or this, the project serves no page` ->
  "Không có tên miền **hoặc mục này thì** dự án không phục vụ trang nào" ->
  "**Nếu không có tên miền và cũng không bật mục này**, dự án sẽ không phục vụ
  trang nào". The bare "or this" calque reads broken.
- **Wrong nuance (metaphor).** `fuzzy` -> "mờ" (blurry) -> "gần đúng"
  (approximate). `orphaned` -> "mồ côi" (a literal orphan child) -> "lạc"
  (stray) reads far more naturally for a non-engineer PM.
- **Ambiguous label.** `Hide panel` -> "Ẩn **bảng**" (bảng also = table) ->
  "Ẩn **khung bên**" (it is the side panel).
- **Odd figurative.** `Fragile specs` -> "Spec **dễ vỡ**" (breakable like
  glass) -> "Spec **kém ổn định**".
- **Dropped qualifier.** `Mark all seen` -> "Đánh dấu đã xem" ->
  "Đánh dấu **tất cả** đã xem".
- **Word order.** `Linked tests` -> "Test liên kết" -> "Test **đã** liên kết"
  (past participle needs the tense marker).
- **Spelling standardization.** "Xoá" vs "Xóa" mixed across the file -> pick
  **"Xóa"** (modern diacritic-placement convention) and replace all "Xoá".

### Vietnamese quick rules

- Diacritic placement: prefer modern style ("hóa", "xóa", "thủy"), and keep it
  uniform file-wide.
- Keep register consistent: UI chrome is neutral-polite; avoid switching
  between "bạn"-address and impersonal phrasing between sibling keys.
- Vietnamese has no plural inflection, so `*One` and `*Other` count keys
  usually share identical wording - that is expected, not a bug.

## Japanese (ja) worked examples

Drawn from a real review pass. A well-translated katakana/kanji catalog fails
mostly on consistency, not grammar. Format: `source -> before -> after (why)`.

- **Jargon leak.** The catalog header kept `spec` untranslated, but a few keys
  slipped to katakana "スペック" -> revert to "spec" (e.g. "手動スペック" ->
  "手動spec"). One term, one form, file-wide.
- **Synonym drift.** `default` rendered "既定" in one card while the rest of the
  file used "デフォルト" -> standardize to "デフォルト".
- **Punctuation convention.** One card used full-width parens/comma
  "（ローカル、オプトイン）" while the file uses half-width "(...)" -> match the
  file: "(ローカル、オプトイン)". (Full-width 、for commas was the file norm and
  stayed.)
- **Wrong nuance.** `drift` -> "ドリフトデータ" (ambiguous katakana loan, reads
  like car drifting) -> "ずれデータ" (deviation). Same class of error as vi.
- **Placeholder register.** A field placeholder ended in plain "...します"
  (declarative) -> "...してください" (instruction), which is what a placeholder
  should read as.
- **Missing state marker.** Tag `edited` -> "編集" (the act of editing) ->
  "編集済み" (edited/done), parallel to its sibling "新規" (new).

### Japanese quick rules

- Honor the header's jargon list strictly; katakana-izing a kept term
  (spec -> スペック) is the most common regression.
- Pick one word per concept (デフォルト vs 既定, spec vs スペック) and sweep.
- Match the file's dominant punctuation width (half- vs full-width parens).
- Katakana loanwords are fine when standard (ツールチップ, サイドバー, バッジ),
  but reject ones that are ambiguous in context (ドリフト for statistical drift).
- A leading em-dash neutral marker like "(なし)" mirrored from the source is
  intentional UI, not a translation defect.

## Software-domain terminology (language-general)

Dictionary-correct words are often wrong in a software context. The recurring
trap is picking the everyday sense of a term instead of its technical sense.
From real doc-review passes:

- **fingerprint** (element-matching signal) -> do NOT use the biometric word
  (vi "dấu vân tay"). Keep "fingerprint".
- **resilient** -> not "tenacious/enduring" (vi "bền bỉ"; ja loan "レジリエント");
  use robust/stable (vi "ổn định/bền vững", ja "堅牢な").
- **expose** (serve over HTTP/localhost) -> not the reveal-a-secret sense
  (vi "phơi bày"); use serve/provide (vi "cung cấp/phục vụ"). In a security
  warning, "leak" (vi "để lộ") is the right nuance.
- **noise** (docs that drift become noise) -> the signal-noise sense
  (vi "nhiễu"), not turmoil (vi "nhiễu loạn").
- **provenance** -> prefer the native term (ja "来歴") over a rare katakana loan
  ("プロベナンス").
- **browser extension** -> use the idiomatic native term (ja "拡張機能"), not
  Latin "extension" embedded in the sentence.
- Keep hard jargon in Latin regardless of locale: spec, sidecar, token, Git,
  PR, SSE, DOM, localhost, CLI, JSON, and product/command names.

When unsure whether a term is jargon-to-keep or a word-to-translate, check how
the sibling surfaces (extension catalog, other docs) already treat it and match
that.

## Output shape

Present findings grouped Must-fix / Should-fix / Consistency, as a table:

| key | current | problem | suggested |
|-----|---------|---------|-----------|

Then ask which groups to apply before editing.
