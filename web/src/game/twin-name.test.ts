import { describe, expect, test } from "vitest";
import { cleanTwinName, twinNameProblem } from "./twin-name";

describe("twin names", () => {
  test("real names pass", () => {
    for (const name of ["Aarav", "Kavya", "Sri", "Al", "Anil Suthar", "Rhythm", "D'Souza", "Mary-Jo", "Dr. Rao", "Prathvi", "Ishaan K", "अनिल", "Zoë"]) {
      expect(twinNameProblem(name), name).toBeNull();
    }
  });

  test("empty and junk names are refused", () => {
    for (const name of ["", "   ", "a", "1", "12345", "--", "a1", "@@@", "klsdjfj", "asdfgh", "qwerty", "zxcvb", "aaaa", "Kavyaaa", "bcdfg", "x y"]) {
      expect(twinNameProblem(name), JSON.stringify(name)).not.toBeNull();
    }
  });

  test("too long, and messages are plain", () => {
    expect(twinNameProblem("A".repeat(10) + "b".repeat(5) + "c".repeat(6))).toMatch(/20 characters/);
    expect(twinNameProblem("")).toBe("Give your twin a name.");
    expect(twinNameProblem("A")).toBe("Use at least 2 letters.");
  });

  test("spaces are tidied", () => {
    expect(cleanTwinName("  Anil   Suthar ")).toBe("Anil Suthar");
  });
});
