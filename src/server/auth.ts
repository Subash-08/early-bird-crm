import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db, client, collection, org } from "./db";
import { roles, type Actor } from "@/lib/domain";
let instance: any;
const DAY_SECONDS = 60 * 60 * 24;

export function sessionDurationSeconds() {
  const days = Number(process.env.AUTH_SESSION_DAYS || 30);
  if (!Number.isInteger(days) || days < 1 || days > 90)
    throw new Error("AUTH_SESSION_DAYS must be a whole number from 1 to 90.");
  return days * DAY_SECONDS;
}

export async function createAuthInstance() {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    throw new Error(
      "Configure a random BETTER_AUTH_SECRET of at least 32 characters.",
    );
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(await db(), { client: await client() }),
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    session: {
      // Persistent, sliding database session. Cookie cache stays disabled so
      // role changes, password resets and deactivation take effect immediately.
      expiresIn: sessionDurationSeconds(),
      updateAge: DAY_SECONDS,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
  });
}

export async function auth() {
  if (instance) return instance;
  instance = await createAuthInstance();
  return instance;
}
export async function actor(headers: Headers): Promise<Actor> {
  const session = await (await auth()).api.getSession({ headers });
  if (!session) throw new Error("401: Please sign in.");
  const p = await (
    await collection("staff")
  ).findOne({ authId: session.user.id, org: org(), status: "active" });
  if (!p || !roles.includes(p.role))
    throw new Error("403: Account inactive or not assigned to this agency.");
  return {
    id: p._id,
    authId: session.user.id,
    org: p.org,
    name: p.name,
    role: p.role,
    capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
  };
}
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export async function issueToken(staffId: string) {
  const token = randomBytes(32).toString("hex");
  const c = await collection("tokens");
  await c.deleteMany({ staffId, org: org() });
  await c.insertOne({
    _id: digest(token),
    org: org(),
    version: 1,
    staffId,
    expiresAt: new Date(Date.now() + 24 * 3600000),
  });
  return `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/activate#${token}`;
}
export async function activate(token: string, password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters.");
  const tokens = await collection("tokens");
  const t = await tokens.findOne({
    _id: digest(token),
    org: org(),
    expiresAt: { $gt: new Date() },
  });
  if (!t)
    throw new Error(
      "Activation link expired or already used. Ask the owner for a new link.",
    );
  const staff = await collection("staff");
  const p = await staff.findOne({ _id: t.staffId, org: org() });
  if (!p || p.status === "inactive") throw new Error("Account is inactive.");
  const hashed = await hashPassword(password);
  const mongo = await client();
  const session = mongo.startSession();
  try {
    await session.withTransaction(async () => {
      const used = await tokens.deleteOne(
        { _id: t._id, expiresAt: { $gt: new Date() } },
        { session },
      );
      if (!used.deletedCount) throw new Error("Link already used.");
      const d = await db();
      let authId = p.authId;
      if (!authId) {
        authId = crypto.randomUUID();
        await d
          .collection("user")
          .insertOne(
            {
              _id: authId as never,
              name: p.name,
              email: p.email,
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { session },
          );
        await d
          .collection("account")
          .insertOne(
            {
              _id: crypto.randomUUID() as never,
              userId: authId,
              accountId: authId,
              providerId: "credential",
              password: hashed,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { session },
          );
      } else {
        await d
          .collection("account")
          .updateOne(
            { userId: authId, providerId: "credential" },
            { $set: { password: hashed, updatedAt: new Date() } },
            { session },
          );
        await d
          .collection("session")
          .deleteMany({ userId: authId }, { session });
      }
      await staff.updateOne(
        { _id: p._id },
        { $set: { authId, status: "active" }, $inc: { version: 1 } },
        { session },
      );
      await (
        await collection("activity")
      ).insertOne(
        {
          _id: crypto.randomUUID(),
          org: org(),
          version: 1,
          recordId: p._id,
          actor: p.name,
          event: "Account activated or password reset",
          createdAt: new Date().toISOString(),
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

const accessRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.email(),
    password: z.string().min(12).max(128),
  })
  .strict();

/**
 * Public registration deliberately creates a non-authorized CRM account.
 * An Owner must select the real role and change the staff status to active
 * before actor() will allow this user to read any agency data.
 */
export async function requestAccess(input: unknown, requestKey: string) {
  const p = accessRequestSchema.parse(input);
  const email = p.email.trim().toLowerCase();
  await limit(`request-access:${requestKey}:${email}`);

  const hashed = await hashPassword(p.password);
  const mongo = await client();
  const session = mongo.startSession();
  const staffId = crypto.randomUUID();
  const authId = crypto.randomUUID();
  const createdAt = new Date();
  const createdIso = createdAt.toISOString();
  try {
    await session.withTransaction(async () => {
      const d = await db();
      const staff = await collection("staff");
      const duplicate =
        (await staff.findOne({ org: org(), email }, { session })) ||
        (await d.collection("user").findOne({ email }, { session }));
      if (duplicate)
        throw new Error(
          "An account or access request already exists for this email. Ask the Owner to activate or reset it.",
        );

      await d.collection("user").insertOne(
        {
          _id: authId as never,
          name: p.name,
          email,
          emailVerified: true,
          createdAt,
          updatedAt: createdAt,
        },
        { session },
      );
      await d.collection("account").insertOne(
        {
          _id: crypto.randomUUID() as never,
          userId: authId,
          accountId: authId,
          providerId: "credential",
          password: hashed,
          createdAt,
          updatedAt: createdAt,
        },
        { session },
      );
      await staff.insertOne(
        {
          _id: staffId,
          org: org(),
          version: 1,
          authId,
          name: p.name,
          email,
          // This is only a safe placeholder. It grants nothing while pending.
          role: "sales",
          status: "pending",
          capabilities: [],
          requestedAt: createdIso,
          updatedAt: createdIso,
        },
        { session },
      );
      await (await collection("activity")).insertOne(
        {
          _id: crypto.randomUUID(),
          org: org(),
          version: 1,
          recordId: staffId,
          actor: p.name,
          event: "Account access requested; awaiting Owner approval",
          createdAt: createdIso,
        },
        { session },
      );
      const owners = await staff
        .find(
          { org: org(), role: "owner", status: "active" },
          { session, projection: { _id: 1 } },
        )
        .toArray();
      const notifications = await collection("notifications");
      for (const owner of owners) {
        await notifications.updateOne(
          { _id: `access-request:${staffId}:${owner._id}` },
          {
            $setOnInsert: {
              org: org(),
              version: 1,
              recipient: owner._id,
              title: `New account request from ${p.name}`,
              recordId: staffId,
              read: false,
              createdAt: createdIso,
            },
          },
          { upsert: true, session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return { ok: true };
}
export async function limit(key: string) {
  const c = await collection("rateLimits");
  const bucket = Math.floor(Date.now() / 60000);
  const r = await c.findOneAndUpdate(
    { _id: digest(key + bucket) },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        org: org(),
        version: 1,
        expiresAt: new Date(Date.now() + 120000),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if ((r?.count || 0) > 15)
    throw new Error("429: Too many attempts. Try again in a minute.");
}
