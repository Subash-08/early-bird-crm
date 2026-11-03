import { MongoClient, type Document } from "mongodb";
let connection: Promise<MongoClient> | undefined;
export async function client() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Setup required: add MONGODB_URI to .env.local.");
  if (!connection) {
    const mongo = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
    connection = mongo.connect().catch(async error => {
      connection = undefined;
      await mongo.close().catch(() => undefined);
      throw error;
    });
  }
  return connection;
}
export async function db() {
  return (await client()).db(process.env.MONGODB_DB_NAME || "earlybird_dev");
}
export type Row = Document & { _id: string; org: string; version: number };
export async function collection(name: string) {
  return (await db()).collection<Row>(name);
}
export const org = () => process.env.APP_ORG_ID || "earlybird";
export async function indexes() {
  const d = await db();
  await Promise.all([
    d.collection("settlementEntries").createIndex({ org: 1, bookingId: 1, status: 1, createdAt: -1 }),
    d.collection("settlementEntries").createIndex({ org: 1, referenceKey: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["Pending review", "Posted"] } } }),
    d.collection("settlementEntries").createIndex({ status: 1, kind: 1, dueAt: 1 }),
    d.collection("bookingChanges").createIndex({ org: 1, bookingId: 1, status: 1 }),
    d.collection("staff").createIndex({ org: 1, email: 1 }, { unique: true }),
    d
      .collection("staff")
      .createIndex({ authId: 1 }, { unique: true, sparse: true }),
    d
      .collection("tokens")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d
      .collection("uploads")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d
      .collection("tasks")
      .createIndex({ org: 1, assigneeId: 1, status: 1, dueAt: 1 }),
    d.collection("enquiries").createIndex({ org: 1, assigneeId: 1, stage: 1 }),
    d.collection("enquiries").createIndex({ org: 1, createdAt: -1, source: 1, stage: 1 }),
    d.collection("customers").createIndex({ org: 1, phone: 1 }),
    d.collection("customers").createIndex({ org: 1, name: 1 }),
    d.collection("customers").createIndex({ org: 1, email: 1 }),
    d
      .collection("notifications")
      .createIndex({ org: 1, recipient: 1, createdAt: -1 }),
    d
      .collection("rateLimits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    d
      .collection("quotes")
      .createIndex(
        { org: 1, quoteNumber: 1, quoteVersion: 1 },
        { unique: true },
      ),
    d.collection("quotes").createIndex({ org: 1, groupId: 1, status: 1 }),
    d
      .collection("quotes")
      .createIndex({ org: 1, assigneeId: 1, updatedAt: -1 }),
    d
      .collection("documentJobs")
      .createIndex({ org: 1, status: 1, createdAt: 1 }),
    d
      .collection("bookings")
      .createIndex({ org: 1, bookingNumber: 1 }, { unique: true }),
    d
      .collection("bookings")
      .createIndex({ org: 1, quoteId: 1 }, { unique: true }),
    d
      .collection("bookings")
      .createIndex({ org: 1, salesAssigneeId: 1, updatedAt: -1 }),
    d
      .collection("bookings")
      .createIndex({ org: 1, createdAt: -1, serviceStart: 1 }),
    d
      .collection("bookings")
      .createIndex({ org: 1, operationsAssigneeIds: 1, status: 1 }),
    d
      .collection("payments")
      .createIndex({ org: 1, bookingId: 1, createdAt: -1 }),
    d
      .collection("payments")
      .createIndex({ org: 1, referenceKey: 1 }, { unique: true, sparse: true }),
    d
      .collection("invoices")
      .createIndex(
        { org: 1, bookingId: 1, invoiceVersion: 1 },
        { unique: true },
      ),
    d
      .collection("invoices")
      .createIndex(
        { org: 1, invoiceNumber: 1 },
        { unique: true, sparse: true },
      ),
    d
      .collection("invoiceTemplates")
      .createIndex(
        { org: 1, active: 1 },
        { unique: true, partialFilterExpression: { active: true } },
      ),
    d
      .collection("financeDocuments")
      .createIndex({ org: 1, bookingId: 1, kind: 1 }),
    d.collection("suppliers").createIndex({ org: 1, name: 1, location: 1 }),
    d
      .collection("vehicles")
      .createIndex({ org: 1, registration: 1 }, { unique: true }),
    d
      .collection("arrangements")
      .createIndex({ org: 1, bookingId: 1, confirmationStatus: 1, startAt: 1 }),
    d
      .collection("arrangements")
      .createIndex({ org: 1, holdUntil: 1, confirmationStatus: 1 }),
    d
      .collection("tripSegments")
      .createIndex({ org: 1, driverId: 1, startAt: 1, endAt: 1 }),
    d
      .collection("tripSegments")
      .createIndex({ org: 1, vehicleId: 1, startAt: 1, endAt: 1 }),
    d
      .collection("readinessItems")
      .createIndex({ org: 1, bookingId: 1, key: 1 }, { unique: true }),
    d
      .collection("incidents")
      .createIndex({ org: 1, bookingId: 1, status: 1, reportedAt: -1 }),
    d
      .collection("collectionReports")
      .createIndex({ org: 1, duplicateKey: 1 }, { unique: true }),
    d
      .collection("operationsDocuments")
      .createIndex({ org: 1, bookingId: 1, kind: 1, createdAt: -1 }),
    d
      .collection("travelDocuments")
      .createIndex({ org: 1, bookingId: 1, travellerName: 1, category: 1 }),
    d
      .collection("operationsRequests")
      .createIndex({ org: 1, bookingId: 1, status: 1, createdAt: -1 }),
  ]);
  await d.collection("migrations").bulkWrite([
    { updateOne: { filter: { _id: "phase5-v1" as never }, update: { $setOnInsert: { appliedAt: new Date() } }, upsert: true } },
    {
      updateOne: {
        filter: { _id: "phase1-v1" as never },
        update: { $setOnInsert: { appliedAt: new Date() } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: "phase3-v1" as never },
        update: { $set: { appliedAt: new Date() } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: "phase2-v1" as never },
        update: { $set: { appliedAt: new Date() } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: "phase4-v1" as never },
        update: { $set: { appliedAt: new Date() } },
        upsert: true,
      },
    },
  ]);
}
