const VERSION = "0.0.1";

async function main(): Promise<void> {
  console.log(`botnote v${VERSION} — skeleton boot`);
  console.log("M1#1: repo skeleton in place. Service/REST/MCP not yet wired.");
  console.log("Next: M1#2 schema + migrations (OTHE-169).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
