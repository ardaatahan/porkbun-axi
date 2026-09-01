import { randomUUID } from "node:crypto";
import { AxiError } from "./output/errors.js";

const DEFAULT_BASE_URL = "https://api.porkbun.com/api/json/v3";

export interface RequestOptions {
  public?: boolean;
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
  idempotent?: boolean;
}

function credentials(): Record<string, string> {
  const apiKey = process.env.PORKBUN_API_KEY;
  const secretKey = process.env.PORKBUN_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new AxiError(
      "Porkbun credentials are not configured",
      "export PORKBUN_API_KEY=<key> and PORKBUN_SECRET_KEY=<secret>; create keys at https://porkbun.com/account/api",
    );
  }
  return { "X-API-Key": apiKey, "X-Secret-API-Key": secretKey };
}

export async function request<T = Record<string, unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!options.public) Object.assign(headers, credentials());
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (options.idempotent) headers["Idempotency-Key"] = randomUUID();

  const base = (process.env.PORKBUN_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AxiError(`Porkbun API request failed: ${message}`, "check network access and retry");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new AxiError(
      `Porkbun API returned non-JSON HTTP ${response.status}`,
      "retry later; check https://status.porkbun.com if the error persists",
    );
  }
  if (!response.ok || payload.status === "ERROR") {
    const code = payload.code ? ` (${String(payload.code)})` : "";
    const message = String(payload.message ?? `HTTP ${response.status}`);
    const next = payload.next_action as Record<string, unknown> | undefined;
    throw new AxiError(`Porkbun API error${code}: ${message}`, next?.message ? String(next.message) : "verify the command inputs and API access settings");
  }
  return payload as T;
}

export function encodePath(value: string): string {
  return encodeURIComponent(value.trim());
}
