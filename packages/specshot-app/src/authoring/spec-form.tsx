/**
 * Author a pending Spec for one callout: id + localized title/description +
 * optional business rules (one locale at a time — buildPendingSpec accepts a
 * multi-locale map, this form authors the current `locale` only). Or skip
 * authoring and link an EXISTING specId supplied by the host (populated from
 * the sidecar's spec list; empty when offline, so this path is sidecar-only).
 */

import { formatErrors } from "@specpin/spec-schema";
import { type BuildPendingSpecResult, buildPendingSpec } from "@specpin/specshot-core";
import { type FormEvent, useState } from "react";

export interface ExistingSpecOption {
  id: string;
  title: string;
}

export interface SpecFormProps {
  itemNo: string;
  locale: string;
  existingSpecs: ExistingSpecOption[];
  onPendingSpecBuilt: (result: BuildPendingSpecResult) => void;
  onExistingSpecSelected: (specId: string) => void;
}

export function SpecForm({
  itemNo,
  locale,
  existingSpecs,
  onPendingSpecBuilt,
  onExistingSpecSelected,
}: SpecFormProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [existingId, setExistingId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const submitNew = (e: FormEvent) => {
    e.preventDefault();
    const rules = rulesText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
    const result = buildPendingSpec({
      id: id.trim(),
      title: { [locale]: title.trim() },
      description: { [locale]: description.trim() },
      businessRules: rules.length ? rules.map((r) => ({ [locale]: r })) : undefined,
    });
    setFormError(result.valid ? null : formatErrors(result.errors));
    if (result.valid) onPendingSpecBuilt(result);
  };

  const submitExisting = (e: FormEvent) => {
    e.preventDefault();
    if (existingId) onExistingSpecSelected(existingId);
  };

  return (
    <div className="spec-form">
      <header className="spec-form-head">
        <span>Item {itemNo}</span>
        <div className="mode-toggle">
          <button
            type="button"
            className={mode === "new" ? "active" : ""}
            onClick={() => setMode("new")}
          >
            New pending spec
          </button>
          <button
            type="button"
            className={mode === "existing" ? "active" : ""}
            onClick={() => setMode("existing")}
            disabled={existingSpecs.length === 0}
            title={
              existingSpecs.length === 0 ? "No existing specs (connect to the sidecar)" : undefined
            }
          >
            Existing spec
          </button>
        </div>
      </header>

      {mode === "new" ? (
        <form onSubmit={submitNew}>
          <label>
            Spec id
            <input value={id} onChange={(e) => setId(e.target.value)} required />
          </label>
          <label>
            Title ({locale})
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Description ({locale})
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>
          <label>
            Business rules (one per line)
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} />
          </label>
          {formError && <p className="form-error">{formError}</p>}
          <button type="submit">Save pending spec</button>
        </form>
      ) : (
        <form onSubmit={submitExisting}>
          <label>
            Existing spec
            <select value={existingId} onChange={(e) => setExistingId(e.target.value)} required>
              <option value="" disabled>
                Choose…
              </option>
              {existingSpecs.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.title} ({opt.id})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!existingId}>
            Link existing spec
          </button>
        </form>
      )}
    </div>
  );
}
