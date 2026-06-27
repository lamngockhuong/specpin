// Mock CRM data for the demo screens. Static seed values only (the demo has no
// backend); shapes are intentionally small.

export interface Deal {
  id: string;
  name: string;
  amount: number;
  stage: "Lead" | "Proposal" | "Negotiation" | "Won" | "Lost";
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  deals: Deal[];
  notes: string;
}

export const customers: Customer[] = [
  {
    id: "globex",
    name: "Hana Tran",
    email: "hana@globex.example",
    company: "Globex",
    notes: "Renewal due Q3. Prefers email over calls.",
    deals: [
      { id: "d-1", name: "Globex platform license", amount: 48000, stage: "Negotiation" },
      { id: "d-2", name: "Onboarding services", amount: 12000, stage: "Won" },
    ],
  },
  {
    id: "initech",
    name: "Minh Le",
    email: "minh@initech.example",
    company: "Initech",
    notes: "Champion left; rebuilding relationship.",
    deals: [{ id: "d-3", name: "Initech pilot", amount: 9000, stage: "Proposal" }],
  },
  {
    id: "umbrella",
    name: "Sofia Pham",
    email: "sofia@umbrella.example",
    company: "Umbrella",
    notes: "Expansion opportunity in EU region.",
    deals: [
      { id: "d-4", name: "Umbrella enterprise", amount: 120000, stage: "Lead" },
      { id: "d-5", name: "Add-on seats", amount: 15000, stage: "Negotiation" },
    ],
  },
];

export function findCustomer(id: string | undefined): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export const dealStages: Deal["stage"][] = ["Lead", "Proposal", "Negotiation", "Won", "Lost"];

export const owners = ["Hana Tran", "Minh Le", "Sofia Pham", "You"];

const allDeals: Deal[] = customers.flatMap((c) => c.deals);

// Dashboard figures derived from the seed so the stat cards stay consistent with
// what the Customers screens show.
export const wonRevenue = allDeals
  .filter((d) => d.stage === "Won")
  .reduce((sum, d) => sum + d.amount, 0);

export const openDealCount = allDeals.filter((d) => d.stage !== "Won" && d.stage !== "Lost").length;

export const recentActivity = [
  "Globex moved to Negotiation",
  "New note added on Initech",
  "Umbrella enterprise deal created",
  "Onboarding services marked Won",
];
