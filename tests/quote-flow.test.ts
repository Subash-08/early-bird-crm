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
  it("allows a teammate to draft but never overwrite internal fields or approve", async () => {
    const team = { ...sales, id: "sales-team" };
    const stranger = { ...sales, id: "sales-stranger" };
    const e = await (await dbmod.collection("enquiries")).findOne({ _id: "enquiry-1" });
    await (await dbmod.collection("enquiries")).insertOne({ ...e, _id: "team-enquiry", collaboratorIds: [team.id] });
    const id = await quote.requestQuote(team, { enquiryId: "team-enquiry", requestNote: "Private Owner note", requestedDueAt: due });
    const q = await (await dbmod.collection("quotes")).findOne({ _id: id });
    const visible = (await crm.snapshot(team, "quotations")).quotes.find((row: { _id: string }) => row._id === id);
    expect(visible.content.internalNotes).toBe("");
    const content = { ...q.content, title: "Team draft", internalNotes: "Attempted overwrite" };
    await expect(quote.saveQuote(stranger, content, id, 1)).rejects.toThrow("not assigned");
    await quote.saveQuote(team, content, id, 1);
    const saved = await (await dbmod.collection("quotes")).findOne({ _id: id });
    expect(saved).toMatchObject({ assigneeId: sales.id, status: "Draft", content: { title: "Team draft", internalNotes: "Private Owner note" } });
    const templateId = await quote.saveTemplate(owner, { name: "Munnar honeymoon", destination: q.content.destinations, content: {
      ...q.content, internalNotes: "Private template note", customerNotes: "Customer-specific information", validUntil: "2027-01-01",
    } });
    await expect(quote.packageTemplateWorkspace(team, templateId, 1, "")).rejects.toThrow("Owner");
    const page = await quote.packageTemplateWorkspace(owner, "", 1, "honeymoon");
    expect(page.templates).toMatchObject([{ _id: templateId, name: "Munnar honeymoon", active: true }]);
    expect(page.templates?.[0].content).toBeUndefined();
    const { template } = await quote.packageTemplateWorkspace(owner, templateId, 1, "");
    expect(template?.content).toMatchObject({ startDate: "", validUntil: "", internalNotes: "", advanceAmount: "0" });
    await quote.applyTemplate(team, { quoteId: id, version: 2, templateId });
    const applied = await (await dbmod.collection("quotes")).findOne({ _id: id });
    expect(applied.content).toMatchObject({ startDate: q.content.startDate, validUntil: "", internalNotes: "Private Owner note", customerNotes: "" });
    await quote.saveTemplate(owner, { id: templateId, version: template?.version, name: "Munnar honeymoon", destination: q.content.destinations, active: false, content: template?.content });
    await expect(quote.applyTemplate(team, { quoteId: id, version: 3, templateId })).rejects.toThrow("unavailable");
    await expect(quote.approveQuote(team, { quoteId: id, version: 2 })).rejects.toThrow("Owner");
    await (await dbmod.collection("enquiries")).updateOne({ _id: "team-enquiry" }, { $set: { collaboratorIds: [] } });
    await expect(quote.saveQuote(team, content, id, 3)).rejects.toThrow("not assigned");
  });

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
      advanceAmount: "0",
      advanceDue: "",
      balanceTerms: "",
      validUntil: "2027-01-31",
      cancellationTerms: "Actual supplier cancellation charges apply.",
      internalNotes: "supplier cost note",
    };
    content.options.push({ ...content.options[0], id: "option-2", name: "Premium" });
    content.stays.push({ ...content.stays[0], id: "stay-2", optionId: "option-2", property: "Premium Hotel" });
    await quote.saveQuote(owner, content, quoteId, q.version);
    q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    await quote.approveQuote(owner, { quoteId, version: q.version });
    q = await (await dbmod.collection("quotes")).findOne({ _id: quoteId });
    expect(q.status).toBe("Approved");
    expect(q.pdfStatus).toBe("Ready");
    expect(q.snapshot.paymentHandledInBooking).toBe(true);
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
    await expect(quote.decideQuote(sales, {
      quoteId, version: q.version, decision: "Accepted", selectedOptionId: "option-1",
      decidedAt: "2027-02-01T09:00:00.000Z", channel: "WhatsApp", reference: "Expired quote",
    })).rejects.toThrow("expired");
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
    const acceptanceAlert = await (await dbmod.collection("notifications")).findOne({
      _id: `quote-accepted:${quoteId}:${owner.id}`, org: owner.org, recipient: owner.id,
    });
    expect(acceptanceAlert).toMatchObject({ recordId: quoteId, read: false });
    const bookings = await import("../src/server/bookings");
    const bookingId = await bookings.convertAcceptedQuote(sales, { quoteId });
    expect(await bookings.convertAcceptedQuote(sales, { quoteId })).toBe(bookingId);
    const booking = await (await dbmod.collection("bookings")).findOne({ _id: bookingId });
    expect(booking).toMatchObject({ requiredAdvanceMinor: 0, paymentTracking: false, status: "Ready for coordination" });
    await expect(bookings.amendAdvance(owner, { bookingId, version: booking.version, amount: "5000", reason: "test" })).rejects.toThrow("not tracked");
    await bookings.releaseOperations(owner, { bookingId, version: booking.version, coordinationMode: "direct", operationsAssigneeIds: [] });
    const operations = await import("../src/server/operations");
    expect(await operations.copyPackageServices(sales, { bookingId })).toBe(2);
    expect(await operations.copyPackageServices(sales, { bookingId })).toBe(0);
    const services = await (await dbmod.collection("arrangements")).find({ bookingId }).toArray();
    expect(services).toHaveLength(2);
    expect(services.some((service: { title: string }) => service.title === "Premium Hotel")).toBe(false);
    expect(services).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "Hotel", title: "Comfort Hotel", confirmationStatus: "Draft", supplierId: "" }),
      expect.objectContaining({ type: "Car", confirmationStatus: "Draft", supplierId: "" }),
    ]));
    await (await dbmod.collection("bookings")).updateOne({ _id: bookingId }, { $set: { status: "Trip completed" } });
    expect((await quote.enquiryQuoteWorkspace(sales, quoteId)).booking?.status).toBe("Trip completed");
    expect((await crm.enquiryActivity(sales, "enquiry-1")).booking?.status).toBe("Trip completed");
    const quoteRows = await dbmod.collection("quotes");
    await quoteRows.insertOne({ ...q, _id: "quote-change-demo", groupId: "quote-change-demo", quoteNumber: "EB-Q-CHANGE-DEMO", version: 1, status: "Sent", selectedOptionId: "" });
    await quote.decideQuote(sales, {
      quoteId: "quote-change-demo", version: 1, decision: "Changes requested",
      decidedAt: new Date().toISOString(), channel: "Phone", reference: "Customer call", reason: "Use a different houseboat",
    });
    const changed = await quoteRows.findOne({ _id: "quote-change-demo" });
    expect(changed).toMatchObject({ status: "Changes requested", decisionReason: "Use a different houseboat", selectedOptionId: "" });
    expect(await (await dbmod.collection("tasks")).countDocuments({ quoteId: changed._id, title: "Review quotation change request" })).toBe(1);
    expect(
      (
        await (
          await dbmod.collection("enquiries")
        ).findOne({ _id: "enquiry-1" })
      ).stage,
    ).toBe("Won");
  }, 60000);
});
