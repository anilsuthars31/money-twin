import { describe, expect, test } from "vitest";
import { isDevLoginEnabled } from "./dev-login";

describe("dev login switch", () => {
  test("never on in production, even with AUTH_DEV_LOGIN=true", () => {
    expect(isDevLoginEnabled({ NODE_ENV: "production", AUTH_DEV_LOGIN: "true" })).toBe(false);
  });
  test("on in development only when explicitly enabled", () => {
    expect(isDevLoginEnabled({ NODE_ENV: "development", AUTH_DEV_LOGIN: "true" })).toBe(true);
    expect(isDevLoginEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isDevLoginEnabled({ NODE_ENV: "development", AUTH_DEV_LOGIN: "TRUE" })).toBe(false);
    expect(isDevLoginEnabled({ NODE_ENV: "development", AUTH_DEV_LOGIN: "1" })).toBe(false);
  });
});
