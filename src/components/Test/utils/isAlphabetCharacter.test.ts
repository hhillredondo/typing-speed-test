import { isAlphabetCharacter } from "./isAlphabetCharacter";

const evt = (key: string) =>
  ({ key } as unknown as React.KeyboardEvent<HTMLDivElement>);

describe("isAlphabetCharacter", () => {
  test.each(["a", "z", "A", "Z", "m", "-"])("accepts %s", (key) => {
    expect(isAlphabetCharacter(evt(key))).toBe(true);
  });

  test.each(["1", " ", "Enter", "Backspace", "ArrowLeft", "", "ñ", "."])(
    "rejects %s",
    (key) => {
      expect(isAlphabetCharacter(evt(key))).toBe(false);
    }
  );

  test("rejects multi-character keys", () => {
    expect(isAlphabetCharacter(evt("ab"))).toBe(false);
  });
});
