---
name: porkbun-axi
description: "Safe, agent-ergonomic domain management through the Porkbun API"
---

# porkbun-axi

Safe, agent-ergonomic domain management through the Porkbun API (built against AXI spec axi/1.0-2026-07). Run the commands below with npx - no install needed.

```
capabilities[6]{group,operations,safety}:
  domains,"list,get,check,pricing,register",register requires --confirm after price quote
  dns,"list,get,create,update,delete",update/delete require --confirm
  forwarding,"list,create,delete",delete requires --confirm
  ssl,retrieve,read-only
  nameservers,"get,set",set requires --confirm
  glue,"list,create,update,delete",update/delete require --confirm
help[3]:
  npx -y porkbun-axi domains list
  npx -y porkbun-axi domains pricing --tlds com,net
  npx -y porkbun-axi --help
```

Every command supports `--help`. Exit codes: 0 success/no-op, 1 error, 2 usage error. All output is TOON on stdout.
