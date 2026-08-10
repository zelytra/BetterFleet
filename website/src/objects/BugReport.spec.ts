import { describe, expect, it } from "vitest";
import { formatReportDate } from "@/objects/BugReport.ts";

describe("formatReportDate", () => {
  it("renders the stored calendar date, not a timezone-shifted neighbour", () => {
    // A bare date parses as UTC midnight; formatting is pinned to UTC so every viewer reads the
    // day the backend stored, wherever they are.
    expect(formatReportDate("2024-11-02", "en")).toBe("November 2, 2024");
  });

  it("follows the active locale", () => {
    expect(formatReportDate("2024-11-02", "fr")).toBe("2 novembre 2024");
  });

  it("falls back to the raw value when the payload is not a date", () => {
    expect(formatReportDate("not-a-date", "en")).toBe("not-a-date");
  });

  it("renders nothing for a report without a date", () => {
    expect(formatReportDate("", "en")).toBe("");
  });
});
