import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import os from "node:os";
import path from "node:path";
import type { Hub } from "../hub.js";

/**
 * Permission policy for Claude inside the app. The app's own tools (mcp__hub__*) are allowed here because each one
 * that changes something asks Marlys first. Claude may read, but may only write files in the app's working folder
 * or the temp folder, and can't run commands that delete, push or post anywhere.
 */
export function makeGuard(hub: Hub): CanUseTool {
  const allow = (input: Record<string, unknown>): PermissionResult => ({ behavior: "allow", updatedInput: input });
  const deny = (message: string): PermissionResult => ({ behavior: "deny", message });

  return async (toolName, input) => {
    if (toolName.startsWith("mcp__hub__")) return allow(input);
    if (["Read", "Glob", "Grep", "TodoWrite", "WebFetch", "WebSearch", "ToolSearch"].includes(toolName)) return allow(input);
    if (toolName.startsWith("mcp__")) return deny("Only the app's own tools are available here.");

    if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit" || toolName === "NotebookEdit") {
      const file = String(input.file_path ?? input.notebook_path ?? "");
      if (!inside(file, hub.cfg.stateDir) && !inside(file, os.tmpdir())) return deny("Claude can't change files on this computer from the app. Use the app's tools instead.");
      return allow(input);
    }

    if (toolName === "Bash" || toolName === "PowerShell") {
      const cmd = String(input.command ?? "");
      if (/\b(rm\s|rmdir|Remove-Item|del\s|format\s+[a-z]:|git\s+push|curl\b|wget\b|sudo\b|mv\s|chmod\b)/i.test(cmd)) {
        return deny("That command isn't allowed from the app's Claude.");
      }
      return allow(input);
    }
    return allow(input);
  };
}

function inside(file: string, dir: string) {
  if (!file || !dir) return false;
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
