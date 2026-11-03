import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), close: vi.fn() }));
vi.mock("mongodb", () => ({ MongoClient: class { connect = mocks.connect; close = mocks.close; } }));
afterEach(() => { vi.resetModules(); vi.clearAllMocks(); });
it("retries a fresh connection after a failed initial Atlas connection", async () => {
  process.env.MONGODB_URI = "mongodb://test.invalid";
  mocks.close.mockResolvedValue(undefined);
  mocks.connect.mockRejectedValueOnce(new Error("Server selection timed out after 8000 ms"));
  const good = { marker: "connected" }; mocks.connect.mockResolvedValueOnce(good);
  const { client } = await import("../src/server/db");
  await expect(client()).rejects.toThrow("Server selection");
  expect(await client()).toBe(good); expect(await client()).toBe(good);
  expect(mocks.connect).toHaveBeenCalledTimes(2);
});
