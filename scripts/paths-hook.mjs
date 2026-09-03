import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../src/", import.meta.url)));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      let target = path.join(SRC, specifier.slice(2));
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (existsSync(target + ext)) {
          target += ext;
          break;
        }
      }
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
