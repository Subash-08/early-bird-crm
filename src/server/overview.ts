import type { Actor } from "@/lib/domain";
import { enquiryMembership } from "@/lib/domain";
import { indiaInput, indiaIso } from "@/lib/workspace-time";
import { collection } from "./db";
import { acceptedQuotesWithoutBooking } from "./accepted-quote-queue";

const activeTask = ["To do", "In progress", "Waiting"];
const activeEnquiry = ["New", "Contacting", "Gathering details", "Quote requested", "Quote sent", "On hold"];
const activeQuote = ["Requested", "Draft", "Needs information", "Changes requested", "Approved", "Sent"];
const activeBooking = { $nin: ["Cancelled", "Trip completed"] };
const queueSize = 5;

export async function workspaceOverview(actor: Actor, now = new Date()) {
  const { org, id, role } = actor;
  const tomorrow = indiaInput(new Date(now.getTime() + 86_400_000).toISOString()).slice(0, 10);
  const endOfDay = indiaIso(`${tomorrow}T00:00`);
  const currentTime = now.toISOString();
  const taskScope = { org, ...(role === "owner" ? {} : { assigneeId: id }), status: { $in: activeTask } };
  const dueScope = { ...taskScope, dueAt: { $type: "string" as const, $gt: "", $lt: endOfDay } };
  const bookingScope = {
    org, status: activeBooking,
    ...(role === "sales" ? { salesAssigneeId: id } : role === "operations" ? { operationsReleased: true, operationsAssigneeIds: id } : {}),
  };
  const enquiries = await collection("enquiries");
  const tasks = await collection("tasks");
  const bookings = await collection("bookings");
  const notifications = await collection("notifications");
  const alertsScope = { org, recipient: id, read: { $ne: true } };

  const crmQueue = async () => {
    if (role === "operations") return null;
    const enquiryScope = { org, ...(role === "owner" ? {} : enquiryMembership(id)), stage: { $in: activeEnquiry } };
    const quotes = await collection("quotes");
    const teamEnquiryIds = role === "sales"
      ? await enquiries.distinct("_id", { org, $or: [{ createdById: id }, { collaboratorIds: id }] })
      : [];
    const quoteAccess = role === "sales" ? {
      $or: [{ assigneeId: id }, { enquiryId: { $in: teamEnquiryIds } }],
    } : {};
    const quoteScope = { org, status: { $in: activeQuote }, ...quoteAccess };
    const [enquiryCount, enquiryRows, quoteCount, quoteRows, accepted] = await Promise.all([
      enquiries.countDocuments(enquiryScope),
      enquiries.find(enquiryScope, { projection: { customerId: 1, destination: 1, stage: 1, reviewNeeded: 1 } })
        .sort({ updatedAt: -1, _id: 1 }).limit(queueSize).toArray(),
      quotes.countDocuments(quoteScope),
      quotes.find(quoteScope, { projection: { quoteNumber: 1, status: 1, "content.title": 1, pdfStatus: 1 } })
        .sort({ updatedAt: -1, _id: 1 }).limit(queueSize).toArray(),
      acceptedQuotesWithoutBooking(org, quoteAccess, queueSize),
    ]);
    const customerNames = new Map((await (await collection("customers")).find(
      { org, _id: { $in: enquiryRows.map(row => row.customerId) } }, { projection: { name: 1 } },
    ).toArray()).map(row => [row._id, row.name as string]));
    return {
      enquiryCount,
      enquiries: enquiryRows.map(row => ({
        id: row._id, customer: customerNames.get(row.customerId) || "",
        destination: String(row.destination || ""), stage: row.reviewNeeded ? "Needs review" : String(row.stage),
      })),
      quoteCount: quoteCount + accepted.count,
      quotes: [...accepted.rows, ...quoteRows].slice(0, queueSize).map(row => ({
        id: row._id, number: String(row.quoteNumber || ""), title: String(row.content?.title || ""),
        status: String(row.status), pdfStatus: String(row.pdfStatus || ""),
      })),
    };
  };

  const [openTaskCount, overdueCount, dueCount, dueTasks, upcomingTasks, bookingCount, bookingRows, unreadCount, alerts, crm] = await Promise.all([
    tasks.countDocuments(taskScope),
    tasks.countDocuments({ ...dueScope, dueAt: { $gt: "", $lt: currentTime } }),
    tasks.countDocuments(dueScope),
    tasks.find(dueScope, { projection: { title: 1, dueAt: 1, status: 1, assigneeId: 1 } })
      .sort({ dueAt: 1, _id: 1 }).limit(queueSize).toArray(),
    tasks.find({ ...taskScope, dueAt: { $gte: endOfDay } }, { projection: { title: 1, dueAt: 1, status: 1, assigneeId: 1 } })
      .sort({ dueAt: 1, _id: 1 }).limit(queueSize).toArray(),
    bookings.countDocuments(bookingScope),
    bookings.find(bookingScope, { projection: { bookingNumber: 1, destination: 1, status: 1, serviceStart: 1, serviceEnd: 1 } })
      .sort({ updatedAt: -1, _id: 1 }).limit(queueSize).toArray(),
    notifications.countDocuments(alertsScope),
    notifications.find(alertsScope, { projection: { title: 1, recordId: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: 1 }).limit(queueSize).toArray(),
    crmQueue(),
  ]);
  const taskSummary = (rows: typeof dueTasks) => rows.map(row => ({
    id: row._id, title: String(row.title || "Task"), status: String(row.status), dueAt: String(row.dueAt),
    assigneeId: String(row.assigneeId || ""), overdue: row.dueAt < currentTime,
  }));
  return {
    openTaskCount, overdueCount, dueCount, dueTasks: taskSummary(dueTasks), upcomingTasks: taskSummary(upcomingTasks),
    bookingCount, bookings: bookingRows.map(row => ({
      id: row._id, number: String(row.bookingNumber || ""), destination: String(row.destination || ""),
      status: String(row.status || ""), startDate: String(row.serviceStart || ""), endDate: String(row.serviceEnd || ""),
    })),
    unreadCount, alerts: alerts.map(row => ({
      id: row._id, title: String(row.title || "Workspace update"), recordId: String(row.recordId || ""), createdAt: String(row.createdAt || ""),
    })),
    crm,
  };
}
