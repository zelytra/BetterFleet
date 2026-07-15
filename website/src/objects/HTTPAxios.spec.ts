import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above imports, so the mock fns must be created via vi.hoisted
// (which runs first) rather than referenced from ordinary top-level consts.
const { create, get, post, del } = vi.hoisted(() => {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();
  const patch = vi.fn();
  const create = vi.fn(() => ({ get, post, delete: del, patch }));
  return { create, get, post, del };
});

vi.mock("axios", () => ({ default: { create } }));

import { HTTPAxios } from "@/objects/HTTPAxios.ts";

describe("HTTPAxios", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
    del.mockClear();
    create.mockClear();
  });

  it("creates an axios instance with a 10s timeout", () => {
    new HTTPAxios("stats/download", null);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it("issues a GET to the backend host joined with the path", async () => {
    await new HTTPAxios("stats/all").get();
    // url = VITE_BACKEND_HOST + "/" ; get() calls axios.get(url + path)
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stats\/all$/));
  });

  it("issues a POST with the provided body to the joined path", async () => {
    const body = { message: "hi" };
    await new HTTPAxios("report/send", body).post();
    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/report\/send$/),
      body,
      undefined,
    );
  });
});
