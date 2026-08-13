export type WendWord = { word: string; path: number[] };

export type Dictionary = {
  has(word: string): boolean;
  hasPrefix(prefix: string): boolean;
};

/**
 * Build a lookup limited to the lengths this puzzle actually asks for. Wend
 * needs prefix tests to prune path search, so every prefix of every kept word
 * goes into a second set — cheaper to build than a trie and enough here, since
 * restricting to the puzzle's lengths keeps the set small.
 */
export function buildDictionary(wordList: string, lengths: number[]): Dictionary {
  const wanted = new Set(lengths);
  const words = new Set<string>();
  const prefixes = new Set<string>();
  for (const word of wordList.split('\n')) {
    if (!wanted.has(word.length)) continue;
    words.add(word);
    for (let i = 1; i < word.length; i++) prefixes.add(word.slice(0, i));
  }
  return {
    has: (w) => words.has(w),
    hasPrefix: (p) => prefixes.has(p),
  };
}

/** 4-neighbour adjacency between playable cells; blocked cells are excluded. */
function buildAdjacency(rows: number, cols: number, letters: string[]): number[][] {
  const adjacency: number[][] = [];
  for (let i = 0; i < rows * cols; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const neighbors: number[] = [];
    if (!letters[i]) { adjacency.push(neighbors); continue; }
    const push = (j: number) => { if (letters[j]) neighbors.push(j); };
    if (r > 0) push(i - cols);
    if (r < rows - 1) push(i + cols);
    if (c > 0) push(i - 1);
    if (c < cols - 1) push(i + 1);
    adjacency.push(neighbors);
  }
  return adjacency;
}

/**
 * Partition every playable cell into vertex-disjoint paths whose lengths match
 * `lengths` and whose letters spell dictionary words.
 *
 * The search fixes the lowest-numbered uncovered cell at each step and only
 * considers words covering it. Every cell must end up in some word, so this
 * loses no solutions while collapsing the orderings of the same partition that
 * would otherwise be explored over and over.
 */
export function solve(
  rows: number,
  cols: number,
  letters: string[],
  lengths: number[],
  dict: Dictionary,
): WendWord[] | null {
  const playable: number[] = [];
  for (let i = 0; i < rows * cols; i++) if (letters[i]) playable.push(i);

  const need = lengths.reduce((a, b) => a + b, 0);
  if (need !== playable.length) return null;

  const adjacency = buildAdjacency(rows, cols, letters);
  const used = new Uint8Array(rows * cols);
  const remaining = [...lengths].sort((a, b) => b - a);
  const found: WendWord[] = [];

  const lowestUncovered = (): number => {
    for (const i of playable) if (!used[i]) return i;
    return -1;
  };

  /** Collect every simple path of exactly `len` unused cells that spells a word and covers `must`. */
  const pathsCovering = (must: number, len: number): WendWord[] => {
    const out: WendWord[] = [];
    const path: number[] = [];
    const walk = (cell: number, word: string, coversMust: boolean) => {
      path.push(cell);
      used[cell] = 1;
      const nextWord = word + letters[cell];
      const nextCovers = coversMust || cell === must;
      if (path.length === len) {
        if (nextCovers && dict.has(nextWord)) out.push({ word: nextWord, path: [...path] });
      } else if (dict.hasPrefix(nextWord)) {
        for (const n of adjacency[cell]) if (!used[n]) walk(n, nextWord, nextCovers);
      }
      used[cell] = 0;
      path.pop();
    };
    for (const start of playable) if (!used[start]) walk(start, '', false);
    return out;
  };

  const search = (): boolean => {
    if (remaining.length === 0) return true;
    const must = lowestUncovered();
    if (must === -1) return false;

    const tried = new Set<number>();
    for (let i = 0; i < remaining.length; i++) {
      const len = remaining[i];
      if (tried.has(len)) continue;
      tried.add(len);
      remaining.splice(i, 1);
      for (const candidate of pathsCovering(must, len)) {
        for (const cell of candidate.path) used[cell] = 1;
        found.push(candidate);
        if (search()) return true;
        found.pop();
        for (const cell of candidate.path) used[cell] = 0;
      }
      remaining.splice(i, 0, len);
    }
    return false;
  };

  return search() ? [...found] : null;
}
