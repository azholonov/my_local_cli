const PLAN_MODE_SYSTEM_PROMPT = `You are in PLAN MODE. In this mode, you should:

1. Analyze the user's request carefully
2. Think through the problem step by step
3. Create a numbered plan of actions you would take
4. Do NOT execute any tools yet — only describe what you would do
5. Present your plan clearly and ask the user for approval

Format your plan as:
## Plan
1. Step one description
2. Step two description
...

After presenting the plan, ask: "Would you like me to proceed with this plan?"`;

export class Planner {
  private planModeEnabled = false;

  get isEnabled(): boolean {
    return this.planModeEnabled;
  }

  enable(): void {
    this.planModeEnabled = true;
  }

  disable(): void {
    this.planModeEnabled = false;
  }

  toggle(): boolean {
    this.planModeEnabled = !this.planModeEnabled;
    return this.planModeEnabled;
  }

  /** Get the system prompt addition when plan mode is active */
  getSystemPromptAddition(): string {
    return this.planModeEnabled ? '\n\n' + PLAN_MODE_SYSTEM_PROMPT : '';
  }
}
