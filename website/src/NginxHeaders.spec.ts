import { describe, expect, it } from "vitest";
import websiteConf from "../nginx.conf?raw";

// The security headers the website container sends (#914). nginx's add_header does not inherit
// into a location that sets its own, so a header present in one block says nothing about the next
// one: each location is checked on its own.

/** The `location <path> {` block, braces matched. `path` is the exact token in the file. */
function locationBlock(conf: string, path: string): string {
  const lines = conf.split("\n");
  const start = lines.findIndex((line) => {
    const tokens = line.trim().split(/\s+/);
    return (
      tokens[0] === "location" &&
      tokens[tokens.length - 1] === "{" &&
      tokens[tokens.length - 2] === path
    );
  });
  if (start < 0) throw new Error(`no location block for ${path}`);
  const body: string[] = [];
  let depth = 0;
  for (const line of lines.slice(start)) {
    depth += (line.match(/{/g) ?? []).length;
    depth -= (line.match(/}/g) ?? []).length;
    body.push(line);
    if (depth === 0) break;
  }
  return body.join("\n");
}

const HSTS = /add_header Strict-Transport-Security "max-age=\d+" always;/;
const STATIC_FILES =
  "\\.(?:ico|svg|png|jpg|jpeg|webp|gif|woff2?|ttf|otf|eot|json|txt|xml|webmanifest)$";

describe("website/nginx.conf", () => {
  it.each(["/assets/", STATIC_FILES, "/"])("sends HSTS on %s", (path) => {
    expect(locationBlock(websiteConf, path)).toMatch(HSTS);
  });

  // Not every betterfleet.fr subdomain is known to serve HTTPS (#849).
  it("does not pin subdomains", () => {
    expect(websiteConf).not.toMatch(
      /Strict-Transport-Security "[^"]*includeSubDomains/,
    );
  });

  it("ships a report-only CSP locked to the site's own origin", () => {
    const csp = locationBlock(websiteConf, "/").match(
      /add_header Content-Security-Policy-Report-Only "([^"]+)" always;/,
    );
    const directives = csp?.[1] ?? "";
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("script-src 'self';");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("frame-ancestors 'self'");
    // The release card reads GitHub's API straight from the browser (Github.ts).
    expect(directives).toMatch(/connect-src [^;]*https:\/\/api\.github\.com/);
  });
});
