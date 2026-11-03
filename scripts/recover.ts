import { client, collection, org } from "../src/server/db";
import { issueToken } from "../src/server/auth";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run owner:recover -- owner@email.example");
  const person = await (await collection("staff")).findOne({ org: org(), email, role: "owner", status: { $ne: "inactive" } });
  if (!person) throw new Error("Owner not found.");
  console.log("Protected server-side recovery link; share only with owner:\n" + (await issueToken(person._id)));
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { try { await (await client()).close(); } catch {} });
