import path from "node:path";
import type { Config } from "../../core/config.js";
import { LocalLists, MockLists } from "./local.js";
import type { ListsClient } from "./types.js";

export * from "./types.js";
export { LocalLists, MockLists } from "./local.js";

/** Her real lists live in her data folder; in mock mode, made-up practice lists. */
export function makeLists(cfg: Config): ListsClient {
  return cfg.mode === "mock" ? new MockLists(cfg.stateDir, path.join(cfg.hubRoot, "fixtures", "lists.json")) : new LocalLists(cfg.dataDir);
}
