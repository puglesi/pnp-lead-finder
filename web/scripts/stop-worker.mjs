import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { resolveLocalDataPaths } from "../src/lib/server/local-database.ts";
const runtime = resolve(dirname(resolveLocalDataPaths().databasePath), "..", "worker-runtime");
if (existsSync(runtime)) writeFileSync(resolve(runtime, "stop.request"), "stop");
