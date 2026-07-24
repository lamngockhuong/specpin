import { customers, dealStages } from "../data.js";
import { styles } from "../styles.js";

// Reports: deal counts per pipeline stage, derived from the same seed data
// the Customers/Dashboard screens use. This route is declared in
// `routes-catalog.ts` (not a static <Route> tag in App.tsx) -- see that file
// for why: it is the screen `@specpin/import-flows`'s `react-router` adapter
// picks up for `.specs/screens.json`.
export function Reports() {
  const allDeals = customers.flatMap((c) => c.deals);
  const countByStage = new Map(dealStages.map((stage) => [stage, 0]));
  for (const deal of allDeals) {
    countByStage.set(deal.stage, (countByStage.get(deal.stage) ?? 0) + 1);
  }

  return (
    <>
      <h1 style={styles.h1}>Reports</h1>
      <p style={styles.lead}>Deal counts by pipeline stage.</p>
      <div style={styles.statGrid}>
        {dealStages.map((stage) => (
          <div
            key={stage}
            style={styles.stat}
            data-spec-id={`reports-stage-${stage.toLowerCase()}`}
          >
            <div style={styles.statLabel}>{stage}</div>
            <div style={styles.statValue}>{countByStage.get(stage) ?? 0}</div>
          </div>
        ))}
      </div>
    </>
  );
}
