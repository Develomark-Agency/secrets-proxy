#!/usr/bin/env bun
import { confirm } from "@inquirer/prompts";
import style from "ansis";
import { defineCommand, runMain } from "citty";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import open from "open";
import spinner from "yocto-spinner";
import { loadCredentials, saveCredentials } from "./auth/credentials";
import { login } from "./auth/login";
import getPort from "get-port";
import { client } from "./rpc-client";

dayjs.extend(relativeTime);

const main = defineCommand({
  subCommands: {
    login: defineCommand({
      meta: {
        description: "Authenticate to the secret proxy using GitHub.",
        name: "Login"
      },
      async run() {
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

        const url = client.login.$url({
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
    status: defineCommand({
      meta: {
        description: "Show the authentication status.",
        name: "Status"
      },
      async run() {
        let credentials = await loadCredentials();

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
    })
  }
});

runMain(main);