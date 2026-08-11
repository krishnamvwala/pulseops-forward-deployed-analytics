import assert from "node:assert/strict";
import test from "node:test";

import { getAgentEvidenceLabel, restoreAgentLauncherFocus } from "../app/agent-ui.mjs";

test("labels Foundry and deterministic evidence accurately", () => {
  assert.equal(getAgentEvidenceLabel("foundry"), "Foundry · trusted data only");
  assert.equal(getAgentEvidenceLabel("deterministic"), "Deterministic agent · trusted data only");
  assert.equal(getAgentEvidenceLabel(null), "Agent · trusted data only");
});

test("restores focus to the AI launcher after the close transition", () => {
  let scheduledCallback;
  let focusCalls = 0;
  const launcher = { focus: () => { focusCalls += 1; } };

  restoreAgentLauncherFocus(launcher, (callback) => {
    scheduledCallback = callback;
  });

  assert.equal(focusCalls, 0);
  assert.equal(typeof scheduledCallback, "function");
  scheduledCallback();
  assert.equal(focusCalls, 1);
});

test("does not schedule focus when the launcher is unavailable", () => {
  let scheduleCalls = 0;

  restoreAgentLauncherFocus(null, () => {
    scheduleCalls += 1;
  });

  assert.equal(scheduleCalls, 0);
});
