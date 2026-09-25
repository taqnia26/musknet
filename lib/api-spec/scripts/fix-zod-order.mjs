import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Orval occasionally emits new validation constants after a schema that uses
// them. Hoist just those declarations so source-based tests can import it.
const file = fileURLToPath(new URL("../../api-zod/src/generated/api.ts", import.meta.url));
let source = readFileSync(file, "utf8");

function before(declaration, dependent) {
  const start = source.indexOf(`export const ${declaration} = `);
  const end = source.indexOf("\n\n", start);
  const target = source.indexOf(`export const ${dependent} = `);
  if (start < 0 || end < 0 || target < 0) throw new Error(`Generated Zod declaration missing: ${declaration} or ${dependent}`);
  if (start < target) return;
  const block = source.slice(start, end + 2);
  source = source.slice(0, start) + source.slice(end + 2);
  const insertion = source.indexOf(`export const ${dependent} = `);
  source = source.slice(0, insertion) + block + source.slice(insertion);
}

before("adminCreateInventoryProductBodyOpeningLocationIdMultipleOf", "AdminCreateInventoryProductBody");
before("adminCreateInventoryProductBodyIsActiveDefault", "AdminCreateInventoryProductBody");
before("listInventoryLocationsResponseIdMultipleOf", "ListInventoryLocationsResponseItem");
before("ListInventoryLocationsResponseItem", "ListInventoryLocationsResponse");
writeFileSync(file, source);

// Orval may append blank lines to the generated React client. Keep the
// generated file stable across repeated codegen runs.
const clientFile = fileURLToPath(new URL("../../api-client-react/src/generated/api.ts", import.meta.url));
const clientSource = readFileSync(clientFile, "utf8");
writeFileSync(clientFile, `${clientSource.trimEnd()}\n`);