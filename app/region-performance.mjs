export const regionPerformanceBands = [
  { minimumRatio: 0.9, band: "leader", label: "Leader", symbol: "✓" },
  { minimumRatio: 0.75, band: "strong", label: "Strong", symbol: "●" },
  { minimumRatio: 0.5, band: "watch", label: "Watch", symbol: "▲" },
  { minimumRatio: 0, band: "attention", label: "Attention", symbol: "!" },
];

export function getRegionPerformanceBand(value, leadingValue) {
  const ratio = leadingValue > 0 ? value / leadingValue : 0;
  return regionPerformanceBands.find(({ minimumRatio }) => ratio >= minimumRatio)
    ?? regionPerformanceBands[regionPerformanceBands.length - 1];
}
