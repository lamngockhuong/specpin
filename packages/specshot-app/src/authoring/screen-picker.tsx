/**
 * Choose/enter the `screenId` a shot belongs to. Fully offline-friendly:
 * typing an id and a display name is enough to export. When the host has
 * fetched Screen definitions from the sidecar (`screens` prop), offers a
 * quick-pick datalist and shows the matched Screen's known `specIds` count.
 */

import type { Screen } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";

export interface ScreenPickerProps {
  screens: Screen[];
  screenId: string;
  screenName: string;
  locale: string;
  onChangeScreenId: (id: string) => void;
  onChangeScreenName: (name: string) => void;
}

export function ScreenPicker({
  screens,
  screenId,
  screenName,
  locale,
  onChangeScreenId,
  onChangeScreenName,
}: ScreenPickerProps) {
  const known = screens.find((s) => s.id === screenId);

  return (
    <div className="screen-picker">
      <label>
        Screen id
        <input
          value={screenId}
          onChange={(e) => onChangeScreenId(e.target.value)}
          placeholder="e.g. checkout"
          list="spec-sheet-known-screens"
        />
      </label>
      <datalist id="spec-sheet-known-screens">
        {screens.map((s) => (
          <option key={s.id} value={s.id} />
        ))}
      </datalist>
      <label>
        Screen name
        <input
          value={screenName}
          onChange={(e) => onChangeScreenName(e.target.value)}
          placeholder={screenId || "screen name"}
        />
      </label>
      {known ? (
        <p className="known-screen">
          {resolveLocalized(known.name, locale) || known.id} — {known.specIds?.length ?? 0} linked
          specs
        </p>
      ) : (
        <p className="known-screen muted">
          Not found on the sidecar — this shot will export locally.
        </p>
      )}
    </div>
  );
}
