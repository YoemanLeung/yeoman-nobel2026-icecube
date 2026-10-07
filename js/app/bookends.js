// The film's bookends. Film version: a title card on which Yeoman says the intro, then the tour starts by
// itself; after the tour, the end card and Yeoman's outro. Website: the outro after the tour (the intro stays a
// silent greeting on the start screen, because a page may not play sound before the viewer clicks).
// Driven by the page clock, so a live preview and a frame-by-frame export run the same sequence.

// (exported for the score generator, web/_tools/bgm.mjs, which lays the music out on the same film timeline)
export const BOOKENDS = Object.freeze({
  introAt: 0.7, // s after the title card appears
  tourGap: 0.6, // s between the end of the intro and the start of the tour
  outroAt: 0.9, // s after the end card appears
  endHold: 1.6, // s the end card stays after the outro
});
const { introAt: INTRO_AT, tourGap: TOUR_GAP, outroAt: OUTRO_AT, endHold: END_HOLD } = BOOKENDS;

export function createBookends({ startTour, duration }) {
  let phase = 'idle'; // idle -> intro -> tour -> outro -> done
  let t0 = 0;

  return {
    get phase() {
      return phase;
    },
    /** Page-clock time at which the title card (intro) or the end card (outro, done) appeared. */
    get since() {
      return t0;
    },
    /** Film: the title card is up and the intro begins (after a click in a preview, at once in an export). */
    begin(clock) {
      if (phase !== 'idle') return;
      phase = 'intro';
      t0 = clock;
      document.documentElement.classList.add('film-running');
    },
    /** The tour is (re)starting, or the viewer jumped back into it: no bookend is speaking. */
    toTour() {
      phase = 'tour';
    },
    /** The tour reached its end: the end card and the outro. */
    ended(clock) {
      if (phase === 'outro' || phase === 'done') return;
      phase = 'outro';
      t0 = clock;
    },
    /** Called every frame: {key, age} of the bookend line being said (age may be negative), or null. */
    tick(clock) {
      if (phase === 'intro') {
        const age = clock - t0 - INTRO_AT;
        if (age > (duration('intro') || 4) + TOUR_GAP) {
          phase = 'tour';
          startTour();
          return null;
        }
        return { key: 'intro', age };
      }
      if (phase === 'outro') {
        const age = clock - t0 - OUTRO_AT;
        if (age > (duration('outro') || 4) + END_HOLD) phase = 'done';
        return { key: 'outro', age };
      }
      return null;
    },
  };
}
