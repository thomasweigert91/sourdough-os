// @vitest-environment node
import { describe, expect, it } from "vitest";
// Bundler-Auflösung: ".mjs" zeigt auf vitest.config.mts (TS erlaubt die Endung ".mts" im Import nicht).
import config from "./vitest.config.mjs";

describe("F009 vitest.config.mts", () => {
  it("F009/AC-1 setzt test.testTimeout auf mindestens 15000 ms, damit die volle Suite stabil grün läuft", () => {
    expect(config.test?.testTimeout ?? 0).toBeGreaterThanOrEqual(15000);
  });
});
