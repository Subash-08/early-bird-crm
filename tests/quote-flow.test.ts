import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";

let repl: MongoMemoryReplSet;
let dbmod: any;
let quote: any;
let crm: any;
const owner: Actor = {
  id: "owner-1",
  authId: "auth-owner",
  org: "test-agency",
  name: "Owner",
  role: "owner",
};
const sales: Actor = {
  id: "sales-1",
  authId: "auth-sales",
  org: "test-agency",
  name: "Sales",
  role: "sales",
};
const due = new Date(Date.now() + 86400000).toISOString();

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = repl.getUri();
  process.env.MONGODB_DB_NAME = "quote_flow";
  process.env.APP_ORG_ID = "test-agency";
  dbmod = await import("../src/server/db");
  quote = await import("../src/server/quotes");
  crm = await import("../src/server/crm");
  await dbmod.indexes();
  const staff = await dbmod.collection("staff");
  await staff.insertMany([
    {
      _id: owner.id,
      org: owner.org,
      version: 1,
      authId: owner.authId,
      name: owner.name,
      email: "owner@test.local",
      role: "owner",
      status: "active",
    },
    {
      _id: sales.id,
      org: sales.org,
      version: 1,
      authId: sales.authId,
      name: sales.name,
      email: "sales@test.local",
      role: "sales",
      status: "active",
    },
  ]);
  await (
    await dbmod.collection("customers")
  ).insertOne({
    _id: "customer-1",
    org: owner.org,
    version: 1,
    name: "Test Couple",
    phone: "+919876543210",
    email: "couple@test.local",
    assigneeId: sales.id,
  });
  await (
    await dbmod.collection("enquiries")
  ).insertOne({
    _id: "enquiry-1",
    org: owner.org,
    version: 1,
    customerId: "customer-1",
    assigneeId: sales.id,
    destination: "Munnar",
    source: "Phone",
    stage: "Gathering details",
    firstContactAt: new Date().toISOString(),
    dateMode: "Exact",
    departure: "2027-02-10",
    returnDate: "2027-02-13",
    travelPreference: "",
    adults: 2,
    childrenAges: "",
    infants: 0,
    budget: "50000",
    budgetBasis: "Total",
    services: "Hotel and car",
    serviceResponsibility: "Agency arranged",
    hotelPreference: "Comfort hotel",
    rooms: "1 double",
    pickup: "Kochi Airport",
    dropoff: "Kochi Airport",
    specialRequirements: "",
    notes: "",
    reason: "",
    nextAction: "",
    nextFollowUp: "",
    contactOutcome: "Connected",
    reviewNeeded: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}, 900000);
afterAll(async () => {
  if (dbmod) await (await dbmod.client()).close();
  if (repl) await repl.stop();
}, 30000);

describe("quotation workflow integration", () => {
  it("persists request, approval, PDF, sharing and exact-option acceptance", async () => {
    const quoteId = await quote.requestQuote(sales, {
      enquiryId: "enquiry-1",
      requestNote: "Comfort honeymoon package",
      requestedDueAt: due,
    });
    let q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    expect(q.status).toBe("Requested");
    expect(
      await (
        await dbmod.collection("tasks")
      ).countDocuments({ quoteId, title: "Prepare quotation" }),
    ).toBe(1);
    const content = {
      ...q.content,
      services: ["Accommodation", "Car / transfer"],
      itinerary: [
        {
          id: "day-1",
          day: 1,
          date: "2027-02-10",
          title: "Arrival",
          city: "Munnar",
          activities: "Arrival and sightseeing",
          transfers: "Private car",
          stay: "Comfort Hotel",
          meals: "Dinner",
          notes: "",
        },
      ],
      stays: [
        {
          id: "stay-1",
          optionId: "option-1",
          city: "Munnar",
          property: "Comfort Hotel",
          checkIn: "2027-02-10",
          checkOut: "2027-02-13",
          roomType: "Deluxe",
          rooms: 1,
          occupancy: "Double",
          mealPlan: "Breakfast",
          extraBed: "",
          notes: "",
        },
      ],
      transport: [
        {
          id: "leg-1",
          optionId: "option-1",
          mode: "Car",
          responsibility: "Agency arranged",
          from: "Kochi Airport",
          to: "Munnar",
          date: "2027-02-10",
          time: "09:30",
          timeZone: "Asia/Kolkata",
          provider: "",
          reference: "",
          passengers: "2",
          details: "Private sedan",
          chargeIncluded: true,
        },
      ],
      options: [
        {
          id: "option-1",
          name: "Comfort",
          description: "Hotel and private car",
          hotel: "Comfort Hotel",
          mealPlan: "Breakfast",
          priceBasis: "Total package",
          quantity: 1,
          unitPrice: "48000",
          discount: "0",
          taxLabel: "",
          taxAmount: "0",
          internalCost: "38000",
          notes: "owner only",
        },
      ],
      inclusions: ["Hotel", "Private car"],
      exclusions: ["Customer flights"],
      currency: "INR",
      advanceAmount: "10000",
      advanceDue: "Within two days",
      balanceTerms: "Balance before travel",
      validUntil: "2027-01-31",
      cancellationTerms: "Actual supplier cancellation charges apply.",
      internalNotes: "supplier cost note",
    };
    await quote.saveQuote(owner, content, quoteId, q.version);
    q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    await quote.approveQuote(owner, { quoteId, version: q.version });
    q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    expect(q.status).toBe("Approved");
    expect(q.pdfStatus).toBe("Ready");
    expect(q.snapshot.content.options[0].internalCost).toBeUndefined();
    expect(
      await (await dbmod.collection("documents")).countDocuments({ quoteId }),
    ).toBe(1);
    const salesSnap = await crm.snapshot(sales);
    expect(
      salesSnap.quotes[0].content.options[0].internalCostMinor,
    ).toBeUndefined();
    expect(salesSnap.quotes[0].internalCostTotalMinor).toBeUndefined();
    await quote.shareQuote(sales, {
      quoteId,
      version: q.version,
      channel: "WhatsApp",
      sharedAt: new Date().toISOString(),
      reference: "Manual share",
      followUpAt: due,
      note: "Sent by staff",
    });
    q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    expect(q.status).toBe("Sent");
    await quote.decideQuote(sales, {
      quoteId,
      version: q.version,
      decision: "Accepted",
      selectedOptionId: "option-1",
      decidedAt: new Date().toISOString(),
      channel: "WhatsApp",
      reference: "Customer message",
      reason: "Confirmed option 1",
    });
    q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    expect(q.status).toBe("Accepted");
    expect(q.selectedOptionId).toBe("option-1");
    expect(
      (
        await (
          await dbmod.collection("enquiries")
        ).findOne({ _id: "enquiry-1" })
      ).stage,
    ).toBe("Won");
  }, 60000);
});
