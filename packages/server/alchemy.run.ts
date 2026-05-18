import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("server");

export const worker = await Worker("worker", {
  entrypoint: "src/worker.ts",
});

console.log(worker.url);

await app.finalize();
