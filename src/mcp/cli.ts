import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { EmbeddingService } from "../service/embedding.js";
import { buildMcpServer } from "./server.js";

async function main(): Promise<void> {
  await migrate();
  const { db } = createDb();
  const embedding = new EmbeddingService(db, { apiKey: process.env.OPENAI_API_KEY });
  const server = buildMcpServer({ db, embedding });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("botnote MCP server up on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
