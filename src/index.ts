#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { logger } from "./lib/logger.js";

const server = createServer();

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("server started", { transport: "stdio" });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
