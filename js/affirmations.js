/**
 * affirmations.js — what the buddy holds up.
 *
 * The register is petty, absurd and supportive in a chaotic way. Not gym-shouty,
 * not a wellness app asking anyone to honour their journey.
 *
 * Two banks that never mix. The adult one is funny; the kid one is sweet. And
 * one hard rule across both: the joke is never about how anyone looks. It is
 * about effort, the floor, the couch, and the buddy's own opinions.
 */

const ADULT = {
  /** Nothing in particular going on. */
  normal: [
    'you’re doing great. shut up. you are.',
    'nobody has ever been this committed to lying down productively.',
    'the floor and i have discussed it. we’re pleased with you.',
    'still hotter than the couch. the couch is furniture. you’re a whole person.',
    'no notes. well. two notes. neither of them today’s problem.',
    'your only real competition stayed in bed, and she’s losing.',
    'gremlin behaviour, but the supportive kind.',
    'unserious person, serious glutes. we contain multitudes.',
    'i have no legs and even i’m impressed.',
    'chaos, but make it core work.',
    'you woke up and chose mild inconvenience. iconic.',
    'this is your sign. i am the sign. hello.',
    'doing something is 400% more than nothing. i did the maths.',
    'the audacity to keep showing up. genuinely respect it.',
    'be the menace you wish to see in the world. gently. on your back.',
  ],
  /** A streak is running. */
  streak: [
    'that’s {n} days. i’m telling everyone.',
    '{n} days. the couch has filed a complaint.',
    '{n} in a row and you think you’re normal. you’re not. keep going.',
    '{n} days deep. absolutely unhinged. proud of you.',
    'day {n}. i’ve started bragging about you unprompted.',
  ],
  /** Back after a few days off. */
  returning: [
    'oh NOW she appears.',
    'we’re not going to talk about it. get down here.',
    'i wasn’t worried. i was counting. those are different.',
    'the floor has been asking after you.',
    'welcome back, absolute stranger. i’ve kept your spot warm.',
    'no lecture. mild squinting only.',
  ],
  /** Back after a long time. */
  ages: [
    'i have aged. you have not visited. i’m fine.',
    'you disappeared like a plot thread nobody resolved.',
    'i built a whole personality around waiting for you.',
    'incredible. no notes. actually one note, but i’ve let it go.',
  ],
  /** It's late at night. */
  late: [
    'it is very late and i admire your commitment to poor decisions.',
    'nocturnal core work. unhinged. correct.',
    'we’re doing this now? okay. we’re doing this now.',
  ],
  /** Brand new. */
  new: [
    'oh hello. i’m yours now. this is happening.',
    'hi. i’m made of bubbles and enthusiasm.',
    'new person! i’m going to be so annoying about your progress.',
  ],
  /** Bailed out of something. */
  quit: [
    'we stopped. that’s allowed. that was always allowed.',
    'partial credit is still credit. i don’t make the rules. i do, actually.',
    'you did some. some beats none. that’s just arithmetic.',
  ],
};

const KID = {
  normal: [
    'you’re my favourite!',
    'let’s pop some bubbles!',
    'i was hoping you’d come back!',
    'you’re so good at this!',
    'ready? i’m ready. i’m so ready.',
    'wiggle wiggle!',
  ],
  streak: [
    '{n} days! wow!',
    'that’s {n} whole days!',
    '{n} days in a row! amazing!',
  ],
  returning: [
    'i missed you!',
    'you’re back! hooray!',
    'i saved you a bubble!',
  ],
  ages: [
    'where were you? i missed you lots!',
    'you’re back! I did a little dance.',
  ],
  late: [
    'it’s sleepy time soon!',
    'one more game then bed?',
  ],
  new: [
    'hi! i’m your bubble friend!',
    'hello! want to play?',
  ],
  quit: [
    'that’s okay! we can play later.',
    'good trying!',
  ],
};

/**
 * @param {object} opts
 * @param {boolean} opts.kid
 * @param {string}  opts.gap      from greeting(): new | ages | a while | late | recent | normal
 * @param {number}  opts.streak
 * @returns {string}
 */
export function pickAffirmation({ kid = false, gap = 'normal', streak = 0 } = {}) {
  const bank = kid ? KID : ADULT;

  let pool;
  if (gap === 'new') pool = bank.new;
  else if (gap === 'ages') pool = bank.ages;
  else if (gap === 'a while') pool = bank.returning;
  else if (gap === 'late') pool = bank.late;
  else if (streak >= 3) pool = bank.streak;
  else pool = bank.normal;

  if (!pool || !pool.length) pool = bank.normal;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replace('{n}', String(streak));
}

/** Used when someone abandons a session, so it lands kindly. */
export function quitLine(kid = false) {
  const pool = (kid ? KID : ADULT).quit;
  return pool[Math.floor(Math.random() * pool.length)];
}
