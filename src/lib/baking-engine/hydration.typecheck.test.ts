// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * F008/AC-1: Kommt im Rezept-Schema ein Zutatentyp dazu, muss die Typprüfung in
 * `hydration.ts` (im `switch` von `calculateNetHydration`) fehlschlagen.
 *
 * Das Schema wird dafür nur im Speicher eines CompilerHosts verändert; auf die Platte
 * wird nichts geschrieben.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HYDRATION_FILE = path.join(ROOT, "src/lib/baking-engine/hydration.ts");
const RECIPES_FILE = path.join(ROOT, "src/db/schema/recipes.ts");
const TSCONFIG_FILE = path.join(ROOT, "tsconfig.json");
const TIMEOUT = 120_000;

const INGREDIENT_TYPES_PATTERN = /(export const INGREDIENT_TYPES = \[)([^\]]*)(\] as const;)/;

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** Hängt `"milk"` an das Array `INGREDIENT_TYPES` an (nur Text, kein Schreibzugriff). */
function addMilkType(source: string): string {
  return source.replace(
    INGREDIENT_TYPES_PATTERN,
    (_match, start: string, items: string, end: string) => `${start}${items}, "milk"${end}`,
  );
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => ROOT,
  getNewLine: () => "\n",
};

function formatErrors(errors: readonly ts.Diagnostic[]): string {
  return errors.length ? ts.formatDiagnostics(errors, formatHost) : "(keine Fehler)";
}

interface Compilation {
  program: ts.Program;
  errors: readonly ts.Diagnostic[];
}

function compileHydration(recipesOverride?: string): Compilation {
  const { config, error } = ts.readConfigFile(TSCONFIG_FILE, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, incremental: false };

  const host = ts.createCompilerHost(options, true);
  if (recipesOverride !== undefined) {
    const originalReadFile = host.readFile.bind(host);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.readFile = (fileName) =>
      samePath(fileName, RECIPES_FILE) ? recipesOverride : originalReadFile(fileName);
    host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) =>
      samePath(fileName, RECIPES_FILE)
        ? ts.createSourceFile(fileName, recipesOverride, languageVersionOrOptions, true)
        : originalGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
  }

  const program = ts.createProgram({ rootNames: [HYDRATION_FILE], options, host });
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  return { program, errors };
}

function isIngredientTypeSwitch(node: ts.Node): node is ts.SwitchStatement {
  if (!ts.isSwitchStatement(node)) return false;
  const expression = node.expression;
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "ingredient" &&
    expression.name.text === "type"
  );
}

function findIngredientTypeSwitch(node: ts.Node): ts.SwitchStatement | undefined {
  if (isIngredientTypeSwitch(node)) return node;
  return ts.forEachChild(node, findIngredientTypeSwitch);
}

/** Sucht per AST den `switch (ingredient.type)` in `calculateNetHydration`. */
function findNetHydrationSwitch(sourceFile: ts.SourceFile): ts.SwitchStatement {
  const fn = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === "calculateNetHydration",
  );
  if (!fn?.body) {
    throw new Error("Funktion calculateNetHydration nicht in hydration.ts gefunden");
  }
  const switchStatement = findIngredientTypeSwitch(fn.body);
  if (!switchStatement) {
    throw new Error("switch (ingredient.type) nicht in calculateNetHydration gefunden");
  }
  return switchStatement;
}

function hydrationSourceFile(program: ts.Program): ts.SourceFile {
  const sourceFile = program
    .getSourceFiles()
    .find((file) => samePath(file.fileName, HYDRATION_FILE));
  if (!sourceFile) throw new Error("hydration.ts ist nicht Teil des Programms");
  return sourceFile;
}

function isInFile(diagnostic: ts.Diagnostic, fileName: string): boolean {
  return diagnostic.file !== undefined && samePath(diagnostic.file.fileName, fileName);
}

let baseline: Compilation | undefined;
let withMilk: Compilation | undefined;

function getBaseline(): Compilation {
  baseline ??= compileHydration();
  return baseline;
}

function getWithMilk(): Compilation {
  withMilk ??= compileHydration(addMilkType(fs.readFileSync(RECIPES_FILE, "utf8")));
  return withMilk;
}

describe("F008 Typprüfung: neuer Zutatentyp in der Netto-Hydratation", () => {
  it(
    "F008/AC-1 meldet mit den fünf bestehenden Zutatentypen keinen Typfehler",
    () => {
      const { errors } = getBaseline();

      expect(errors, formatErrors(errors)).toHaveLength(0);
    },
    TIMEOUT,
  );

  it("F008/AC-1 ergänzt „milk“ im Schema-Quelltext nur im Speicher (Guard gegen Formatwechsel)", () => {
    const original = fs.readFileSync(RECIPES_FILE, "utf8");
    const modified = addMilkType(original);

    expect(modified).not.toBe(original);
    expect(original).not.toContain('"milk"');
    expect(modified).toMatch(/export const INGREDIENT_TYPES = \[[^\]]*, "milk"\] as const;/);
    // Datei auf der Platte bleibt unverändert
    expect(fs.readFileSync(RECIPES_FILE, "utf8")).toBe(original);
  });

  it(
    "F008/AC-1 meldet bei zusätzlichem Typ „milk“ einen Typfehler im switch (ingredient.type) von calculateNetHydration",
    () => {
      const { program, errors } = getWithMilk();
      const switchStatement = findNetHydrationSwitch(hydrationSourceFile(program));
      const switchStart = switchStatement.getStart();
      const switchEnd = switchStatement.getEnd();

      const errorsInSwitch = errors.filter(
        (diagnostic) =>
          isInFile(diagnostic, HYDRATION_FILE) &&
          diagnostic.start !== undefined &&
          diagnostic.start >= switchStart &&
          diagnostic.start <= switchEnd &&
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n").includes("milk"),
      );

      expect(errorsInSwitch.length, formatErrors(errors)).toBeGreaterThanOrEqual(1);
    },
    TIMEOUT,
  );

  it(
    "F008/AC-1 meldet bei zusätzlichem Typ „milk“ Typfehler nur in hydration.ts, nicht im veränderten Schema",
    () => {
      const { errors } = getWithMilk();
      const errorsElsewhere = errors.filter((diagnostic) => !isInFile(diagnostic, HYDRATION_FILE));

      expect(errors.length, formatErrors(errors)).toBeGreaterThanOrEqual(1);
      expect(errorsElsewhere, formatErrors(errorsElsewhere)).toHaveLength(0);
    },
    TIMEOUT,
  );
});
