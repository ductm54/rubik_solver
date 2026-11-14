/** OLL algorithms (yellow on top after F2L). Cases are recognised from each algorithm itself. */
export interface AlgEntry {
  id: string;
  name: string;
  alg: string;
  hint?: string;
}

/** The 57 OLL cases (speedsolving.com numbering). */
export const OLL: AlgEntry[] = [
  ['1', 'Dot', "R U2 R2 F R F' U2 R' F R F'"],
  ['2', 'Dot', "F R U R' U' F' f R U R' U' f'"],
  ['3', 'Dot', "f R U R' U' f' U' F R U R' U' F'"],
  ['4', 'Dot', "f R U R' U' f' U F R U R' U' F'"],
  ['5', 'Square', "r' U2 R U R' U r"],
  ['6', 'Square', "r U2 R' U' R U' r'"],
  ['7', 'Small lightning', "r U R' U R U2 r'"],
  ['8', 'Small lightning', "r' U' R U' R' U2 r"],
  ['9', 'Fish', "R U R' U' R' F R2 U R' U' F'"],
  ['10', 'Fish', "R U R' U R' F R F' R U2 R'"],
  ['11', 'Small lightning', "r U R' U R' F R F' R U2 r'"],
  ['12', 'Small lightning', "M' R' U' R U' R' U2 R U' M"],
  ['13', 'Knight move', "F U R U' R2 F' R U R U' R'"],
  ['14', 'Knight move', "R' F R U R' F' R F U' F'"],
  ['15', 'Knight move', "r' U' r R' U' R U r' U r"],
  ['16', 'Knight move', "r U r' R U R' U' r U' r'"],
  ['17', 'Dot', "R U R' U R' F R F' U2 R' F R F'"],
  ['18', 'Dot', "r U R' U R U2 r2 U' R U' R' U2 r"],
  ['19', 'Dot', "M U R U R' U' M' R' F R F'"],
  ['20', 'Dot', "r U R' U' M2 U R U' R' U' M'"],
  ['21', 'H', "R U2 R' U' R U R' U' R U' R'"],
  ['22', 'Pi', "R U2 R2 U' R2 U' R2 U2 R"],
  ['23', 'Headlights', "R2 D' R U2 R' D R U2 R"],
  ['24', 'Chameleon', "r U R' U' r' F R F'"],
  ['25', 'Bowtie', "F' r U R' U' r' F R"],
  ['26', 'Anti-Sune', "R U2 R' U' R U' R'"],
  ['27', 'Sune', "R U R' U R U2 R'"],
  ['28', 'Arrow', "r U R' U' M U R U' R'"],
  ['29', 'Awkward', "R U R' U' R U' R' F' U' F R U R'"],
  ['30', 'Awkward', "F R' F R2 U' R' U' R U R' F2"],
  ['31', 'P shape', "R' U' F U R U' R' F' R"],
  ['32', 'P shape', "L U F' U' L' U L F L'"],
  ['33', 'T shape', "R U R' U' R' F R F'"],
  ['34', 'C shape', "R U R2 U' R' F R U R U' F'"],
  ['35', 'Fish', "R U2 R2 F R F' R U2 R'"],
  ['36', 'W shape', "L' U' L U' L' U L U L F' L' F"],
  ['37', 'Fish', "F R' F' R U R U' R'"],
  ['38', 'W shape', "R U R' U R U' R' U' R' F R F'"],
  ['39', 'Big lightning', "L F' L' U' L U F U' L'"],
  ['40', 'Big lightning', "R' F R U R' U' F' U R"],
  ['41', 'Awkward', "R U R' U R U2 R' F R U R' U' F'"],
  ['42', 'Awkward', "R' U' R U' R' U2 R F R U R' U' F'"],
  ['43', 'P shape', "R' U' F' U F R"],
  ['44', 'P shape', "F U R U' R' F'"],
  ['45', 'T shape', "F R U R' U' F'"],
  ['46', 'C shape', "R' U' R' F R F' U R"],
  ['47', 'Small L', "R' U' R' F R F' R' F R F' U R"],
  ['48', 'Small L', "F R U R' U' R U R' U' F'"],
  ['49', 'Small L', "r U' r2 U r2 U r2 U' r"],
  ['50', 'Small L', "r' U r2 U' r2 U' r2 U r'"],
  ['51', 'Line', "F U R U' R' U R U' R' F'"],
  ['52', 'Line', "R U R' U R U' B U' B' R'"],
  ['53', 'Small L', "r' U' R U' R' U R U' R' U2 r"],
  ['54', 'Small L', "r U R' U R U' R' U R U2 r'"],
  ['55', 'Line', "R' F R U R U' R2 F' R2 U' R' U R U R'"],
  ['56', 'Line', "r' U' r U' R' U R U' R' U R r' U r"],
  ['57', 'Cross (H-dot)', "R U R' U' M' U R U' r'"],
].map(([id, name, alg]) => ({ id, name: `OLL ${id} · ${name}`, alg }));

/** 2-look OLL, step 1: orient the edges (make the cross on top). "{top}" is the top colour. */
export const EO: AlgEntry[] = [
  { id: 'line', name: 'Line', alg: "F R U R' U' F'", hint: 'A {top} line through the center.' },
  { id: 'L', name: 'L shape', alg: "f R U R' U' f'", hint: 'Two {top} edges make a small L with the center.' },
  { id: 'dot', name: 'Dot', alg: "F R U R' U' F' f R U R' U' f'", hint: 'No {top} edges on top, only the center: line algorithm, then the L algorithm.' },
];

/** 2-look OLL, step 2: orient the corners once the cross is there (OCLL). */
export const OCLL: AlgEntry[] = [
  { id: 'sune', name: 'Sune', alg: "R U R' U R U2 R'", hint: 'One {top} corner on top; the other three all twist clockwise.' },
  { id: 'antisune', name: 'Anti-Sune', alg: "R U2 R' U' R U' R'", hint: 'One {top} corner on top; the other three all twist counter-clockwise.' },
  { id: 'H', name: 'H', alg: "R U2 R' U' R U R' U' R U' R'", hint: 'No {top} corners on top; two pairs of "headlights" on opposite sides.' },
  { id: 'pi', name: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R", hint: 'No {top} corners on top; one pair of headlights, the other two {top} stickers point the same way.' },
  { id: 'headlights', name: 'Headlights', alg: "R2 D' R U2 R' D R U2 R", hint: 'Two {top} corners side by side; the other two make headlights.' },
  { id: 'T', name: 'T (Chameleon)', alg: "r U R' U' r' F R F'", hint: 'Two {top} corners side by side; the other two show {top} on opposite sides (a T).' },
  { id: 'bowtie', name: 'Bowtie', alg: "F' r U R' U' r' F R", hint: 'Two {top} corners diagonal from each other.' },
];
