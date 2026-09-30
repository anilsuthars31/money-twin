import { describe, expect, test } from "vitest";
import { safeCallbackUrl } from "./safe-redirect";

describe("safeCallbackUrl", () => {
  test("keeps same-site paths", () => {
    expect(safeCallbackUrl("/skills")).toBe("/skills");
    expect(safeCallbackUrl("/play/demo?month=9#top")).toBe("/play/demo?month=9#top");
    expect(safeCallbackUrl("/")).toBe("/");
  });
  test("defaults to /account", () => {
    expect(safeCallbackUrl(undefined)).toBe("/account");
    expect(safeCallbackUrl("")).toBe("/account");
    expect(safeCallbackUrl(["/a", "/b"])).toBe("/account");
  });
  test("refuses anything that leaves the site", () => {
    // "/\\evil.example" is the string /\evil.example, which some browsers treat like //evil.example.
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example/path"]) {
      expect(safeCallbackUrl(bad)).toBe("/account");
    }
  });
});
