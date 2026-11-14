declare module 'cubejs' {
  export default class Cube {
    constructor(state?: Cube);
    static initSolver(): void;
    static fromString(facelets: string): Cube;
    static random(): Cube;
    asString(): string;
    isSolved(): boolean;
    move(alg: string): Cube;
    solve(maxDepth?: number): string;
  }
}
