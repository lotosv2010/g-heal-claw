import { describe, it, expect } from "vitest";
import { isPathAllowed } from "../../src/config/repo-config.js";

describe("isPathAllowed", () => {
  const config = {
    paths: ["src/**", "apps/**/src/**"],
    forbidden: ["src/legacy/**", "**/__snapshots__/**"],
  };

  it("allows paths matching whitelist", () => {
    expect(isPathAllowed("src/utils/number.ts", config)).toBe(true);
    expect(isPathAllowed("apps/web/src/lib/api.ts", config)).toBe(true);
  });

  it("rejects forbidden paths", () => {
    expect(isPathAllowed("src/legacy/old.ts", config)).toBe(false);
    expect(isPathAllowed("src/__snapshots__/test.snap", config)).toBe(false);
  });

  it("rejects paths not in whitelist", () => {
    expect(isPathAllowed("node_modules/lib/index.ts", config)).toBe(false);
    expect(isPathAllowed("dist/bundle.js", config)).toBe(false);
  });

  it("allows all when no config provided", () => {
    expect(isPathAllowed("anything/here.ts", undefined)).toBe(true);
  });

  it("uses default paths when config has empty paths", () => {
    expect(isPathAllowed("src/index.ts", { paths: ["src/**"], forbidden: [] })).toBe(true);
    expect(isPathAllowed("lib/index.ts", { paths: ["src/**"], forbidden: [] })).toBe(false);
  });
});
