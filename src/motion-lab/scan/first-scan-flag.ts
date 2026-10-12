// The Phase 12 first cut, kept for the lab's "Current" variant: choosing the first folder marks it,
// and the track list that mounts after the scan fades its first screenful in once and clears it.
let pending = false;

export function markFirstScan() {
  pending = true;
}

export function isFirstScanPending() {
  return pending;
}

export function clearFirstScan() {
  pending = false;
}
