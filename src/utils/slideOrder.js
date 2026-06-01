// Canonical left-to-right order of slide tabs. Used to derive
// the direction prop for SlideTransition so navigating forward
// (rightward in the nav) slides content in from the right and
// backward slides from the left — a subliminal spatial cue.
//
// Includes every slide id from both desktop TacticalNav and
// mobile MobileNav. Slides absent on one platform just don't get
// rendered there — the order is shared.
export const SLIDE_ORDER = [
  'overview',
  'ledger',
  'bank',
  'auspex',
  'liquidity',
  'obligations',
  'holo',
];

export function slideIndex(id) {
  const i = SLIDE_ORDER.indexOf(id);
  return i === -1 ? 0 : i;
}

export function directionBetween(prevId, nextId) {
  if (prevId === nextId) return 'forward';
  return slideIndex(nextId) >= slideIndex(prevId) ? 'forward' : 'backward';
}
