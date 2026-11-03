import { client, collection, db, org } from "../src/server/db";
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Add MONGODB_URI to .env.local.");
  const address = new URL(uri);
  console.log({ host: address.hostname, database: process.env.MONGODB_DB_NAME || "earlybird_dev", authOrigin: process.env.BETTER_AUTH_URL || "Not configured" });
  await (await db()).command({ ping: 1 });
  console.log("Database connection: OK");
  const owners = await (await collection("staff")).find({ org: org(), role: "owner" }, { projection: { status: 1, authId: 1 } }).toArray();
  console.log({ ownerAccounts: owners.length, activeOwners: owners.filter(p => p.status === "active").length, ownersWithLogin: owners.filter(p => !!p.authId).length });
  console.log("If the browser still reports a server error, restart npm run dev and retry. No passwords or accounts were changed.");
}
main().catch(e => {
  const name = e instanceof Error ? e.name : "ConnectionError";
  console.error(`Database check failed (${name}). Check internet/VPN/firewall, Atlas cluster availability and Atlas Network Access for this machine's IP. Check .env.local locally; do not paste credentials into chat.`);
  process.exitCode = 1;
}).finally(async () => { try { await (await client()).close(); } catch {} });
