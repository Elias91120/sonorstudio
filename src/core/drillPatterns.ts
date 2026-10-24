/**
 * PAV's two UK drill patterns (148 BPM, two bars each) on the GASSED kit, transcribed from his .flp.
 * Plain data: the studio's demo and the landing page both read it.
 */

/** The kit's samples the patterns use, in the channel order of PAV's .flp, with its levels and mixer routing. */
export const DRILL_KIT: [name: string, volume: number, insert: number][] = [
  ['PG GASSED Kick - Axel', 9300, 1],
  ['PG GASSED Kick - Chemist', 8200, 2],
  ['PG GASSED Countersnare - Tempest', 10000, 3],
  ['PG GASSED Countersnare - Stormz', 10000, 3],
  ['PG GASSED Hihat - Blazed', 10000, 0],
  ['PG GASSED 808 - Omen - C', 10000, 4],
  ['PG GASSED Hihat - Monolith', 10000, 0],
];
const [KICK, KICK2, CSNARE, CSNARE2, HAT, BASS, HAT2] = DRILL_KIT.map((_, i) => i);
export { BASS };

/** [step, channel] hits and [step, key, steps] 808 notes, two bars each, as PAV wrote them. */
export const DRILL_PATTERNS: { name: string; hits: [number, number[]][]; bass: [number, number, number][] }[] = [
  {
    name: 'Drill A',
    hits: [
      [0, [HAT2, HAT, KICK, KICK2]],
      [3, [HAT2, HAT]],
      [6, [HAT]],
      [8, [CSNARE, CSNARE2, HAT]],
      [11, [HAT]],
      [14, [HAT]],
      [16, [HAT2, HAT]],
      [19, [HAT2, HAT]],
      [20, [KICK2, KICK]],
      [22, [HAT]],
      [24, [HAT]],
      [26, [KICK2, KICK]],
      [27, [HAT]],
      [28, [CSNARE, CSNARE2]],
      [30, [KICK, KICK2, HAT]],
    ],
    bass: [
      [0, 65, 2],
      [20, 66, 2],
      [26, 70, 2],
      [30, 67, 2],
    ],
  },
  {
    name: 'Drill B',
    hits: [
      [0, [HAT2, KICK, KICK2]],
      [3, [HAT2]],
      [6, [HAT2]],
      [8, [HAT2, CSNARE2, CSNARE]],
      [11, [HAT2]],
      [14, [HAT2]],
      [16, [HAT2]],
      [19, [HAT2]],
      [22, [HAT2]],
      [23, [KICK, KICK2]],
      [24, [HAT2, KICK, KICK2]],
      [27, [HAT2]],
      [28, [CSNARE2, CSNARE, KICK2, KICK]],
      [30, [HAT2]],
    ],
    bass: [
      [0, 64, 4],
      [24, 67, 3],
      [26, 76, 1],
      [28, 69, 3],
      [30, 76, 1],
    ],
  },
];
