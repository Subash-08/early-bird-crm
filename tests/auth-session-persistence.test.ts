import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { hashPassword } from "better-auth/crypto";

let replica: MongoMemoryReplSet;
let database: typeof import("../src/server/db");
let authentication: typeof import("../src/server/auth");
const password = "PersistentPassword123!";

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DB_NAME = "auth_session_persistence";
  process.env.APP_ORG_ID = "auth-session-test";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET =
    "test-only-secret-that-is-longer-than-thirty-two-characters";
  process.env.AUTH_SESSION_DAYS = "30";
  database = await import("../src/server/db");
  authentication = await import("../src/server/auth");
  const authId = crypto.randomUUID();
  const now = new Date();
  await (await database.db()).collection("user").insertOne({
    _id: authId as never,
    name: "Persistent User",
    email: "persistent@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await (await database.db()).collection("account").insertOne({
    _id: crypto.randomUUID() as never,
    userId: authId,
    accountId: authId,
    providerId: "credential",
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(async () => {
  if (database) await (await database.client()).close();
  if (replica) await replica.stop();
});

describe("remembered authentication session", () => {
  it("uses a thirty-day rolling duration by default/configuration", () => {
    expect(authentication.sessionDurationSeconds()).toBe(30 * 24 * 60 * 60);
  });

  it("keeps the cookie valid when a new auth server instance starts", async () => {
    const firstServer = await authentication.createAuthInstance();
    const signIn = await firstServer.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "persistent@example.test",
          password,
          rememberMe: true,
        }),
      }),
    );
    expect(signIn.status).toBe(200);
    const setCookie = signIn.headers.get("set-cookie") || "";
    expect(setCookie).toContain("better-auth.session_token=");
    expect(setCookie.toLowerCase()).toContain("max-age=2592000");
    const cookie = setCookie.split(";")[0];

    // A newly constructed instance represents a stopped and restarted server.
    const restartedServer = await authentication.createAuthInstance();
    const session = await restartedServer.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { Cookie: cookie },
      }),
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { email: "persistent@example.test" },
    });
  });
});
