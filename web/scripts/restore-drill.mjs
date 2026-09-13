import { restoreDrill } from "../src/lib/server/database-maintenance.ts";
import { resolveLocalDataPaths } from "../src/lib/server/local-database.ts";
const result = await restoreDrill(resolveLocalDataPaths().databasePath);
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
