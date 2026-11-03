import { client, collection, indexes, org } from "../src/server/db";
import { issueToken } from "../src/server/auth";

async function main() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Set BOOTSTRAP_OWNER_EMAIL in .env.local.");
  await indexes();
  const staff = await collection("staff");
  const existing = await staff.findOne({ org: org(), role: "owner" });
  if (existing) {
    console.log("Indexes ready. Owner already exists; no credentials changed.");
    return;
  }
  const id = `initial-owner:${org()}`;
  await staff.updateOne(
    { _id: id },
    { $setOnInsert: { org: org(), version: 1, name: process.env.BOOTSTRAP_OWNER_NAME || "Owner", email, role: "owner", status: "invited", capabilities: [] } },
    { upsert: true },
  );
  console.log("Open this private one-time owner activation link (expires in 24 hours):\n" + (await issueToken(id)));
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { try { await (await client()).close(); } catch {} });
