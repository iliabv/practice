/**
 * SM-2 variant spaced repetition algorithm.
 * Updates ease factor and interval based on correctness.
 */
export function updateSR(word, correct) {
  let { easeFactor = 2.5, interval = 1 } = word;

  if (correct) {
    interval = interval <= 1 ? 6 : Math.round(interval * easeFactor);
    easeFactor = Math.max(1.3, easeFactor + 0.1);
  } else {
    interval = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.3);
  }

  const nextDue = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { easeFactor, interval, nextDue };
}

/**
 * Sort words by urgency: overdue first, then by error rate and ease factor.
 * Returns a sorted copy.
 */
export function smartSort(words) {
  const now = Date.now();
  return [...words].sort((a, b) => {
    const scoreA = priorityScore(a, now);
    const scoreB = priorityScore(b, now);
    return scoreB - scoreA; // higher score = more urgent
  });
}

function priorityScore(word, now) {
  const overdue = Math.max(0, now - (word.nextDue || 0));
  const overdueDays = overdue / (24 * 60 * 60 * 1000);

  const practices = word.practices || [];
  const total = practices.length || 1;
  const errors = practices.filter(p => !p.correct).length;
  const errorRate = errors / total;

  const ease = word.easeFactor || 2.5;

  // Combine: overdue-ness dominates, error rate and low ease boost priority
  return overdueDays * 10 + errorRate * 5 + (2.5 - ease) * 2;
}
