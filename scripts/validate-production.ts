const required = ["MONGODB_URI", "MONGODB_DB_NAME", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "APP_ORG_ID", "JOB_RUNNER_SECRET"] as const;
const problems: string[] = [];
for (const key of required) if (!process.env[key]?.trim()) problems.push(`${key} is missing.`);
const url = process.env.BETTER_AUTH_URL || "";
if (url && !url.startsWith("https://")) problems.push("BETTER_AUTH_URL must use HTTPS in production.");
if (/localhost|127\.0\.0\.1/i.test(url)) problems.push("BETTER_AUTH_URL still points to localhost.");
const database = process.env.MONGODB_DB_NAME || "";
if (/dev|test|sample/i.test(database)) problems.push("MONGODB_DB_NAME looks like a development/test database.");
const authSecret = process.env.BETTER_AUTH_SECRET || "";
const jobSecret = process.env.JOB_RUNNER_SECRET || "";
if (authSecret.length < 32) problems.push("BETTER_AUTH_SECRET must contain at least 32 characters.");
if (jobSecret.length < 32) problems.push("JOB_RUNNER_SECRET must contain at least 32 characters.");
if (authSecret && authSecret === jobSecret) problems.push("Authentication and scheduler secrets must be different.");
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
  problems.push("Cloudinary credentials are not complete; external asset storage cannot be activated.");
if (problems.length) {
  console.error("Production configuration is not ready:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else console.log("Production configuration names and safety rules are valid. Secret values were not printed.");
