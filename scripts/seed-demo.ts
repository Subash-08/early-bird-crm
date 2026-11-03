import { client, collection, indexes, org } from "../src/server/db";

const iso = (offsetDays = 0, hour = 10) => {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};

const fixtures = [
  ["ananya", "Ananya & Karthik", "+919900000101", "ananya.demo@example.test", "Munnar and Alleppey", "New", 1],
  ["rahul", "Rahul Menon", "+919900000102", "rahul.demo@example.test", "Ooty and Coonoor", "Contacting", 2],
  ["meera", "Meera Krishnan", "+919900000103", "meera.demo@example.test", "Goa", "Gathering details", 3],
  ["arjun", "Arjun & Nila", "+919900000104", "arjun.demo@example.test", "Kodaikanal", "On hold", 10],
  ["farah", "Farah Khan", "+919900000105", "farah.demo@example.test", "Jaipur and Udaipur", "Gathering details", 5],
  ["dev", "Dev Patel", "+919900000106", "dev.demo@example.test", "Manali and Shimla", "New", 6],
  ["sneha", "Sneha Iyer", "+919900000107", "sneha.demo@example.test", "Andaman", "Contacting", 7],
  ["vikram", "Vikram Rao", "+919900000108", "vikram.demo@example.test", "Coorg", "Lost", 14],
] as const;

async function main() {
  if (process.env.APP_ENV !== "development" || !process.argv.includes("--confirm-demo")) {
    throw new Error("Demo seed is development-only. Set APP_ENV=development and use the db:seed-demo script.");
  }
  await indexes();
  const agency = org();
  const staff = await collection("staff");
  const assignee =
    (await staff.findOne({ org: agency, role: "sales", status: "active" })) ||
    (await staff.findOne({ org: agency, role: "owner", status: "active" }));
  if (!assignee) throw new Error("Activate an Owner or Sales account before adding demo data.");

  const customers = await collection("customers");
  const enquiries = await collection("enquiries");
  const tasks = await collection("tasks");
  const notifications = await collection("notifications");
  const createdAt = iso(-1);

  await customers.bulkWrite(
    fixtures.map(([key, name, phone, email]) => ({
      updateOne: {
        filter: { _id: `demo:customer:${key}`, org: agency },
        update: {
          $setOnInsert: {
            org: agency,
            version: 1,
            name,
            phone,
            email,
            language: "English",
            address: "",
            notes: "Fictional record created for manual CRM testing.",
            reviewNeeded: false,
            assigneeId: assignee._id,
            demoSeed: true,
            createdAt,
            updatedAt: createdAt,
          },
        },
        upsert: true,
      },
    })),
  );

  await enquiries.bulkWrite(
    fixtures.map(([key, , , , destination, stage, dueDays], index) => ({
      updateOne: {
        filter: { _id: `demo:enquiry:${key}`, org: agency },
        update: {
          $setOnInsert: {
            org: agency,
            version: 1,
            customerId: `demo:customer:${key}`,
            destination,
            source: index % 2 ? "Phone" : "WhatsApp",
            assigneeId: assignee._id,
            stage,
            firstContactAt: iso(-2),
            dateMode: "Flexible",
            departure: iso(45).slice(0, 10),
            returnDate: iso(50).slice(0, 10),
            travelPreference: "Travel dates can move by two days",
            adults: 2,
            childrenAges: "",
            infants: 0,
            budget: "75000",
            budgetBasis: "Total",
            services: "Hotel, private car and sightseeing",
            serviceResponsibility: "Agency arranged hotel and car",
            hotelPreference: "Comfortable 3 or 4 star stay",
            rooms: "1 double room",
            pickup: "To be confirmed",
            dropoff: "To be confirmed",
            specialRequirements: "",
            notes: "Fictional enquiry for testing. Do not contact.",
            reason: stage === "Lost" ? "Demo: customer postponed travel" : "",
            nextAction: stage === "Lost" ? "" : "Call and confirm travel preferences",
            nextFollowUp: stage === "Lost" ? "" : iso(dueDays, 11),
            contactOutcome: stage === "New" ? "Not contacted" : "Connected",
            reviewNeeded: false,
            acknowledgedAt: stage === "New" ? "" : iso(-1),
            demoSeed: true,
            createdAt,
            updatedAt: createdAt,
          },
        },
        upsert: true,
      },
    })),
  );

  await tasks.bulkWrite(
    fixtures
      .filter(([, , , , , stage]) => stage !== "Lost")
      .map(([key, name, , , , , dueDays]) => ({
        updateOne: {
          filter: { _id: `demo:task:${key}`, org: agency },
          update: {
            $setOnInsert: {
              org: agency,
              version: 1,
              assigneeId: assignee._id,
              enquiryId: `demo:enquiry:${key}`,
              customerId: `demo:customer:${key}`,
              title: `Follow up with ${name}`,
              dueAt: iso(dueDays, 11),
              status: "To do",
              demoSeed: true,
              createdAt,
              updatedAt: createdAt,
            },
          },
          upsert: true,
        },
      })),
  );

  await notifications.updateOne(
    { _id: "demo:notification:welcome", org: agency },
    {
      $setOnInsert: {
        org: agency,
        version: 1,
        recipient: assignee._id,
        title: "Demo enquiries are ready for testing",
        recordId: "demo:enquiry:ananya",
        read: false,
        demoSeed: true,
        createdAt,
      },
    },
    { upsert: true },
  );

  console.log(`Demo data ready for ${assignee.name}: ${fixtures.length} customers, ${fixtures.length} enquiries and ${fixtures.length - 1} tasks.`);
  console.log("The script is idempotent and never overwrites an existing demo record.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await (await client()).close();
    } catch {}
  });
