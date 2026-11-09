import { describe, expect, it } from "vitest";
import { saveWorkout, todaysWorkout } from "../src/workflows/workout.js";
import { planPrompt } from "../src/workflows/handoff.js";
import { testHub } from "./helpers.js";

describe("today's workout from Bevel", () => {
  it("saves it for today, reads the length from the text, and starts fresh tomorrow", () => {
    const { hub } = testHub();
    const now = new Date("2026-11-10T15:00:00Z");
    expect(saveWorkout(hub, "  Zone 2 walk,   40 min ", undefined, now)).toMatchObject({ text: "Zone 2 walk, 40 min", minutes: 40 });
    expect(todaysWorkout(hub, now)?.text).toBe("Zone 2 walk, 40 min");
    expect(saveWorkout(hub, "Strength 1 hr", undefined, now)?.minutes).toBe(60);
    expect(todaysWorkout(hub, new Date("2026-11-11T15:00:00Z"))).toBeNull();
    saveWorkout(hub, "", undefined, now);
    expect(todaysWorkout(hub, now)).toBeNull();
  });

  it("goes into Plan my day", async () => {
    const { hub } = testHub();
    saveWorkout(hub, "Pilates, 45 min");
    expect(await planPrompt(hub)).toContain("Today's workout (planned in Bevel): Pilates, 45 min (about 45 min)");
  });
});
