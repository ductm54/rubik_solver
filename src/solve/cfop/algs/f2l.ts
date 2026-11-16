/**
 * The 41 F2L cases with the most-voted algorithms from SpeedCubeDB (speedcubedb.com/a/3x3/F2L),
 * for the front-right and the front-left slot, most votes first. The solver uses the first one
 * that keeps the cross and the other slots (all of them do; the rest are fallbacks).
 * `setup` makes the case at front-right from a solved cube.
 */
export interface F2LCase {
  id: string;
  group: string;
  setup: string;
  FR: string[];
  FL: string[];
}

export const F2L_CASES: F2LCase[] = [
  { id: "1", group: "Free Pairs", setup: "F R' F' R", FR: ["U R U' R'", "R' F R F'", "y' r' U' R U M'"], FL: ["F' r U r'", "d R U' R'", "F' L F L'"] },
  { id: "2", group: "Free Pairs", setup: "R' F R F'", FR: ["F R' F' R", "y' U' R' U R", "U' F' U F"], FL: ["U' L' U L", "L F' L' F", "r U' r' F"] },
  { id: "3", group: "Free Pairs", setup: "F' U F", FR: ["F' U' F", "y' R' U' R", "y L' U' L"], FL: ["L' U' L", "U2 R' F R U R' F' R", "y' S U R U' R' S'"] },
  { id: "4", group: "Free Pairs", setup: "R U' R'", FR: ["R U R'", "y' f R f'", "y F U F'"], FL: ["F U F'", "y L U L'", "S' L F' L' f"] },
  { id: "5", group: "Disconnected Pairs", setup: "R U R' U2' R U' R' U", FR: ["U' R U R' U2 R U' R'", "F2 L' U' L U F2", "U' R U R' U' R U2 R'"], FL: ["U R' F r U' r' F' R", "U2 F R U R' U2 F'", "U l' U L U' L' U' l"] },
  { id: "6", group: "Disconnected Pairs", setup: "F' U' F U2' F' U F U'", FR: ["U' r U' R' U R U r'", "y' U R' U' R U2 R' U R", "d R' U' R U2 R' U R"], FL: ["U L' U' L U2 L' U L", "F2 R U R' U' F2", "R' F2 R U R' U' F2 U R"] },
  { id: "7", group: "Disconnected Pairs", setup: "R U R' U2' R U2' R' U", FR: ["U' R U2 R' U' R U2 R'", "M' U' M U2 r U' r'", "U' R U2 R' U2 R U' R'"], FL: ["F U R U2 R' U F'", "d' L U2 L' U2 L U' L'", "U' F U2 R U' R' U F'"] },
  { id: "8", group: "Disconnected Pairs", setup: "r' U' R2 U' R2' U2' r", FR: ["r' U2 R2 U R2 U r", "d R' U2 R U R' U2 R", "y' U R' U2 R U2 R' U R"], FL: ["U L' U2 L U L' U2 L", "U r' F2 r U2 r' F r", "U' R' U2 R U R' U R U2 L' U L"] },
  { id: "9", group: "Disconnected Pairs", setup: "F' U F U' R U R' U", FR: ["U' R U' R' U F' U' F", "F R U R' U' F' R U' R'", "U' R U' R' d R' U' R"], FL: ["U L' U' L U' L' U' L", "F2 U R U' R' F2", "U' F U' F' U L' U' L"] },
  { id: "10", group: "Disconnected Pairs", setup: "R U' R' U' R U' R' U", FR: ["U' R U R' U R U R'", "U2 R U' R' U' R U R'", "d R' U R d' R U R'"], FL: ["U L' U L U' F U F'", "F U' R U R' U2 F'", "d' L U L' U L U L'"] },
  { id: "11", group: "Connected Pairs", setup: "F' U F U' R U2' R' U", FR: ["U' R U2 R' U F' U' F", "y' R U2 R2 U' R2 U' R'", "U' R U2 R' d R' U' R"], FL: ["L' U L U' L' U L U2 L' U L", "L U2 L2 U' L2 U' L'", "F U R U' R' U R U' R' U F'"] },
  { id: "12", group: "Connected Pairs", setup: "R U R' U2' R U R' U' R U R'", FR: ["R U' R' U R U' R' U2 R U' R'", "R' U2 R2 U R2 U R", "U F' U2 F U' R U R'"], FL: ["U L' U2 L U' F U F'", "U L' U2 L d' L U L'", "L' U2 L U l' U l U2 l' U' l"] },
  { id: "13", group: "Connected Pairs", setup: "r U2' R' U R U' R' U M", FR: ["y' U R' U R U' R' U' R", "M' U' R U R' U2 R U' r'", "R U' R' U R' F R F' R U' R'"], FL: ["U L' U L U' L' U' L", "y' R U' R' U2 R U' R' U F' U F", "U L' U L U' L' U L U L' U L"] },
  { id: "14", group: "Connected Pairs", setup: "R U' R' U' R U R' U", FR: ["U' R U' R' U R U R'", "R U2 R' U2 R U R' U2 R U' R'", "U' R2 D R' U R D' R2"], FL: ["d' L U' L' U L U L'", "y U' L U' L' U L U L'", "y' U' R U' R' U R U R'"] },
  { id: "15", group: "Connected Pairs", setup: "R U R' U' R U R' U2' R U' R'", FR: ["M U r U' r' U' M'", "R U R' U2 R U' R' U R U' R'", "R' D' R U' R' D R U R U' R'"], FL: ["F U2 R U R' U F'", "L' U L U2 F U F'", "L' U L U2 y L U L'"] },
  { id: "16", group: "Connected Pairs", setup: "F' U F U2' R U R'", FR: ["R U' R' U2 F' U' F", "R U' R' U2 y' R' U' R", "U M' U R U' r' U' R U R'"], FL: ["F U' R U' R' U2 F'", "L' U' L U2 L' U L U' L' U L", "L' U2 L U' L' U' L U' L' U L"] },
  { id: "17", group: "Connected Pairs", setup: "R U' R' U R U2' R'", FR: ["R U2 R' U' R U R'", "y2 L U2 L' U' L U L'", "R U R' U' R U2 R' U2 R U R'"], FL: ["L F' L' F L' U L U' L' U L", "y L U2 L' U' L U L'", "L' U2 L U2 l' U L U' L' U' l"] },
  { id: "18", group: "Connected Pairs", setup: "R U R' U' R U R' F R' F' R", FR: ["y' R' U2 R U R' U' R", "y L' U2 L U L' U' L", "F' U2 F U F' U' F"], FL: ["L' U2 L U L' U' L"] },
  { id: "19", group: "Disconnected Pairs", setup: "R U R' U' R U2' R' U'", FR: ["U R U2 R' U R U' R'", "U R U2 R2 F R F'", "d f R2 f' U f R' f'"], FL: ["U L' U L2 F' L' F L' U L", "d R U2 R' U R U' R'", "y' U R U2 R' U R U' R'"] },
  { id: "20", group: "Disconnected Pairs", setup: "R U R' F R' F' R2' U R' U", FR: ["y' U' R' U2 R U' R' U R", "U' R U' R2 F R F' R U' R'", "y U' L' U2 L U' L' U L"], FL: ["U' L' U2 L U' L' U L", "L' U L U' L' U L U' L' U' L", "U' L' U2 L2 F' L' F"] },
  { id: "21", group: "Disconnected Pairs", setup: "R U' R' U2' R U R'", FR: ["U2 R U R' U R U' R'", "R U' R' U2 R U R'", "R B U2 B' R'"], FL: ["F R U2 R' F'", "l' U l U2 l' U' l", "y U2 L U L' U L U' L'"] },
  { id: "22", group: "Disconnected Pairs", setup: "F' L' U2' L F", FR: ["r U' r' U2 r U r'", "F' L' U2 L F", "y' U2 R' U' R U' R' U R"], FL: ["L' U L U2 L' U' L", "U2 L' U' L U' L' U L", "r' U' F2 U r"] },
  { id: "23", group: "Connected Pairs", setup: "R U' R' U R U' R' U2' R U' R'", FR: ["U R U' R' U' R U' R' U R U' R'", "R U R' U2 R U R' U' R U R'", "U2 R2 U2 R' U' R U' R2"], FL: ["F' U' L' U L F L' U L", "U L' U' L2 F' L' F L' U L", "F U' R U R' U R U2 R' F'"] },
  { id: "24", group: "Connected Pairs", setup: "R U R' F R U R' U' F'", FR: ["F U R U' R' F' R U' R'", "U' R U R2 F R F' R U' R'", "y' R' U' R U2 R' U' R U R' U' R"], FL: ["U' L' U L U L' U L U' L' U L", "U' F' r U r' U' L' U' L", "L' U L U L' U' L U2 L' U' L"] },
  { id: "25", group: "Corner In Slot", setup: "F' R U R' U' R' F R", FR: ["U' R' F R F' R U R'", "R' F' R U R U' R' F", "U' F' U F U R U' R'"], FL: ["U' L' U L F' r U r'", "U' L' U L d R U' R'", "U' L' U L F' L F L'"] },
  { id: "26", group: "Corner In Slot", setup: "F' U' F U R U R' U'", FR: ["U R U' R' F R' F' R", "R S' R' U R S R'", "U R U R' U' y L' U' L"], FL: ["r U r' U' r' F r F'", "U L F' L' F L' U' L", "U F L' U' L U L F' L'"] },
  { id: "27", group: "Corner In Slot", setup: "R U R' U' R U R'", FR: ["R U' R' U R U' R'", "F' U' F U2 R U' R'", "y' f R' f' U f R' f'"], FL: ["L' U' L U F' r U r'", "L' U' L U F' L F L'", "y' R U' R' U R U' R'"] },
  { id: "28", group: "Corner In Slot", setup: "R' F R F' U R U' R'", FR: ["R U R' U' F R' F' R", "y L' U L U' L' U L", "F' U F U' F' U F"], FL: ["L' U L U' L' U L", "L' U L2 F' L' F"] },
  { id: "29", group: "Corner In Slot", setup: "F R' F' R F R' F' R", FR: ["R' F R F' U R U' R'", "y L' U' L U L' U' L", "y' R' U' R U R' U' R"], FL: ["L' U' L U L' U' L", "U L' U2 L U2 L' U' L", "U F' L F L2 U' L"] },
  { id: "30", group: "Corner In Slot", setup: "R U' R' U R U' R'", FR: ["R U R' U' R U R'", "U' R U2 R' U2 R U R'", "U' F R' F' R2 U R'"], FL: ["L F' L' F U' L' U L", "y' R U R' U' R U R'", "U' F U' R U2 R' F'"] },
  { id: "31", group: "Edge In Slot", setup: "R U R' F R' F' R U", FR: ["U' R' F R F' R U' R'", "R U' R' U y' R' U R", "F' U F R U2 R'"], FL: ["U L F' L' F L' U L", "L' U L U' y L U' L'", "L' U L F U2 F'"] },
  { id: "32", group: "Edge In Slot", setup: "R U' R' U R U' R' U R U' R'", FR: ["U R U' R' U R U' R' U R U' R'", "R U R' U' R U R' U' R U R'", "R2 U R2 U R2 U2 R2"], FL: ["U' L' U L U' L' U L U' L' U L", "U L' U L U' L' U2 L U L' U' L", "U2 F U' R U R' U F'"] },
  { id: "33", group: "Edge In Slot", setup: "R U R' U2' R U R' U", FR: ["U' R U' R' U2 R U' R'", "y R' D R U' R' D' R", "R U R' U' R U' R' U R U' R'"], FL: ["R' D R U' R' D' R", "U L' U2 L U' L' U' L", "U' L D L' U L D' L'"] },
  { id: "34", group: "Edge In Slot", setup: "R U' R' U2' R U' R' U'", FR: ["U R U R' U2 R U R'", "U' R U2 R' U R U R'", "U R' D' R U' R' D R"], FL: ["U L' U L U2 L' U L", "U L' U L U L' U2 L", "L' U' L U L' U L U' L' U L"] },
  { id: "35", group: "Edge In Slot", setup: "F' U F U' R U' R' U", FR: ["U' R U R' U F' U' F", "U' R U R' d R' U' R", "U2 R U R' F R' F' R"], FL: ["U2 F U F' U' L' U L", "U2 L F' L' F U2 L' U' L", "U' F R' F R F' U F'"] },
  { id: "36", group: "Edge In Slot", setup: "R U' R' U2' F R' F' R U2'", FR: ["U F' U' F U' R U R'", "U2 R' F R F' U2 R U R'", "R U R' U R U R' U' F' U' F"], FL: ["U L' U' L d' L U L'", "U L' U' L U' F U F'", "U2 L' U L U F U F'"] },
  { id: "37", group: "Pieces In Slot", setup: "R U' R U2' F R2' F' U2' R2'", FR: ["R2 U2 F R2 F' U2 R' U R'", "R' F R F' R U' R' U R U' R' U2 R U' R'", "R U2 R' U R U2 R' U F' U' F"], FL: ["L2 U2 F' L2 F U2 L U' L", "L' U2 L U' L' U2 L U' F U F'", "L' U' L U2 L' U2 L U' y' R U R'"] },
  { id: "38", group: "Pieces In Slot", setup: "R U' R' U R U2' R' U R U' R'", FR: ["R U' R' U' R U R' U2 R U' R'", "R U R' U' R U2 R' U' R U R'", "R2 U2 R' U' R U' R' U2 R'"], FL: ["L' U L U' L' U2 L U' L' U L", "F R U2 R' U' R U R' U2 F'", "L' U2 L' U' L U' L' U2 L2"] },
  { id: "39", group: "Pieces In Slot", setup: "R U' R' U' R U R' U2' R U' R'", FR: ["R U' R' U R U2 R' U R U' R'", "R U2 R U R' U R U2 R2", "R U R' U2 R U' R' U R U R'"], FL: ["L' U' L U L' U2 L U L' U' L", "F' L F L2 U2 L U L' U' L", "L' U L U L' U' L U2 L' U L"] },
  { id: "40", group: "Pieces In Slot", setup: "R U R' F U R U' R' F' R U R'", FR: ["r U' r' U2 r U r' R U R'", "F' L' U2 L F R U R'", "R U' R' F R U R' U' F' R U' R'"], FL: ["L' U L F R U2 R' F'", "L' U L l' U l U2 l' U' l", "L' U L R' F R U2 R' F' R"] },
  { id: "41", group: "Pieces In Slot", setup: "R F U R U' R' F' U' R'", FR: ["R U' R' r U' r' U2 r U r'", "R U' R' F' L' U2 L F", "R U R' U' y M U' R' F R U M'"], FL: ["l' U l U2 l' U' l L' U' L", "L' U L U L' U L U' y' R U R'", "F R U2 R' F' L' U' L"] },
];
