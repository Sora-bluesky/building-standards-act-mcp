import { describe, it, expect, beforeEach } from "vitest";
import { generateOpenApiSpec } from "../../src/lib/openapi-spec.js";
import { _resetClient } from "../../src/lib/tool-invoker.js";

describe("openapi-spec", () => {
  beforeEach(() => {
    _resetClient();
  });

  it("generates valid OpenAPI 3.1 spec", async () => {
    const spec = await generateOpenApiSpec("https://example.com");
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBe("0.4.0");
  });

  it("uses provided baseUrl in servers", async () => {
    const spec = await generateOpenApiSpec("https://my-app.vercel.app");
    expect(spec.servers[0].url).toBe("https://my-app.vercel.app");
  });

  it("excludes validate_presets and get_metrics tools", async () => {
    const spec = await generateOpenApiSpec();
    const paths = Object.keys(spec.paths);
    expect(paths).not.toContain("/api/tools/validate_presets");
    expect(paths).not.toContain("/api/tools/get_metrics");
  });

  it("includes 9 public tools (11 total minus 2 excluded)", async () => {
    const spec = await generateOpenApiSpec();
    const paths = Object.keys(spec.paths);
    expect(paths.length).toBe(9);
  });

  it("each path has POST and GET methods", async () => {
    const spec = await generateOpenApiSpec();
    for (const [path, methods] of Object.entries(spec.paths)) {
      const methodObj = methods as Record<string, unknown>;
      expect(methodObj.post).toBeDefined();
      expect(methodObj.get).toBeDefined();
    }
  });

  it("POST method has requestBody with JSON schema", async () => {
    const spec = await generateOpenApiSpec();
    const getLawPath = spec.paths["/api/tools/get_law"] as Record<string, any>;
    expect(getLawPath.post.requestBody).toBeDefined();
    expect(
      getLawPath.post.requestBody.content["application/json"],
    ).toBeDefined();
    expect(
      getLawPath.post.requestBody.content["application/json"].schema.type,
    ).toBe("object");
  });

  it("GET method has query parameters", async () => {
    const spec = await generateOpenApiSpec();
    const getLawPath = spec.paths["/api/tools/get_law"] as Record<string, any>;
    expect(getLawPath.get.parameters).toBeDefined();
    expect(Array.isArray(getLawPath.get.parameters)).toBe(true);
    expect(getLawPath.get.parameters.length).toBeGreaterThan(0);
    // law_name should be required
    const lawNameParam = getLawPath.get.parameters.find(
      (p: any) => p.name === "law_name",
    );
    expect(lawNameParam).toBeDefined();
    expect(lawNameParam.required).toBe(true);
  });
});
