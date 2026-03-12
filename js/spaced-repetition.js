/**
 * SM-2 variant spaced repetition algorithm.
 * Updates ease factor and interval based on correctness.
 */
export function updateSR(word, correct) {
  let { easeFactor = 2.5, interval = 1 } = word;

  if (correct) {
    interval = interval < 1 ? 1 : Math.round(interval * easeFactor);
    easeFactor = Math.min(3.5, Math.max(1.3, easeFactor + 0.1));
  } else {
    interval = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.3);
  }

  const nextDue = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { easeFactor, interval, nextDue };
}

/**
 * Sort words by due date (soonest first).
 * Returns a sorted copy.
 */
export function smartSort(words) {
  return [...words].sort((a, b) => (a.nextDue || 0) - (b.nextDue || 0));
}
