export function getAgentEvidenceLabel(provider) {
  if (provider === "foundry") return "Foundry · trusted data only";
  if (provider === "deterministic") return "Deterministic agent · trusted data only";
  return "Agent · trusted data only";
}

export function restoreAgentLauncherFocus(
  launcher,
  schedule = (callback) => window.requestAnimationFrame(callback),
) {
  if (!launcher) return;
  schedule(() => launcher.focus());
}
