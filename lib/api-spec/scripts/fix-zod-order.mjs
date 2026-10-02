import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Orval can append validation constants after eager schemas that use them.
// Order ALL generated declarations by dependency, not a hand-maintained list.
const file = fileURLToPath(new URL("../../api-zod/src/generated/api.ts", import.meta.url));
const source = readFileSync(file, "utf8");
const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
if (parsed.parseDiagnostics.length) throw new Error("Generated Zod module could not be parsed");
const definitions = new Map();
for (const statement of parsed.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) definitions.set(declaration.name.text, statement);
  }
}
const emitted = new Set();
const visiting = new Set();
const ordered = [];
function emit(statement) {
  if (emitted.has(statement)) return;
  if (visiting.has(statement)) throw new Error("Circular generated Zod initialization dependency");
  visiting.add(statement);
  if (ts.isVariableStatement(statement)) {
    function visit(node) {
      if (ts.isIdentifier(node)) {
        const propertyName =
          (ts.isPropertyAccessExpression(node.parent) || ts.isPropertyAssignment(node.parent)) &&
          node.parent.name === node;
        const dependency = !propertyName && definitions.get(node.text);
        if (dependency && dependency !== statement) emit(dependency);
      }
      ts.forEachChild(node, visit);
    }
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer) visit(declaration.initializer);
    }
  }
  visiting.delete(statement);
  emitted.add(statement);
  ordered.push(statement.getFullText(parsed));
}
for (const statement of parsed.statements) emit(statement);
writeFileSync(file, `${(ordered.join("") + source.slice(parsed.statements.at(-1)?.end ?? 0)).trimEnd()}\n`);

// Orval may append blank lines to the generated React client. Keep the
// generated file stable across repeated codegen runs.
for (const name of ["api.ts", "api.schemas.ts"]) {
  const clientFile = fileURLToPath(new URL(`../../api-client-react/src/generated/${name}`, import.meta.url));
  const clientSource = readFileSync(clientFile, "utf8");
  writeFileSync(clientFile, `${clientSource.trimEnd()}\n`);
}