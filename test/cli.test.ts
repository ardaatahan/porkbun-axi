import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch, type Registry } from "../src/cli/router.js";
import { homeCommand, rootHelp } from "../src/commands/home.js";
import { allCommands } from "../src/commands/porkbun.js";

const bin = fileURLToPath(new URL("../bin/porkbun-axi.js", import.meta.url));
const registry: Registry = { tool: "porkbun-axi", root: homeCommand, rootHelp, commands: allCommands, aliases: {} };

function child(...args: string[]) {
  return spawnSync("node", [bin, ...args], { encoding: "utf8", env: { ...process.env, PORKBUN_API_KEY: "", PORKBUN_SECRET_KEY: "" } });
}
function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let stdout = "";
beforeEach(() => {
  stdout = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => { stdout += String(chunk); return true; }) as typeof process.stdout.write);
  process.env.PORKBUN_API_KEY = "public-test-key";
  process.env.PORKBUN_SECRET_KEY = "secret-test-key";
  process.env.PORKBUN_BASE_URL = "https://api.test/v3";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.PORKBUN_API_KEY;
  delete process.env.PORKBUN_SECRET_KEY;
  delete process.env.PORKBUN_BASE_URL;
});

const cases: Array<{ name: string; argv: string[]; path: string; method?: string }> = [
  { name: "domains list", argv: ["domains", "list"], path: "/domain/listAll" },
  { name: "domains get", argv: ["domains", "get", "example.com"], path: "/domain/get/example.com" },
  { name: "domains check", argv: ["domains", "check", "example.com"], path: "/domain/checkDomain/example.com", method: "POST" },
  { name: "domains pricing", argv: ["domains", "pricing", "--tlds", "com,net"], path: "/pricing/get", method: "POST" },
  { name: "domains register", argv: ["domains", "register", "example.com", "--confirm"], path: "/domain/create/example.com", method: "POST" },
  { name: "dns list", argv: ["dns", "list", "example.com"], path: "/dns/retrieve/example.com" },
  { name: "dns get", argv: ["dns", "get", "example.com", "7"], path: "/dns/retrieve/example.com/7" },
  { name: "dns create", argv: ["dns", "create", "example.com", "--type", "A", "--name", "www", "--content", "192.0.2.1", "--ttl", "600"], path: "/dns/create/example.com", method: "POST" },
  { name: "dns update", argv: ["dns", "update", "example.com", "7", "--type", "A", "--name", "www", "--content", "192.0.2.2", "--confirm"], path: "/dns/edit/example.com/7", method: "POST" },
  { name: "dns delete", argv: ["dns", "delete", "example.com", "7", "--confirm"], path: "/dns/delete/example.com/7", method: "POST" },
  { name: "forwarding list", argv: ["forwarding", "list", "example.com"], path: "/domain/getUrlForwarding/example.com" },
  { name: "forwarding create", argv: ["forwarding", "create", "example.com", "--location", "https://example.net", "--type", "301"], path: "/domain/addUrlForward/example.com", method: "POST" },
  { name: "forwarding delete", argv: ["forwarding", "delete", "example.com", "9", "--confirm"], path: "/domain/deleteUrlForward/example.com/9", method: "POST" },
  { name: "ssl retrieve", argv: ["ssl", "retrieve", "example.com", "--json"], path: "/ssl/retrieve/example.com" },
  { name: "nameservers get", argv: ["nameservers", "get", "example.com"], path: "/domain/getNs/example.com" },
  { name: "nameservers set", argv: ["nameservers", "set", "example.com", "--servers", "ns1.example.net,ns2.example.net", "--confirm"], path: "/domain/updateNs/example.com", method: "POST" },
  { name: "glue list", argv: ["glue", "list", "example.com"], path: "/domain/getGlue/example.com" },
  { name: "glue create", argv: ["glue", "create", "example.com", "ns1", "--ips", "192.0.2.1"], path: "/domain/createGlue/example.com/ns1", method: "POST" },
  { name: "glue update", argv: ["glue", "update", "example.com", "ns1", "--ips", "192.0.2.2", "--confirm"], path: "/domain/updateGlue/example.com/ns1", method: "POST" },
  { name: "glue delete", argv: ["glue", "delete", "example.com", "ns1", "--confirm"], path: "/domain/deleteGlue/example.com/ns1", method: "POST" },
];

function successPayload(url: string): Record<string, unknown> {
  if (url.includes("checkDomain")) return { status: "SUCCESS", response: { avail: "yes", price: "9.73", premium: "no" } };
  if (url.endsWith("domain/listAll")) return { status: "SUCCESS", domains: [{ domain: "example.com", status: "ACTIVE", expireDate: "2027-01-01", autoRenew: 1, apiAccess: 1 }] };
  if (url.includes("dns/retrieve")) return { status: "SUCCESS", records: [{ id: "7", name: "www.example.com", type: "A", content: "192.0.2.1", ttl: "600", prio: "0" }] };
  if (url.includes("getUrlForwarding")) return { status: "SUCCESS", forwards: [] };
  if (url.includes("getNs")) return { status: "SUCCESS", ns: ["ns1.example.net", "ns2.example.net"] };
  if (url.includes("pricing/get")) return { status: "SUCCESS", pricing: { com: { registration: "9.73", renewal: "10.99", transfer: "9.73" } } };
  if (url.includes("ssl/retrieve")) return { status: "SUCCESS", certificatechain: "CERT", privatekey: "PRIVATE", publickey: "PUBLIC" };
  return { status: "SUCCESS", message: "done" };
}

describe("AXI shell contract", () => {
  it("no args, root help, group help, and unknown flags are deterministic", () => {
    expect(child().status).toBe(0);
    expect(child().stdout).toContain("capabilities[");
    expect(child("--help").stdout).toContain("domains list|get|check|pricing|register");
    expect(child("dns", "--help").stdout).toContain("porkbun-axi dns create");
    const invalid = child("--not-a-real-flag");
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toContain("valid flags");
    expect(child().stderr).toBe("");
  });
});

describe("all Porkbun commands", () => {
  for (const testCase of cases) {
    it(`${testCase.name} calls the documented endpoint and handles API errors`, async () => {
      const calls: Array<[string, RequestInit | undefined]> = [];
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input); calls.push([url, init]); return response(successPayload(url));
      }));
      expect(await dispatch(registry, testCase.argv)).toBe(0);
      const call = calls.find(([url]) => url.endsWith(testCase.path));
      expect(call, `missing call to ${testCase.path}`).toBeDefined();
      expect(call?.[1]?.method).toBe(testCase.method ?? "GET");
      expect(stdout).not.toContain("secret-test-key");
      stdout = "";
      vi.stubGlobal("fetch", vi.fn(async () => response({ status: "ERROR", code: "BAD_REQUEST", message: "rejected" }, 400)));
      expect(await dispatch(registry, testCase.argv)).toBe(1);
      expect(stdout).toContain("Porkbun API error (BAD_REQUEST): rejected");
    });
  }

  it("uses header auth, omits credentials from bodies, and idempotency-protects writes", async () => {
    let observed: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => { observed = init; return response({ status: "SUCCESS", id: "1" }); }));
    expect(await dispatch(registry, ["dns", "create", "example.com", "--type", "TXT", "--content", "verification"])).toBe(0);
    expect(observed?.headers).toMatchObject({ "X-API-Key": "public-test-key", "X-Secret-API-Key": "secret-test-key", "Idempotency-Key": expect.any(String) });
    expect(String(observed?.body)).not.toContain("secret-test-key");
  });

  it("reports missing credentials before making a request", async () => {
    delete process.env.PORKBUN_API_KEY;
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await dispatch(registry, ["domains", "list"])).toBe(1);
    expect(stdout).toContain("export PORKBUN_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates command-specific required flags before network access", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const argv of [
      ["dns", "create", "example.com", "--content", "x"],
      ["dns", "update", "example.com", "7", "--type", "A"],
      ["forwarding", "create", "example.com"],
      ["nameservers", "set", "example.com", "--servers", "ns1.example.net"],
      ["glue", "create", "example.com", "ns1"],
    ]) {
      stdout = "";
      expect(await dispatch(registry, argv)).toBe(2);
      expect(stdout).toContain("error:");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("confirmation gates", () => {
  const gates = [
    { argv: ["dns", "delete", "example.com", "7"], calls: 0, change: "delete DNS record" },
    { argv: ["dns", "update", "example.com", "7", "--type", "A", "--content", "192.0.2.2"], calls: 0, change: "replace DNS record" },
    { argv: ["forwarding", "delete", "example.com", "9"], calls: 0, change: "delete URL forward" },
    { argv: ["nameservers", "set", "example.com", "--servers", "ns1.example.net,ns2.example.net"], calls: 0, change: "replace all nameservers" },
    { argv: ["glue", "delete", "example.com", "ns1"], calls: 0, change: "delete glue" },
    { argv: ["glue", "update", "example.com", "ns1", "--ips", "192.0.2.2"], calls: 0, change: "update glue" },
    { argv: ["domains", "register", "example.com"], calls: 1, change: "price_usd: 9.73" },
  ];
  for (const gateCase of gates) {
    it(`refuses ${gateCase.argv.slice(0, 2).join(" ")} without --confirm and prints its preflight`, async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request) => response(successPayload(String(input))));
      vi.stubGlobal("fetch", fetchMock);
      expect(await dispatch(registry, gateCase.argv)).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(gateCase.calls);
      expect(stdout).toContain(gateCase.change);
      expect(stdout).toContain("--confirm");
    });
  }
});
