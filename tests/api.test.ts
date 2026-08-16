import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { GET as getAvatar } from "../src/routes/api/avatar/[id]/+server";
import { getPersonById, getPersonAuthSub } from "$lib/server/database";

// Mock database module
vi.mock("$lib/server/database", () => ({
  getPersonById: vi.fn(),
  getPersonAuthSub: vi.fn(() => "photo-key"),
  getDatabase: vi.fn(),
}));

// The route reads its key ONCE, at module scope. A plain assignment here runs after the import
// above - ES imports are hoisted - so the module would have already decided the key was missing and
// answered 500 to every case below. `vi.hoisted` is the only thing that runs first.
vi.hoisted(() => {
  process.env.MIGALLERY_API_KEY = "mock-key";
});

describe("Avatar API Endpoints", () => {
  it("returns redirect to database image if present", async () => {
    // Arrange
    const mockPerson = {
      id: "test.user",
      image: "https://example.com/avatar.jpg",
    };
    (getPersonById as Mock).mockReturnValue(mockPerson);

    const requestEvent = {
      params: { id: "test.user" },
    } as unknown as RequestEvent<{ id: string }, "/api/avatar/[id]">;

    // Act
    const response: Response = await getAvatar(requestEvent);

    // Assert
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://example.com/avatar.jpg",
    );
  });

  it("falls back to fetch if no database image", async () => {
    // Arrange
    (getPersonById as Mock).mockReturnValue(null);

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      headers: { get: () => "image/jpeg" },
    });

    const requestEvent = {
      params: { id: "remote.user" },
    } as unknown as RequestEvent<{ id: string }, "/api/avatar/[id]">;

    // Act
    const response: Response = await getAvatar(requestEvent);

    // Assert
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("gallery.mitv.fr"),
      expect.any(Object),
    );
  });
});

/**
 * An avatar is a DECORATION. MiGallery being slow, down, or refusing our key may cost the caller
 * its initials - never an error, and never a wait with no end. These three pin the difference the
 * status code alone cannot carry: "this person has no photo" is silent, everything else accuses.
 */
describe("Avatar API degrades on an upstream it cannot use", () => {
  const eventFor = (id: string) =>
    ({ params: { id } }) as unknown as RequestEvent<
      { id: string },
      "/api/avatar/[id]"
    >;

  beforeEach(() => {
    (getPersonById as Mock).mockReturnValue(null);
    (getPersonAuthSub as Mock).mockReturnValue("photo-key");
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives MiGallery a stated deadline instead of waiting forever", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      headers: { get: () => "image/jpeg" },
    });

    await getAvatar(eventFor("remote.user"));

    const init = (global.fetch as Mock).mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("draws initials, not a 500, when the fetch never lands - and says so", async () => {
    const timedOut = new Error("The operation was aborted due to timeout");
    timedOut.name = "TimeoutError";
    global.fetch = vi.fn().mockRejectedValue(timedOut);

    const response = await getAvatar(eventFor("remote.user"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    // The absence is not an answer, so it is not remembered as one.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(console.error).toHaveBeenCalled();
  });

  it("accuses on a refused key, and stays silent on a genuine 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
    });
    await getAvatar(eventFor("remote.user"));
    expect(String((console.error as Mock).mock.calls[0][0])).toContain("403");

    (console.error as Mock).mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    });
    await getAvatar(eventFor("remote.user"));
    expect(console.error).not.toHaveBeenCalled();
  });
});
