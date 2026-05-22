#!/usr/bin/env bun
import { confirm, input, password, select } from "@inquirer/prompts";
import style from "ansis";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import open from "open";
import spinner from "yocto-spinner";
import { loadCredentials, loadCredentialsWithAutoRefresh, saveCredentials } from "./auth/credentials";
import { login } from "./auth/login";
import getPort from "get-port";
import { client } from "./rpc-client";
import { command, option, string, subcommands, oneOf, run, optional, flag, multioption, array } from "cmd-ts";

dayjs.extend(relativeTime);

const rpcClient = client();

const main = subcommands({
  name: "secrets-proxy",
  cmds: {
    login: command({
      name: "login",
      description: "Authenticate to the secrets proxy using GitHub",
      aliases: ["l", "auth"],
      args: {},
      async handler() {
        const existingCredentials = await loadCredentials();

        if(existingCredentials && existingCredentials.exp > new Date()) {
          console.log(style.bold.blue`Already authenticated`);
          console.log(`${style.dim`│ Username:`} ${existingCredentials.user}`);
          console.log(`${style.dim`│ Expires`} ${dayjs().to(existingCredentials.exp)} ${style.dim`(${dayjs(existingCredentials.exp).format("h:mm:ss on MMMM D, YYYY")})`}`);

          const reauth = await confirm({ message: "Reauthenticate?" });
          if(!reauth) return;
        }

        const port = await getPort();
        const nonce = crypto.randomUUID();

        const url = rpcClient.login.$url({
          query: { cli_port: String(port), nonce }
        });

        console.log(style.bold`🌐 Open the authentication link in your browser`);
        console.log(style.yellow(url.href));
        await open(url.href);

        const s = spinner();

        s.start("Waiting for authentication...");

        let credentials;
        try {
          credentials = await login(port, nonce);
        } catch(e) {
          s.stop(`✖︎ Failed to authenticate.`);
          return;
        }

        s.stop(`${style.green`✔`} Authenticated successfully`);

        try {
          await saveCredentials(credentials);
        } catch(e) {
          console.error(e);
          console.error(`✖︎ Failed to save credentials`);
        }
      }
    }),
    status: command({
      name: "status",
      description: "Show the authentication status",
      args: {},
      aliases: ["s"],
      async handler(args) {
        const credentials = await loadCredentials();

        console.log(style.bold.blue`Authentication status`);

        if(credentials && credentials.refreshExp > new Date()) {
          console.log(`${style.dim`│`} ${style.green`✔`} Authenticated`);
          console.log(`${style.dim`│ Username:`} ${credentials.user}`);
          console.log(`${style.dim`│ Expires`} ${dayjs().to(credentials.refreshExp)} ${style.dim`(${dayjs(credentials.refreshExp).format("h:mm:ss on MMMM D, YYYY")})`}`);
        } else {
          console.log(`${style.dim`│`} ${style.red`✖︎`} Not authenticated`);
          console.log(`${style.dim`│`} Run the ${style.dim`login`} command to authenticate.`);
        }
      }
    }),
    ping: command({
      name: "ping",
      description: "Ping",
      args: {},
      async handler(args) {
        const credentials = await loadCredentialsWithAutoRefresh();

        const res = await rpcClient.ping.$get({}, {
          headers: { "Authorization": `Bearer ${credentials.accessToken}` }
        });

        console.log(res.status, res.statusText, "-", await res.text());
      }
    }),
    encrypt: command({
      name: "encrypt",
      description: "Encrypt an API secret for proxy usage",
      aliases: ["e"],
      examples: [{
        command: `
secrets-proxy encrypt \\
     -d api.example.com \\
     -k mysecret \\
     -t header -n Authorization -v "Bearer xxx" \\
     -t query -n api_key -v "xxx"
        `.trim(),
        description: `
Encrypt a secret key for ${style.yellow`api.example.com`}.

Use the key ${style.dim`mysecret`}.
The secret consists of two authentication methods:
- Header ${style.dim`(Authorization: "Bearer xxx")`}
- Query parameter ${style.dim`(?api_key=xxx)`}
        `.trim() + "\n"
      }],
      args: {
        interactive: flag({
          long: "interactive",
          short: "i"
        }),
        domain: option({
          long: "domain",
          short: "d",
          description: "The domain to match against when using this key",
          type: optional(string)
        }),
        type: multioption({
          long: "type",
          short: "t",
          description: "The source of authentication (URL query parameter or request header)",
          type: array(oneOf(["query", "header"])),
        }),
        name: multioption({
          long: "name",
          short: "n",
          description: "The header or query parameter name",
          type: array(string),
        }),
        value: multioption({
          long: "value",
          short: "v",
          description: "The value of the key",
          type: array(string),
        }),
        key: option({
          long: "key",
          short: "k",
          description: "Encryption key. Must be the same as the encryption key used in the deployed secrets proxy.",
          type: optional(string),
          defaultValue: () => process.env.API_SECRET
        })
      },
      async handler(args) {
        const encoder = new TextEncoder();

        function toHex(bytes: Uint8Array) {
          return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        async function encrypt(key: string, entries: Array<{ type: "header" | "query"; name: string; value: string }>) {
          const payload: { headers: Record<string, string>; query: Record<string, string> } = {
            headers: {},
            query: {},
          }

          for(const entry of entries) {
            if(entry.type === "header") {
              payload.headers[entry.name] = entry.value;
            } else {
              payload.query[entry.name] = entry.value;
            }
          }

          const plaintext = JSON.stringify(payload);

          const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(key));

          const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyHash,
            { name: "AES-GCM" },
            false,
            ["encrypt"],
          );

          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            encoder.encode(plaintext),
          );

          const result = `${toHex(iv)}:${toHex(new Uint8Array(ciphertext))}`;
          
          return result;
        }

        async function getValuesInteractive(supplied: typeof args) {
          let domain = supplied.domain;
          let key = supplied.key;
          const entries: Array<{ type: "header" | "query"; name: string; value: string }> = [];

          const suppliedTypes = supplied.type ?? [];
          const suppliedNames = supplied.name ?? [];
          const suppliedValues = supplied.value ?? [];
          const suppliedCount = Math.min(suppliedTypes.length, suppliedNames.length, suppliedValues.length);
          for(let i = 0; i < suppliedCount; i++) {
            entries.push({ type: suppliedTypes[i] as "header" | "query", name: suppliedNames[i]!, value: suppliedValues[i]! });
          }

          while(!domain) {
            const d = await input({ message: `Enter the API domain ${style.dim`(e.g. api.example.com)`}` });
            if(d.trim() !== "" && d.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/)) {
              domain = d;
              break;
            }
            console.error("Invalid domain");
          }

          while(!key) {
            const k = await password({
              message: "Enter the encryption key",
              mask: true
            });
            if(k.trim() !== "") {
              key = k;
              break;
            }
            console.error("Key cannot be empty");
          }

          do {
            const selectedType = await select<"header" | "query">({
              message: `Enter the API authorization type for entry ${entries.length + 1}`,
              choices: [
                { name: "URL query parameter", value: "query", description: "API key authentication in a URL query parameter" },
                { name: "Request header", value: "header", description: "Including basic, bearer, and custom header auth" }
              ]
            });

            const name = await input({
              message: `Enter the ${selectedType === "header" ? "header" : "query parameter"} name ${style.dim`(e.g. ${selectedType === "header" ? "Authorization" : "api_key"})`}`
            });

            const value = await password({
              message: `Enter the ${selectedType === "header" ? "header" : "query parameter"} value`,
              mask: true
            });

            entries.push({ type: selectedType, name, value });

            const addAnother = await confirm({ message: "Add another key?" });
            if(!addAnother) break;
          } while(true);

          return { domain: domain!, key: key!, entries };
        }

        let domain;
        let encrypted;
        if(args.interactive) {
          const collected = await getValuesInteractive(args);
          domain = collected.domain;
          encrypted = await encrypt(collected.key, collected.entries);
        } else {
          const { type, name, value, key } = args;
          if(!args.domain) {
            console.log(`${style.bold.red`error:`} No value provided for --domain`);
            return;
          }
          domain = args.domain;

          if(!key) {
            console.log(`${style.bold.red`error:`} No value provided for --key`);
            return;
          }

          if(!type || type.length === 0) {
            console.log(`${style.bold.red`error:`} No values provided for --type`);
            return;
          }

          if(!name || name.length === 0) {
            console.log(`${style.bold.red`error:`} No values provided for --name`);
            return;
          }

          if(!value || value.length === 0) {
            console.log(`${style.bold.red`error:`} No values provided for --value`);
            return;
          }

          if(type.length !== name.length || type.length !== value.length) {
            console.log(`${style.bold.red`error:`} --type, --name, and --value must have the same number of entries`);
            return;
          }

          const entries: Array<{ type: "header" | "query"; name: string; value: string }> = [];
          for(let i = 0; i < type.length; i++) {
            entries.push({ type: type[i] as "header" | "query", name: name[i]!, value: value[i]! });
          }

          encrypted = await encrypt(key, entries);
        }

        console.log(style.bold.blue`Enter this key into the secrets proxy KV store`);
        console.log(`│ ${style.yellow`key:  `} api:${domain}`);
        console.log(`│ ${style.yellow`value:`} ${encrypted}`);
      }
    })
  }
});

await run(main, process.argv.slice(2));
