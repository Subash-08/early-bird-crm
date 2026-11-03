import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { chromium, expect, type Browser } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";

// Uses only a disposable local replica set. Never reads .env.local or seeds Atlas.
async function main() {
  let server: ChildProcess | undefined, browser: Browser | undefined;
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const port = 3105, base = `http://127.0.0.1:${port}`, org = "isolated-phase5-demo";
  Object.assign(process.env, { MONGODB_URI: replica.getUri(), MONGODB_DB_NAME: "isolated_phase5_demo", APP_ORG_ID: org, BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString("hex") });
  const database = await import("../src/server/db");
  try {
    await database.indexes();
    const d = await database.db(), password = randomBytes(20).toString("hex"), hashed = await hashPassword(password);
    for (const role of ["owner", "sales", "operations"]) {
      const email = `${role}@example.test`;
      await (await database.collection("staff")).insertOne({ _id: role, authId: role, org, version: 1, role, name: `Demo ${role}`, status: "active", email, capabilities: [] });
      await d.collection("user").insertOne({ _id: role as never, name: `Demo ${role}`, email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
      await d.collection("account").insertOne({ _id: `account-${role}` as never, userId: role, accountId: role, providerId: "credential", password: hashed, createdAt: new Date(), updatedAt: new Date() });
    }
    await (await database.collection("customers")).insertOne({ _id: "demo-customer", org, version: 1, name: "Demo Search Customer", phone: "+919876543210", email: "customer@example.test", assigneeId: "sales", reviewNeeded: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await (await database.collection("bookings")).insertOne({ _id: "demo-booking", org, version: 1, bookingNumber: "EB-DEMO-0001", quoteId: "demo-quote", customerId: "demo-customer", ownerId: "owner", salesAssigneeId: "sales", operationsAssigneeIds: ["operations"], operationsReleased: true, operationsChecklist: [], status: "Trip completed", destination: "Kerala · demonstration only", currency: "INR", totalMinor: 100000, verifiedPaidMinor: 100000, outstandingMinor: 0, requiredAdvanceMinor: 10000, serviceStart: "2026-01-01", serviceEnd: "2026-01-03", travellers: [{ id: "traveller", name: "Demo Traveller", lead: true, type: "Adult", phone: "+919876543210" }], agreementSnapshot: { content: { internalNotes: "Private demo cost notes" } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await (await database.collection("payments")).insertOne({ _id: "demo-payment", org, version: 1, bookingId: "demo-booking", status: "Verified", amountMinor: 100000, currency: "INR", referenceKey: "demo-payment" });
    await (await database.collection("arrangements")).insertOne({ _id: "demo-arrangement", org, version: 1, bookingId: "demo-booking", supplierId: "demo-supplier", title: "Munnar hotel", type: "Hotel", responsibility: "Agency arranged", costMinor: 60000, currency: "INR", confirmationStatus: "Confirmed" });
    await (await database.collection("bookings")).insertOne({ _id: "unassigned-booking", org, version: 1, bookingNumber: "EB-DEMO-0002", quoteId: "unassigned-quote", salesAssigneeId: "another-sales", status: "Trip completed", currency: "INR", totalMinor: 0 });
    const settlement = await import("../src/server/settlements");
    const bill = await settlement.submitSettlement({ id: "sales", authId: "sales", org, role: "sales", name: "Demo sales" }, { bookingId: "demo-booking", commandId: crypto.randomUUID(), kind: "Supplier bill", amount: "600", currency: "INR", arrangementId: "demo-arrangement", reference: "DEMO-BILL-001", reason: "Hotel bill for isolated test", occurredAt: "2026-01-01T10:00:00.000Z" });
    server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: "pipe" });
    let logs = ""; server.stdout?.on("data", b => { logs = (logs + b.toString()).slice(-4000); }); server.stderr?.on("data", b => { logs = (logs + b.toString()).slice(-4000); });
    let ready = false;
    for (let n = 0; n < 60; n++) { if (server.exitCode !== null) throw new Error(`Isolated server exited: ${logs}`); try { const r = await fetch(base); if (r.ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
    if (!ready) throw new Error("Isolated server did not become ready.");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const errors: string[] = [];
    const login = async (role: string, mobile = false) => {
      const ctx = await browser!.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
      const page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
      await page.goto(base); await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("button", { name: "Notifications", exact: false }).first()).toBeVisible({ timeout: 20000 });
      return { ctx, page };
    };
    const ownerSession = await login("owner"), salesSession = await login("sales"), driverSession = await login("operations");
    const ownerReport = await ownerSession.ctx.request.get(`${base}/api/reports`), salesReport = await salesSession.ctx.request.get(`${base}/api/reports`), operationsReport = await driverSession.ctx.request.get(`${base}/api/reports`);
    if (!ownerReport.ok() || !("finance" in await ownerReport.json())) throw new Error("Owner financial report failed.");
    if ("finance" in await salesReport.json()) throw new Error("Sales report leaked agency finance.");
    if ("finance" in await operationsReport.json()) throw new Error("Operations report leaked agency finance.");
    const csvReport = await ownerSession.ctx.request.get(`${base}/api/reports?format=csv`);
    if (!csvReport.ok() || !csvReport.headers()["content-disposition"]?.includes("attachment")) throw new Error("Report CSV download failed.");
    if (!(await ownerSession.ctx.request.get(`${base}/manifest.webmanifest`)).ok() || !(await ownerSession.ctx.request.get(`${base}/sw.js`)).ok()) throw new Error("PWA assets are unavailable.");
    const navStyle = await ownerSession.page.locator(".sidebar").evaluate((element) => ({ position: getComputedStyle(element).position, height: getComputedStyle(element).height }));
    const navOverflow = await ownerSession.page.locator(".sidebar nav").evaluate((element) => getComputedStyle(element).overflowY);
    if (navStyle.position !== "fixed" || navOverflow !== "auto") throw new Error("Desktop navigation is not fixed with independent scrolling.");
    const customerLookup = await salesSession.ctx.request.get(`${base}/api/crm?resource=customer-search&q=Demo%20Search&limit=20`);
    if (!customerLookup.ok() || !(await customerLookup.json()).results?.some((customer: any) => customer._id === "demo-customer")) throw new Error("Assigned customer lookup failed.");
    const deniedCustomerLookup = await driverSession.ctx.request.get(`${base}/api/crm?resource=customer-search&q=Demo`);
    if (deniedCustomerLookup.status() !== 403) throw new Error("Operations customer lookup was not rejected.");
    await salesSession.page.getByRole("button", { name: "Enquiries", exact: true }).click();
    await salesSession.page.getByRole("button", { name: "New enquiry", exact: true }).click();
    await salesSession.page.getByRole("combobox", { name: "Customer" }).fill("Demo Search");
    await expect(salesSession.page.getByRole("option", { name: /Demo Search Customer/ })).toBeVisible();
    await salesSession.page.locator(".drawer").getByRole("button", { name: "Close panel", exact: true }).click();
    const openMoney = async (page: typeof ownerSession.page) => { await page.getByRole("button", { name: "Money & changes", exact: true }).click(); await page.getByRole("button", { name: /EB-DEMO-0001/ }).click(); await expect(page.getByText("What needs attention", { exact: true })).toBeVisible(); };
    await openMoney(ownerSession.page);
    await ownerSession.page.getByRole("button", { name: "Transactions", exact: true }).click();
    await ownerSession.page.getByLabel("Reason for this decision").fill("Checked demo hotel invoice");
    await ownerSession.page.getByRole("button", { name: "Approve & record", exact: true }).click();
    await expect(ownerSession.page.getByText("Saved successfully.", { exact: true })).toBeVisible();
    const approved = await (await database.collection("settlementEntries")).findOne({ _id: bill });
    if (approved?.status !== "Posted") throw new Error("UI approval did not persist.");
    await openMoney(salesSession.page);
    await salesSession.page.getByRole("button", { name: "Transactions", exact: true }).click();
    await salesSession.page.getByRole("button", { name: "Record a financial entry" }).click();
    await salesSession.page.getByLabel("What would you like to record?").selectOption("Supplier payment");
    await salesSession.page.getByLabel("Original approved entry").selectOption(bill!);
    await salesSession.page.getByLabel("Amount", { exact: true }).fill("200");
    await salesSession.page.getByLabel("Invoice / transaction / credit reference").fill("DEMO-TRANSFER-001");
    await salesSession.page.getByLabel("Reason or notes").fill("Partial payment for demo hotel");
    await salesSession.page.getByRole("button", { name: "Send to Owner for review" }).click();
    await expect(salesSession.page.getByText("Saved successfully.", { exact: true })).toBeVisible();
    const denied = await driverSession.ctx.request.get(`${base}/api/settlements/demo-booking`); if (denied.status() !== 403) throw new Error("Driver finance access was not rejected.");
    const deniedEvidence = await driverSession.ctx.request.get(`${base}/api/documents/settlement/${encodeURIComponent(bill!)}`); if (deniedEvidence.status() !== 403) throw new Error("Driver evidence access was not rejected.");
    const deniedAdjustment = await driverSession.ctx.request.get(`${base}/api/documents/adjustment/unknown`); if (deniedAdjustment.status() !== 403) throw new Error("Driver adjustment access was not rejected.");
    const other = await salesSession.ctx.request.get(`${base}/api/settlements/unassigned-booking`); if (other.status() !== 403) throw new Error("Unassigned sales access was not rejected.");
    const unauthenticated = await fetch(`${base}/api/settlements/demo-booking`); if (unauthenticated.status !== 401) throw new Error("Anonymous access was not rejected.");
    const snapshot = await (await driverSession.ctx.request.get(`${base}/api/crm`)).json();
    if (snapshot.bookings.some((b: any) => "totalMinor" in b || "outstandingMinor" in b || "agreementSnapshot" in b)) throw new Error("Driver snapshot leaks finance fields.");
    await expect(driverSession.page.getByRole("button", { name: "Money & changes", exact: true })).toHaveCount(0);
    await mkdir("output/qa", { recursive: true });
    await ownerSession.page.getByRole("button", { name: "Overview", exact: true }).click();
    await ownerSession.page.screenshot({ path: "output/qa/phase5-owner-desktop.png", fullPage: true });
    await salesSession.page.setViewportSize({ width: 390, height: 844 });
    const mobileNav = salesSession.page.getByRole("navigation", { name: "Primary mobile navigation" });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(mobileNav.getByRole("button", { name: "Leads" })).toBeVisible();
    await expect(mobileNav.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect(mobileNav.getByRole("button", { name: "Bookings" })).toBeVisible();
    await expect(salesSession.page.locator(".sidebar")).toBeHidden();
    await mobileNav.getByRole("button", { name: "More" }).click();
    const more = salesSession.page.getByRole("dialog", { name: "More navigation" });
    await expect(more).toBeVisible();
    await expect(more.getByRole("button", { name: "Customers" })).toBeVisible();
    await expect(more.getByRole("button", { name: "Quotations" })).toBeVisible();
    await expect(more.getByRole("button", { name: "Money & changes" })).toBeVisible();
    await salesSession.page.screenshot({ path: "output/qa/phase5-sales-mobile-more.png" });
    await more.getByRole("button", { name: "Money & changes" }).click();
    await salesSession.page.getByRole("button", { name: "Booking changes", exact: true }).click();
    await salesSession.page.getByRole("button", { name: "Request a change or cancellation" }).click();
    if (await salesSession.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error("Mobile layout has horizontal overflow.");
    await salesSession.page.screenshot({ path: "output/qa/phase5-sales-mobile.png", fullPage: true });
    await salesSession.ctx.setOffline(true); await expect(salesSession.page.getByRole("alert").filter({ hasText: "You are offline" })).toBeVisible(); await salesSession.ctx.setOffline(false);
    for (const label of ["Today", "Leads", "Tasks", "Bookings"]) {
      await mobileNav.getByRole("button", { name: label, exact: true }).click();
      await expect(salesSession.page.getByRole("heading", { name: label === "Leads" ? "Enquiries" : label, exact: true }).first()).toBeVisible();
      if (await salesSession.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`${label} has mobile horizontal overflow.`);
    }
    await driverSession.page.setViewportSize({ width: 390, height: 844 });
    const driverNav = driverSession.page.getByRole("navigation", { name: "Primary mobile navigation" });
    await expect(driverNav.getByRole("button", { name: "Trips" })).toBeVisible();
    await expect(driverNav.getByRole("button", { name: "Alerts" })).toBeVisible();
    await driverNav.getByRole("button", { name: "More" }).click();
    const driverMore = driverSession.page.getByRole("dialog", { name: "More navigation" });
    await expect(driverMore.getByText("Operations staff", { exact: true })).toBeVisible();
    await expect(driverMore.getByRole("button", { name: "Money & changes" })).toHaveCount(0);
    await driverMore.getByRole("button", { name: "Close", exact: true }).click();
    for (const label of ["Today", "Trips", "Tasks", "Alerts"]) {
      await driverNav.getByRole("button", { name: label, exact: true }).click();
      if (await driverSession.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`Operations ${label} has mobile horizontal overflow.`);
    }
    await ownerSession.page.setViewportSize({ width: 390, height: 844 });
    const ownerNav = ownerSession.page.getByRole("navigation", { name: "Primary mobile navigation" });
    await ownerNav.getByRole("button", { name: "More" }).click();
    const ownerMore = ownerSession.page.getByRole("dialog", { name: "More navigation" });
    await expect(ownerMore.getByRole("button", { name: "Import data" })).toBeVisible();
    await expect(ownerMore.getByRole("button", { name: "Team & setup" })).toBeVisible();
    const outageContext = await browser.newContext(), outagePage = await outageContext.newPage();
    await outagePage.goto(base);
    await outagePage.route("**/api/auth/sign-in/email", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Database temporarily unavailable" }) }));
    await outagePage.getByLabel("Email", { exact: true }).fill("sales@example.test"); await outagePage.getByLabel("Password", { exact: true }).fill(password);
    await outagePage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(outagePage.locator(".form-error[role='alert']")).toContainText("password has not been checked");
    if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
    console.log("PASS: isolated Owner/Sales/Operations logins; bounded customer search and Operations denial; role-scoped reports/CSV; PWA assets; fixed independently scrolling desktop navigation; UI bill approval and partial-payment submission; anonymous and cross-role/document denial; driver privacy; role-based mobile bottom navigation and More sheet; mobile layout; offline banner; database-outage login wording. Demo data existed only in the temporary database.");
  } finally { await browser?.close(); server?.kill(); await (await database.client()).close(); await replica.stop(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Smoke check failed"); process.exitCode = 1; });
