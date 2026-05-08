import { shuffleArray } from "./shuffleArray";

describe("shuffleArray", () => {
  test("preserves length", () => {
    const input = ["a", "b", "c", "d", "e"];
    const out = shuffleArray([...input]);
    expect(out).toHaveLength(input.length);
  });

  test("preserves multiset of elements", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const out = shuffleArray([...input]);
    expect(out.slice().sort()).toEqual(input.slice().sort());
  });

  test("handles empty and single-element arrays", () => {
    expect(shuffleArray([])).toEqual([]);
    expect(shuffleArray(["only"])).toEqual(["only"]);
  });

  test("changes order at least sometimes (statistical)", () => {
    const input = Array.from({ length: 50 }, (_, i) => `w${i}`);
    let anyDifferent = false;
    for (let trial = 0; trial < 5 && !anyDifferent; trial++) {
      const out = shuffleArray([...input]);
      if (out.some((v, i) => v !== input[i])) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });
});
