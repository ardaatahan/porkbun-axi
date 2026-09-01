import { dispatch, type Registry } from "./cli/router.js";
import { homeCommand, rootHelp } from "./commands/home.js";
import { allCommands } from "./commands/porkbun.js";

export const registry: Registry = {
  tool: "porkbun-axi",
  root: homeCommand,
  rootHelp,
  commands: allCommands,
  aliases: {
    domains: "domains list",
    dns: "dns list",
    forwarding: "forwarding list",
    nameservers: "nameservers get",
    glue: "glue list",
  },
};

const code = await dispatch(registry, process.argv.slice(2));
process.exit(code);
