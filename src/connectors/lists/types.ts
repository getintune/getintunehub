/**
 * Marlys's lists: one per program (therapy clients, coaching clients, workshop sign-ups, ...). Each person on a list
 * has a stage, contact details, notes and an optional next step. Stored locally on her Mac (see local.ts); a
 * booking or payment app can fill them later through its own connector.
 */

export interface Field {
  key: string;
  label: string;
  /** Pick-one choices; free text when absent. */
  options?: string[];
}

export interface Program {
  id: string;
  /** The list's name, e.g. "Coaching clients". */
  name: string;
  /** What one person on it is called, e.g. "client", "sign-up". */
  word: string;
  /** Stages in order. */
  stages: string[];
  /** Stages that mean "finished" (not counted as open, no reminders). */
  done: string[];
  /** Extra fields shown for this list. */
  fields: Field[];
  /**
   * Therapy clients (HIPAA): only initials are kept, no email or phone, and Claude never sees notes. The name
   * field holds initials.
   */
  initialsOnly?: boolean;
  /** A short hint shown on the list. */
  hint?: string;
}

export interface Note {
  at: string;
  text: string;
}

export interface Entry {
  id: string;
  program: string;
  /** Full name, or initials on an initials-only list. */
  name: string;
  email: string;
  phone: string;
  stage: string;
  /** When it moved to this stage (ISO). */
  stageSince: string;
  /** The next thing to do, and when (YYYY-MM-DD). */
  nextStep: string;
  nextDate: string;
  /** Extra fields by key (see Program.fields). */
  extra: Record<string, string>;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
}

export type NewEntry = Partial<Omit<Entry, "id" | "program" | "createdAt" | "updatedAt" | "notes">> & { name: string };
export type EntryPatch = Partial<Omit<Entry, "id" | "program" | "createdAt" | "updatedAt" | "notes">>;

export interface ListsClient {
  kind: "local" | "mock";
  programs(): Program[];
  program(id: string): Program;
  /** Everyone, or everyone on one list, newest first. */
  list(program?: string): Entry[];
  get(id: string): Entry;
  /** Case-insensitive search over name, email, phone, notes and extra fields. */
  find(query: string, program?: string): Entry[];
  add(program: string, data: NewEntry): Entry;
  update(id: string, patch: EntryPatch): Entry;
  addNote(id: string, text: string): Entry;
  remove(id: string): void;
}

/** The six lists Marlys asked for (2026-11-08). Changing stages here changes them in the app. */
export const PROGRAMS: Program[] = [
  {
    id: "therapy",
    name: "Therapy clients",
    word: "client",
    stages: ["New client", "Active", "Paused", "Discharged"],
    done: ["Discharged"],
    fields: [{ key: "sessionTime", label: "Usual session time" }],
    initialsOnly: true,
    hint: "Grow Therapy clients. Initials only, and no clinical details: those stay in Grow.",
  },
  {
    id: "coaching",
    name: "Coaching clients",
    word: "client",
    stages: ["Inquiry", "Free consult booked", "Consult done", "Enrolled", "Completed", "Not a fit"],
    done: ["Completed", "Not a fit"],
    fields: [
      { key: "location", label: "Where they live" },
      { key: "source", label: "Heard about us from", options: ["Workshop", "Website", "Instagram", "Referral", "Other"] },
      { key: "startDate", label: "Program start" },
    ],
    hint: "Embodied Transition Coaching (3 months, worldwide).",
  },
  {
    id: "workshop",
    name: "Workshop sign-ups",
    word: "sign-up",
    stages: ["Signed up", "Attended", "Didn't come", "Followed up", "Consult booked"],
    done: ["Consult booked"],
    fields: [
      { key: "event", label: "Workshop" },
      { key: "source", label: "Signed up through", options: ["Website (Wix)", "Eventbrite", "Freaking Nomads", "Instagram", "Other"] },
      { key: "paid", label: "Paid", options: ["Yes", "No", "Free"] },
      { key: "location", label: "Where they live" },
    ],
    hint: "Kristin's Wix emails send the reminders and follow-ups.",
  },
  {
    id: "trainees",
    name: "Certification trainees",
    word: "trainee",
    stages: ["Interested", "Registered", "In training", "Certified", "Withdrew"],
    done: ["Certified", "Withdrew"],
    fields: [
      { key: "cohort", label: "Cohort" },
      { key: "credential", label: "Credential (MT-BC, LMFT, ...)" },
    ],
    hint: "Using Music in Mental Health Recovery: Training & Certification.",
  },
  {
    id: "supervision",
    name: "Supervision members",
    word: "member",
    stages: ["Active", "Paused", "Cancelled"],
    done: ["Cancelled"],
    fields: [{ key: "since", label: "Member since" }],
    hint: "Group Supervision, $30/month through Wix.",
  },
  {
    id: "facilities",
    name: "Treatment facilities",
    word: "facility",
    stages: ["Lead", "In conversation", "Proposal sent", "Contracted", "Past client", "Not now"],
    done: ["Past client", "Not now"],
    fields: [
      { key: "contact", label: "Contact person" },
      { key: "city", label: "City" },
      { key: "therapist", label: "Our therapist there" },
    ],
    hint: "Treatment centers: groups, consultation and training.",
  },
];

/** Initials from a name ("Jane Q. Doe" -> "J.Q.D."); already-initials stay as they are. */
export function toInitials(name: string): string {
  const s = name.trim();
  if (/^([A-Za-z]\.?\s*){1,4}$/.test(s)) return s.replace(/[^A-Za-z]/g, "").toUpperCase().split("").join(".") + ".";
  return s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 4).join(".") + ".";
}
