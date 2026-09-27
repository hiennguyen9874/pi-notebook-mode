export type Mode = "off" | "code" | "notebook";
export const MODE_TOOLS = ["exec", "wait", "notebook"] as const;
const DEFAULT_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls", "powershell"]);

/** Reconcile only tools owned by this extension. Preserve other extensions' changes. */
export class ModeSwitch {
  private previous: string[] | undefined;
  private applied: string[] = [];
  private currentMode: Mode = "off";

  get mode(): Mode { return this.currentMode; }
  update(mode: Mode, current: string[]): string[] {
    const owned = new Set<string>(MODE_TOOLS);
    if (this.currentMode !== "off" && this.previous) {
      const applied = new Set(this.applied);
      const live = new Set(current);
      this.previous = this.previous.filter(name => !applied.has(name) || live.has(name));
      for (const name of current) {
        if (!applied.has(name) && !owned.has(name) && !this.previous.includes(name)) this.previous.push(name);
      }
    }
    if (mode === "off") {
      this.currentMode = mode;
      const restored = [...new Set([...(this.previous ?? current).filter(name => !owned.has(name)), ...current.filter(name => !owned.has(name) && !DEFAULT_TOOLS.has(name))])];
      this.previous = undefined;
      this.applied = [];
      return restored;
    }
    if (this.currentMode === "off") this.previous = current.filter(name => !owned.has(name));
    this.currentMode = mode;
    const selected = mode === "notebook" ? [...MODE_TOOLS] : [...MODE_TOOLS.slice(0, 2)];
    const extras = current.filter(name => !owned.has(name) && !DEFAULT_TOOLS.has(name));
    this.applied = [...new Set([...selected, ...extras])];
    return this.applied;
  }
}
