---
name: porkbun-axi
description: "Safe, agent-ergonomic domain management through the Porkbun API"
---

# porkbun-axi

Safe, agent-ergonomic domain management through the Porkbun API (built against AXI spec axi/1.0-2026-07). Install from a checkout of this repository (`npm install && npm run build && npm link`), then run the `porkbun-axi` commands below. Without linking, `node bin/porkbun-axi.js` from the checkout takes the same arguments.

```
capabilities[6]{group,operations,safety}:
  domains,"list,get,check,pricing,register",register requires --confirm after price quote
  dns,"list,get,create,update,delete",update/delete require --confirm
  forwarding,"list,create,delete",delete requires --confirm
  ssl,retrieve,read-only
  nameservers,"get,set",set requires --confirm
  glue,"list,create,update,delete",update/delete require --confirm
help[3]:
  porkbun-axi domains list
  porkbun-axi domains pricing --tlds com,net
  porkbun-axi --help
```

Every command supports `--help`. Exit codes: 0 success/no-op, 1 error, 2 usage error. All output is TOON on stdout.
