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

/**
 * Installs a `fetch` double and hands back the handle to assert on.
 *
 * `global.fetch` is typed as bun's `fetch`, which carries a `preconnect` property no `vi.fn()` has,
 * so a bare assignment does not typecheck - and reading `global.fetch` back to inspect its calls
 * needs a second cast in the other direction. Both casts live here, once, and returning the handle
 * means no test performs either.
 */
function stubFetch(mock: Mock): Mock {
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("Avatar API Endpoints", () => {
  it("serves the MiGallery photo for a person who has one", async () => {
    // Arrange
    (getPersonById as Mock).mockReturnValue(null);

    const fetchMock = stubFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        headers: { get: () => "image/jpeg" },
      }),
    );

    const requestEvent = {
      params: { id: "remote.user" },
    } as unknown as RequestEvent<{ id: string }, "/api/avatar/[id]">;

    // Act
    const response: Response = await getAvatar(requestEvent);

    // Assert
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
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
    const fetchMock = stubFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: { get: () => "image/jpeg" },
      }),
    );

    await getAvatar(eventFor("remote.user"));

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("draws initials, not a 500, when the fetch never lands - and says so", async () => {
    const timedOut = new Error("The operation was aborted due to timeout");
    timedOut.name = "TimeoutError";
    stubFetch(vi.fn().mockRejectedValue(timedOut));

    const response = await getAvatar(eventFor("remote.user"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    // The absence is not an answer, so it is not remembered as one.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(console.error).toHaveBeenCalled();
  });

  it("accuses on a refused key, and stays silent on a genuine 404", async () => {
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: { get: () => null },
      }),
    );
    await getAvatar(eventFor("remote.user"));
    expect(String((console.error as Mock).mock.calls[0][0])).toContain("403");

    (console.error as Mock).mockClear();
    stubFetch(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
      }),
    );
    await getAvatar(eventFor("remote.user"));
    expect(console.error).not.toHaveBeenCalled();
  });
});
