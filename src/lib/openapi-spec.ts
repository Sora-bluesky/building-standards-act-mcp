import { listTools } from "./tool-invoker.js";

const EXCLUDED_TOOLS = new Set(["validate_presets", "get_metrics"]);

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, object>;
}

export async function generateOpenApiSpec(
  baseUrl = "https://your-app.vercel.app",
): Promise<OpenApiSpec> {
  const tools = await listTools();
  const paths: Record<string, object> = {};

  for (const tool of tools) {
    if (EXCLUDED_TOOLS.has(tool.name)) continue;

    const properties = tool.inputSchema.properties ?? {};
    const required = tool.inputSchema.required ?? [];

    // Build query parameters for GET
    const parameters = Object.entries(properties).map(([name, schema]) => ({
      name,
      in: "query" as const,
      required: required.includes(name),
      schema,
      description: (schema as { description?: string }).description ?? "",
    }));

    paths[`/api/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.description ?? tool.name,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: tool.inputSchema,
            },
          },
        },
        responses: {
          "200": {
            description: "Tool execution result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          text: { type: "string" },
                        },
                      },
                    },
                    isError: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        operationId: `${tool.name}_get`,
        summary: `${tool.description ?? tool.name} (GET)`,
        parameters,
        responses: {
          "200": {
            description: "Tool execution result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          text: { type: "string" },
                        },
                      },
                    },
                    isError: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Building Standards Act MCP — REST API",
      version: "0.5.0",
      description:
        "Japanese building regulations API. Fetches law text from e-Gov API v2 to prevent AI hallucination in building permit reviews.",
    },
    servers: [{ url: baseUrl, description: "Vercel deployment" }],
    paths,
  };
}
