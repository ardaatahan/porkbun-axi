import type { Parsed } from "../cli/args.js";
import type { CommandModule } from "../cli/router.js";
import type { FlagSpec } from "../cli/spec.js";
import { encodePath, request } from "../api.js";
import { UsageError } from "../output/errors.js";
import { emitBlock, emitKV, emitList, print } from "../output/toon.js";

type Data = Record<string, unknown>;
const jsonFlag: FlagSpec = { name: "json", type: "boolean", description: "emit the complete API response as JSON" };
const confirmFlag: FlagSpec = { name: "confirm", type: "boolean", description: "confirm the described destructive or billable change" };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Data).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  }
  return value;
}

function output(data: Data, parsed: Parsed, collection?: string, fields?: string[]): void {
  if (parsed.flags.json) {
    print(JSON.stringify(stable(data)));
    return;
  }
  const rows = collection ? data[collection] : undefined;
  if (collection && Array.isArray(rows)) {
    if (rows.length === 0) {
      print(`${collection}: 0 found`);
      return;
    }
    const normalized: Data[] = rows.map((row) => row && typeof row === "object" ? row as Data : { value: row });
    const selected = fields ?? Object.keys(normalized[0] ?? {}).filter((key) => typeof normalized[0]?.[key] !== "object");
    print(emitList(collection, normalized, selected));
    return;
  }
  const entries = Object.entries(data).filter(([key]) => key !== "status").map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(stable(value)) : value] as [string, unknown]);
  print(emitKV([["status", data.status ?? "SUCCESS"], ...entries]));
}

function integer(value: unknown, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new UsageError(`--${flag} must be a non-negative integer`);
  return parsed;
}

function gate(parsed: Parsed, change: string): void {
  print(`change: ${change}`);
  if (!parsed.flags.confirm) throw new UsageError("confirmation required", `review the change above, then rerun with --confirm`);
}

function command(name: string, summary: string, args: Array<[string, string]>, flags: FlagSpec[], examples: string[], run: (parsed: Parsed) => Promise<void>): CommandModule {
  return {
    spec: { name, summary, args: args.map(([arg, description]) => ({ name: arg, required: true, description })), flags, examples },
    async run(parsed) { await run(parsed); return 0; },
  };
}

export const domainsList = command("domains list", "List domains in the account", [], [jsonFlag], ["porkbun-axi domains list"], async (p) => {
  output(await request<Data>("/domain/listAll"), p, "domains", ["domain", "status", "expireDate", "autoRenew"]);
});

export const domainsGet = command("domains get", "Get details for one domain", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi domains get example.com"], async (p) => {
  output(await request<Data>(`/domain/get/${encodePath(p.positionals[0]!)}`), p);
});

export const domainsCheck = command("domains check", "Check availability and current prices", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi domains check example.com"], async (p) => {
  output(await request<Data>(`/domain/checkDomain/${encodePath(p.positionals[0]!)}`, { method: "POST" }), p);
});

export const domainsPricing = command("domains pricing", "Retrieve public registration, renewal, and transfer pricing", [], [
  { name: "tlds", type: "string", description: "comma-separated TLDs to include" }, jsonFlag,
], ["porkbun-axi domains pricing --tlds com,net", "porkbun-axi domains pricing --json"], async (p) => {
  const tlds = p.flags.tlds ? String(p.flags.tlds).split(",").map((v) => v.trim().replace(/^\./, "")).filter(Boolean) : undefined;
  const data = tlds ? await request<Data>("/pricing/get", { public: true, method: "POST", body: { tlds } }) : await request<Data>("/pricing/get", { public: true });
  if (p.flags.json) return output(data, p);
  const pricing = data.pricing as Record<string, Data>;
  const rows = Object.entries(pricing ?? {}).map(([tld, prices]) => ({ tld, ...prices }));
  print(rows.length ? emitList("pricing", rows, ["tld", "registration", "renewal", "transfer"]) : "pricing: 0 found");
});

export const domainsRegister = command("domains register", "Register a domain after a price preflight", [["domain", "available domain name"]], [confirmFlag, jsonFlag, { name: "whois-privacy", type: "string", values: ["on", "off"], description: "override WHOIS privacy" }], ["porkbun-axi domains register example.com", "porkbun-axi domains register example.com --confirm"], async (p) => {
  const domain = p.positionals[0]!;
  const quote = await request<Data>(`/domain/checkDomain/${encodePath(domain)}`, { method: "POST" });
  const detail = quote.response as Data;
  const price = String(detail?.price ?? "unknown");
  print(emitKV([["domain", domain], ["availability", detail?.avail ?? "unknown"], ["price_usd", price], ["premium", detail?.premium ?? "unknown"]]));
  if (!p.flags.confirm) throw new UsageError("registration confirmation required", "verify availability and price above, accept Porkbun terms, then rerun with --confirm");
  if (detail?.avail !== "yes" && detail?.avail !== "available") throw new UsageError(`${domain} is not available for registration`);
  if (detail?.premium === "yes" || detail?.premium === true) throw new UsageError(`${domain} is a premium domain and cannot be registered through the Porkbun API`);
  const cents = Math.round(Number(price) * 100);
  if (!Number.isFinite(cents)) throw new UsageError("Porkbun did not return a usable registration price", "retry domains check before registering");
  const body: Data = { cost: cents, agreeToTerms: "yes" };
  if (p.flags["whois-privacy"]) body.whoisPrivacy = p.flags["whois-privacy"] === "on";
  output(await request<Data>(`/domain/create/${encodePath(domain)}`, { method: "POST", body, idempotent: true }), p);
});

export const dnsList = command("dns list", "List editable DNS records", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi dns list example.com"], async (p) => {
  output(await request<Data>(`/dns/retrieve/${encodePath(p.positionals[0]!)}`), p, "records", ["id", "name", "type", "content"]);
});
export const dnsGet = command("dns get", "Get a DNS record by ID", [["domain", "domain name"], ["id", "record ID"]], [jsonFlag], ["porkbun-axi dns get example.com 123"], async (p) => {
  output(await request<Data>(`/dns/retrieve/${encodePath(p.positionals[0]!)}/${encodePath(p.positionals[1]!)}`), p, "records", ["id", "name", "type", "content"]);
});

const recordFlags: FlagSpec[] = [
  { name: "name", type: "string", description: "subdomain, blank for the zone apex" },
  { name: "type", type: "string", description: "DNS type such as A, AAAA, CNAME, MX, TXT, SRV, CAA, or ALIAS" },
  { name: "content", type: "string", description: "record value" },
  { name: "ttl", type: "string", description: "TTL in seconds" },
  { name: "priority", type: "string", description: "MX or SRV priority" },
  { name: "notes", type: "string", description: "private record notes" },
  jsonFlag,
];
function recordBody(p: Parsed, defaultApex = false): Data {
  if (!p.flags.type) throw new UsageError("--type is required");
  if (!p.flags.content) throw new UsageError("--content is required");
  const body: Data = { type: p.flags.type, content: p.flags.content };
  if (p.flags.name !== undefined || defaultApex) body.name = p.flags.name ?? "";
  const ttl = integer(p.flags.ttl, "ttl"); if (ttl !== undefined) body.ttl = ttl;
  const prio = integer(p.flags.priority, "priority"); if (prio !== undefined) body.prio = prio;
  if (p.flags.notes !== undefined) body.notes = p.flags.notes;
  return body;
}
export const dnsCreate = command("dns create", "Create a DNS record", [["domain", "domain name"]], recordFlags, ["porkbun-axi dns create example.com --type A --name www --content 192.0.2.1 --ttl 600"], async (p) => {
  const body = recordBody(p, true);
  print(`change: create ${body.type} record '${body.name || "@"}' on ${p.positionals[0]} -> ${body.content}`);
  output(await request<Data>(`/dns/create/${encodePath(p.positionals[0]!)}`, { method: "POST", body, idempotent: true }), p);
});
export const dnsUpdate = command("dns update", "Replace a DNS record by ID", [["domain", "domain name"], ["id", "record ID"]], [...recordFlags, confirmFlag], ["porkbun-axi dns update example.com 123 --type A --name www --content 192.0.2.2", "porkbun-axi dns update example.com 123 --type A --content 192.0.2.2 --confirm"], async (p) => {
  const body = recordBody(p);
  gate(p, `replace DNS record ${p.positionals[1]} on ${p.positionals[0]} with ${JSON.stringify(stable(body))}`);
  output(await request<Data>(`/dns/edit/${encodePath(p.positionals[0]!)}/${encodePath(p.positionals[1]!)}`, { method: "POST", body, idempotent: true }), p);
});
export const dnsDelete = command("dns delete", "Delete a DNS record by ID", [["domain", "domain name"], ["id", "record ID"]], [confirmFlag, jsonFlag], ["porkbun-axi dns delete example.com 123", "porkbun-axi dns delete example.com 123 --confirm"], async (p) => {
  gate(p, `delete DNS record ${p.positionals[1]} from ${p.positionals[0]}`);
  output(await request<Data>(`/dns/delete/${encodePath(p.positionals[0]!)}/${encodePath(p.positionals[1]!)}`, { method: "POST", idempotent: true }), p);
});

export const forwardingList = command("forwarding list", "List URL forwards", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi forwarding list example.com"], async (p) => {
  output(await request<Data>(`/domain/getUrlForwarding/${encodePath(p.positionals[0]!)}`), p, "forwards", ["id", "subdomain", "location", "redirectType"]);
});
export const forwardingCreate = command("forwarding create", "Create a URL forward", [["domain", "domain name"]], [
  { name: "subdomain", type: "string", default: "", description: "subdomain, blank for the root" },
  { name: "location", type: "string", description: "destination URL" },
  { name: "type", type: "string", default: "302", values: ["301", "302", "307", "masked"], description: "redirect type" },
  { name: "include-path", type: "boolean", description: "append the incoming path" },
  { name: "wildcard", type: "boolean", description: "also forward matching subdomains" }, jsonFlag,
], ["porkbun-axi forwarding create example.com --subdomain www --location https://example.net --type 301"], async (p) => {
  if (!p.flags.location) throw new UsageError("--location is required");
  const kind = String(p.flags.type);
  const body = { subdomain: p.flags.subdomain, location: p.flags.location, type: kind === "301" ? "permanent" : kind === "masked" ? "masked" : "temporary", redirectType: kind, includePath: p.flags["include-path"] ? "yes" : "no", wildcard: p.flags.wildcard ? "yes" : "no" };
  print(`change: forward ${String(body.subdomain) || "@"}.${p.positionals[0]} to ${body.location} (${kind})`);
  output(await request<Data>(`/domain/addUrlForward/${encodePath(p.positionals[0]!)}`, { method: "POST", body, idempotent: true }), p);
});
export const forwardingDelete = command("forwarding delete", "Delete a URL forward by ID", [["domain", "domain name"], ["id", "forward ID"]], [confirmFlag, jsonFlag], ["porkbun-axi forwarding delete example.com 123 --confirm"], async (p) => {
  gate(p, `delete URL forward ${p.positionals[1]} from ${p.positionals[0]}`);
  output(await request<Data>(`/domain/deleteUrlForward/${encodePath(p.positionals[0]!)}/${encodePath(p.positionals[1]!)}`, { method: "POST", idempotent: true }), p);
});

export const sslRetrieve = command("ssl retrieve", "Retrieve the complete PEM certificate bundle", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi ssl retrieve example.com --json"], async (p) => {
  const data = await request<Data>(`/ssl/retrieve/${encodePath(p.positionals[0]!)}`);
  if (p.flags.json) return output(data, p);
  print(emitKV([["status", data.status], ["certificatechain_chars", String(data.certificatechain ?? "").length], ["privatekey_chars", String(data.privatekey ?? "").length], ["publickey_chars", String(data.publickey ?? "").length]]));
  print(emitBlock("next", [`porkbun-axi ssl retrieve ${p.positionals[0]} --json  # emits sensitive PEM material`]));
});

export const nameserversGet = command("nameservers get", "Get authoritative nameservers", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi nameservers get example.com"], async (p) => {
  output(await request<Data>(`/domain/getNs/${encodePath(p.positionals[0]!)}`), p, "ns", ["value"]);
});
export const nameserversSet = command("nameservers set", "Replace authoritative nameservers", [["domain", "domain name"]], [
  { name: "servers", type: "string", description: "comma-separated nameservers" }, confirmFlag, jsonFlag,
], ["porkbun-axi nameservers set example.com --servers ns1.example.net,ns2.example.net", "porkbun-axi nameservers set example.com --servers ns1.example.net,ns2.example.net --confirm"], async (p) => {
  const ns = p.flags.servers ? String(p.flags.servers).split(",").map((v) => v.trim()).filter(Boolean) : [];
  if (ns.length < 2) throw new UsageError("--servers must contain at least two nameservers");
  gate(p, `replace all nameservers for ${p.positionals[0]} with ${ns.join(", ")}`);
  output(await request<Data>(`/domain/updateNs/${encodePath(p.positionals[0]!)}`, { method: "POST", body: { ns }, idempotent: true }), p);
});

export const glueList = command("glue list", "List registry glue records", [["domain", "domain name"]], [jsonFlag], ["porkbun-axi glue list example.com"], async (p) => {
  output(await request<Data>(`/domain/getGlue/${encodePath(p.positionals[0]!)}`), p);
});
function glueWrite(name: "create" | "update") {
  return command(`glue ${name}`, `${name === "create" ? "Create" : "Replace"} a registry glue record`, [["domain", "domain name"], ["subdomain", "host label such as ns1"]], [
    { name: "ips", type: "string", description: "comma-separated IPv4 and IPv6 addresses" }, ...(name === "update" ? [confirmFlag] : []), jsonFlag,
  ], [`porkbun-axi glue ${name} example.com ns1 --ips 192.0.2.1,2001:db8::1`], async (p) => {
    const ips = p.flags.ips ? String(p.flags.ips).split(",").map((v) => v.trim()).filter(Boolean) : [];
    if (!ips.length) throw new UsageError("--ips must contain at least one address");
    const change = `${name} glue ${p.positionals[1]}.${p.positionals[0]} -> ${ips.join(", ")}`;
    if (name === "update") gate(p, change); else print(`change: ${change}`);
    output(await request<Data>(`/domain/${name}Glue/${encodePath(p.positionals[0]!)}/${encodePath(p.positionals[1]!)}`, { method: "POST", body: { ips }, idempotent: true }), p);
  });
}
export const glueCreate = glueWrite("create");
export const glueUpdate = glueWrite("update");
export const glueDelete = command("glue delete", "Delete a registry glue record", [["domain", "domain name"], ["subdomain", "host label such as ns1"]], [confirmFlag, jsonFlag], ["porkbun-axi glue delete example.com ns1 --confirm"], async (p) => {
  gate(p, `delete glue ${p.positionals[1]}.${p.positionals[0]}`);
  output(await request<Data>(`/domain/deleteGlue/${encodePath(p.positionals[0]!)}/${encodePath(p.positionals[1]!)}`, { method: "POST", idempotent: true }), p);
});

export const allCommands: Record<string, CommandModule> = {
  "domains list": domainsList, "domains get": domainsGet, "domains check": domainsCheck, "domains pricing": domainsPricing, "domains register": domainsRegister,
  "dns list": dnsList, "dns get": dnsGet, "dns create": dnsCreate, "dns update": dnsUpdate, "dns delete": dnsDelete,
  "forwarding list": forwardingList, "forwarding create": forwardingCreate, "forwarding delete": forwardingDelete,
  "ssl retrieve": sslRetrieve, "nameservers get": nameserversGet, "nameservers set": nameserversSet,
  "glue list": glueList, "glue create": glueCreate, "glue update": glueUpdate, "glue delete": glueDelete,
};

export function commandSummary(): string {
  return emitBlock("groups", [
    "domains     list, get, check, pricing, register",
    "dns         list, get, create, update, delete",
    "forwarding  list, create, delete",
    "ssl         retrieve",
    "nameservers get, set",
    "glue        list, create, update, delete",
  ]);
}
