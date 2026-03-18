import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

let clientInstance: Client | null = null;

async function getClient(): Promise<Client> {
  if (clientInstance) return clientInstance;

  const server = createServer();
  const client = new Client({ name: "tool-invoker", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  clientInstance = client;
  return client;
}

export interface ToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export async function invokeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  return result as ToolResult;
}

export async function listTools(): Promise<
  Array<{
    name: string;
    description?: string;
    inputSchema: {
      type: "object";
      properties?: Record<string, object>;
      required?: string[];
    };
  }>
> {
  const client = await getClient();
  const result = await client.listTools();
  return result.tools as Array<{
    name: string;
    description?: string;
    inputSchema: {
      type: "object";
      properties?: Record<string, object>;
      required?: string[];
    };
  }>;
}

/** Reset the cached client instance (for testing) */
export function _resetClient(): void {
  clientInstance = null;
}
