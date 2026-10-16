import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SERVER_VERSION } from "../../src/lib/version.js";

describe("SERVER_VERSION", () => {
  it("matches package.json version", () => {
    const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
