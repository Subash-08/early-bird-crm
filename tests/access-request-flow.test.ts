import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";

let replica: MongoMemoryReplSet;
let db: typeof import("../src/server/db");
let auth: typeof import("../src/server/auth");
let crm: typeof import("../src/server/crm");
const org = "access-request-test";
const owner: Actor = {
  id: "owner-1",
  authId: "owner-auth",
  org,
  name: "Agency Owner",
  role: "owner",
};

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DB_NAME = "access_requests";
  process.env.APP_ORG_ID = org;
  db = await import("../src/server/db");
  auth = await import("../src/server/auth");
  crm = await import("../src/server/crm");
  await db.indexes();
  await (await db.collection("staff")).insertOne({
    _id: owner.id,
    authId: owner.authId,
    org,
    version: 1,
    name: owner.name,
    email: "owner@example.test",
    role: "owner",
    status: "active",
  });
});

afterAll(async () => {
  if (db) await (await db.client()).close();
  if (replica) await replica.stop();
});

describe("public account request and Owner approval", () => {
  it("creates a pending account that has credentials but no active CRM access", async () => {
    await auth.requestAccess(
      {
        name: "New Driver",
        email: "driver@example.test",
        password: "StrongPassword123!",
      },
      "test-client",
    );
    const staff = await (await db.collection("staff")).findOne({
      email: "driver@example.test",
    });
    expect(staff?.status).toBe("pending");
    expect(staff?.role).toBe("sales");
    expect(staff?.authId).toBeTruthy();
    expect(
      await (await db.db()).collection("account").findOne({ userId: staff?.authId }),
    ).toBeTruthy();
    expect(
      await (await db.collection("notifications")).findOne({ recipient: owner.id }),
    ).toMatchObject({ recordId: staff?._id, read: false });
  });

  it("lets the Owner choose Operations and activate without work reassignment", async () => {
    const staff = await (await db.collection("staff")).findOne({
      email: "driver@example.test",
    });
    await crm.staffAction(owner, {
      id: staff?._id,
      version: staff?.version,
      name: staff?.name,
      email: staff?.email,
      role: "operations",
      status: "active",
      replacementId: "",
      capabilities: ["trip-times"],
      reset: false,
    });
    expect(
      await (await db.collection("staff")).findOne({ _id: staff?._id }),
    ).toMatchObject({ role: "operations", status: "active" });
  });

  it("does not create duplicate access requests", async () => {
    await expect(
      auth.requestAccess(
        {
          name: "Duplicate Driver",
          email: "driver@example.test",
          password: "StrongPassword123!",
        },
        "test-client",
      ),
    ).rejects.toThrow("already exists");
  });
});
