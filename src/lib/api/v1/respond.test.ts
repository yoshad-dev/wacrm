import { describe, it, expect } from "vitest";
import {
  ApiError,
  unauthorized,
  forbidden,
  badRequest,
  rateLimited,
  ok,
  toApiErrorResponse,
} from "./respond";

describe("ApiError class", () => {
  it("stores code, status, message, and headers", () => {
    const err = new ApiError("rate_limited", "slow down", 429, {
      "Retry-After": "60",
    });
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
    expect(err.message).toBe("slow down");
    expect(err.headers).toEqual({ "Retry-After": "60" });
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("works without headers", () => {
    const err = new ApiError("internal", "oops", 500);
    expect(err.headers).toBeUndefined();
  });
});

describe("error factory functions", () => {
  it("unauthorized() returns 401 with default message", () => {
    const err = unauthorized();
    expect(err.code).toBe("unauthorized");
    expect(err.status).toBe(401);
    expect(err.message).toBe("Missing or invalid API key");
  });

  it("unauthorized() accepts custom message", () => {
    const err = unauthorized("Token expired");
    expect(err.message).toBe("Token expired");
  });

  it("forbidden() returns 403", () => {
    const err = forbidden("Scope contacts:write required");
    expect(err.code).toBe("forbidden");
    expect(err.status).toBe(403);
    expect(err.message).toBe("Scope contacts:write required");
  });

  it("badRequest() returns 400", () => {
    const err = badRequest("Missing field: name");
    expect(err.code).toBe("bad_request");
    expect(err.status).toBe(400);
    expect(err.message).toBe("Missing field: name");
  });

  it("rateLimited() returns 429 with rate-limit headers", () => {
    const now = Date.now();
    const result = { success: false, limit: 100, remaining: 0, reset: now + 30_000 };
    const err = rateLimited(result);
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
    expect(err.headers?.["Retry-After"]).toBeDefined();
    expect(Number(err.headers!["Retry-After"])).toBeGreaterThan(0);
    expect(err.headers!["X-RateLimit-Limit"]).toBe("100");
    expect(err.headers!["X-RateLimit-Remaining"]).toBe("0");
  });
});

describe("ok()", () => {
  it("wraps payload in { data } envelope with 200", async () => {
    const resp = ok({ id: "123", name: "Test" });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({ data: { id: "123", name: "Test" } });
  });

  it("respects custom status", async () => {
    const resp = ok(null, 201);
    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body).toEqual({ data: null });
  });
});

describe("toApiErrorResponse()", () => {
  it("maps ApiError to its code/status/headers", async () => {
    const err = new ApiError("forbidden", "no access", 403, {
      "X-Custom": "yes",
    });
    const resp = toApiErrorResponse(err);
    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body).toEqual({
      error: { code: "forbidden", message: "no access" },
    });
    expect(resp.headers.get("X-Custom")).toBe("yes");
  });

  it("collapses unknown errors to 500 internal", async () => {
    const resp = toApiErrorResponse(new TypeError("something broke"));
    expect(resp.status).toBe(500);
    const body = await resp.json();
    expect(body).toEqual({
      error: { code: "internal", message: "Internal server error" },
    });
  });

  it("handles non-Error thrown values", async () => {
    const resp = toApiErrorResponse("string error");
    expect(resp.status).toBe(500);
    const body = await resp.json();
    expect(body.error.code).toBe("internal");
  });
});
