# porkbun-axi

`porkbun-axi` is an AXI-compliant CLI for safe, agent-ergonomic domain management through the [Porkbun API](https://porkbun.com/api/json/v3/documentation). It targets AXI spec `axi/1.0-2026-07` and Porkbun API v3.

The CLI talks directly to `https://api.porkbun.com/api/json/v3`. It does not store credentials, create configuration files, or send credentials in request bodies. Read output is compact TOON by default, with deterministic JSON available through `--json` where useful.

## Install

Requires Node.js 20 or newer.

```sh
git clone https://github.com/ardaatahan/porkbun-axi.git
cd porkbun-axi
npm install
npm run build
npm link
porkbun-axi --help
```

You can also run the checked-out CLI without linking it:

```sh
node bin/porkbun-axi.js --help
```

## Authentication

Create an API key at [Porkbun API Access](https://porkbun.com/account/api), enable API access for the domains you plan to manage, then export both values:

```sh
export PORKBUN_API_KEY='pk1_...'
export PORKBUN_SECRET_KEY='sk1_...'
```

Credentials are read only from the environment. They are sent as `X-API-Key` and `X-Secret-API-Key` headers, never written to disk, printed, logged, or included in request bodies. Public pricing is the only command that does not require credentials.

If either variable is missing, authenticated commands fail with a setup hint before making a network request.

## Command reference

Every level supports `--help`, including command groups such as `porkbun-axi dns --help` and individual commands such as `porkbun-axi dns create --help`.

### Domains

```sh
# List account domains
porkbun-axi domains list
porkbun-axi domains list --json

# Get one domain
porkbun-axi domains get example.com

# Check availability and current registration, renewal, and transfer prices
porkbun-axi domains check example.com

# Retrieve public TLD pricing
porkbun-axi domains pricing
porkbun-axi domains pricing --tlds com,net,org
porkbun-axi domains pricing --json

# Quote only. This prints availability and price, then refuses to register.
porkbun-axi domains register example.com

# Register for real after reviewing the quote and accepting Porkbun terms
porkbun-axi domains register example.com --confirm
porkbun-axi domains register example.com --whois-privacy on --confirm
```

Registration spends real account credit. It has the strictest gate: the CLI always calls the availability endpoint first, prints the current USD price and premium status, refuses unavailable domains, converts the quoted price to the exact cent amount required by Porkbun, and only submits the order when `--confirm` is present. The registration write also carries an idempotency key.

### DNS records

Supported record types are those accepted by Porkbun, including A, AAAA, CNAME, MX, TXT, SRV, CAA, ALIAS, and other API-supported types.

```sh
# Read records
porkbun-axi dns list example.com
porkbun-axi dns get example.com 123456

# Create records. Use an empty or omitted --name for the zone apex.
porkbun-axi dns create example.com --type A --name www --content 192.0.2.1 --ttl 600
porkbun-axi dns create example.com --type AAAA --name www --content 2001:db8::1
porkbun-axi dns create example.com --type CNAME --name docs --content docs.example.net
porkbun-axi dns create example.com --type MX --content mail.example.com --priority 10
porkbun-axi dns create example.com --type TXT --name _verify --content verification-value --notes onboarding

# Preview a record replacement, then explicitly confirm it.
# dns update always requires --name; use --name '' to target the zone apex.
porkbun-axi dns update example.com 123456 --type A --name www --content 192.0.2.2 --ttl 600
porkbun-axi dns update example.com 123456 --type A --name www --content 192.0.2.2 --ttl 600 --confirm
porkbun-axi dns update example.com 123456 --type A --name '' --content 192.0.2.2 --confirm

# Preview the exact deletion, then explicitly confirm it
porkbun-axi dns delete example.com 123456
porkbun-axi dns delete example.com 123456 --confirm
```

Create prints the record change before sending it. Update and delete print the exact target and never mutate Porkbun unless `--confirm` is supplied. `dns update` refuses to run without `--name` so an omitted subdomain can never silently retarget a record to the zone apex; pass the record's subdomain, or `--name ''` when the apex is the intended target.

### URL forwarding

```sh
porkbun-axi forwarding list example.com

porkbun-axi forwarding create example.com \
  --subdomain www \
  --location https://example.net \
  --type 301 \
  --include-path

# Redirect types: 301, 302, 307, masked
porkbun-axi forwarding create example.com --location https://example.net --type masked --wildcard

porkbun-axi forwarding delete example.com 987
porkbun-axi forwarding delete example.com 987 --confirm
```

Deleting a forward prints the exact ID and domain and requires `--confirm`.

### SSL certificate bundle

```sh
porkbun-axi ssl retrieve example.com
porkbun-axi ssl retrieve example.com --json
```

The default response prints only the size of each bundle component and a next-step hint. `--json` emits the complete certificate chain, private key, and public key returned by Porkbun. Treat JSON output as sensitive. Avoid redirecting it to shared logs or terminals.

### Nameservers

```sh
porkbun-axi nameservers get example.com

# Preview only
porkbun-axi nameservers set example.com --servers ns1.example.net,ns2.example.net

# Replace the complete nameserver set
porkbun-axi nameservers set example.com \
  --servers ns1.example.net,ns2.example.net \
  --confirm
```

Changing nameservers can take a domain offline. The command requires at least two servers, prints the full replacement set, and makes no API call without `--confirm`.

### Glue records

```sh
porkbun-axi glue list example.com
porkbun-axi glue create example.com ns1 --ips 192.0.2.1,2001:db8::1
porkbun-axi glue update example.com ns1 --ips 192.0.2.2,2001:db8::2
porkbun-axi glue update example.com ns1 --ips 192.0.2.2,2001:db8::2 --confirm

porkbun-axi glue delete example.com ns1
porkbun-axi glue delete example.com ns1 --confirm
```

Glue create prints the target host and IP set. Glue update and delete print the exact replacement or deletion and require `--confirm`.

## Output and errors

Default output is compact TOON intended for reliable agent consumption. List commands use stable, minimal columns. `--json` emits the complete API response with recursively sorted object keys.

```text
records[1]{id,name,type,content}:
  123456,www.example.com,A,192.0.2.1
```

Errors are structured on stdout and use stable exit codes:

- `0`: success or read-only empty result
- `1`: API, authentication, network, or unexpected failure
- `2`: invalid command usage or a refused confirmation gate

Unknown flags fail loudly and include the valid flag set. API errors include Porkbun's stable error code and recovery hint when available. Secrets are never included in error output.

## Safety gates

| Operation | Without `--confirm` | With `--confirm` |
| --- | --- | --- |
| Register domain | Fetches and prints availability and price, then refuses | Rechecks and prints price, then places the order |
| Delete DNS record | Prints domain and record ID, then refuses | Deletes that record ID |
| Replace DNS record | Prints record ID and replacement value, then refuses | Replaces that record ID |
| Change nameservers | Prints the complete replacement set, then refuses | Replaces all nameservers |
| Delete URL forward | Prints domain and forward ID, then refuses | Deletes that forward |
| Delete glue record | Prints the full host, then refuses | Deletes that glue record |
| Replace glue record | Prints the full host and replacement IPs, then refuses | Replaces that glue record |

All writes use a fresh `Idempotency-Key` header. **`domains register --confirm` performs a real registration and spends real money.** This CLI has no sandbox mode; every command against a real API key acts on your real account. All automated testing in this repository uses mocked HTTP and never makes live API calls.

## Development

```sh
npm install
npm run build
npm test
npm run skill:gen
npm run skill:check
axi-axi validate "node bin/porkbun-axi.js" --dir . --strict --timeout 30000
```

Tests mock `fetch` in process and cover every command's success and API error path, credential failures, validation failures, request headers and bodies, idempotency, JSON output, and every confirmation gate. Live-credential smoke testing is intentionally deferred until a Porkbun key is supplied.

The generated agent skill lives at `skills/porkbun-axi/SKILL.md`. Its content shares the same source as the credential-free home view in `src/skill/content.ts`.
