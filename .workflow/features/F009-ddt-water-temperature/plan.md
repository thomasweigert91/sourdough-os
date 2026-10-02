# Plan F009: DDT-Wassertemperatur-Rechner (Vier-Faktoren-Modell)

<!-- Rolle: tech-planner. Alle {{...}}-Platzhalter ersetzen. Jede AC aus dem Ticket muss in Arbeitsschritten UND Teststrategie vorkommen. -->

## Ansatz
Neues reines TS-Modul `src/lib/baking-engine/ddt.ts` neben `hydration.ts`, gebaut wie die bestehende Engine: synchron, ohne Seiteneffekte, ungerundete Rückgabewerte, deutsche Fehlermeldungen als exportierte `*_MESSAGE`-Konstanten, Endlichkeitsprüfung über einen lokalen `assertFinite`-Helfer. Die einzige öffentliche Funktion `calculateWaterTemperature(params: DdtParams): DdtResult` prüft zuerst alle Eingaben, ermittelt dann den Reibungswert (Preset aus `FRICTION_PRESETS` oder geprüfter Custom-Wert), rechnet `4 × DDT − (Mehl + Raum + Starter + Reibung)` und ordnet den Status zu. Die Knetart wird wie in F008 mit einem `switch` und einem `never`-`default`-Zweig ausgewertet. Eine neue Knetart fällt so bei der Typprüfung auf, ein unbekannter Wert zur Laufzeit wirft, statt `NaN` zu liefern. Die Grenzwertvergleiche bekommen wie `FLOUR_PERCENT_TOLERANCE` in `hydration.ts` einen Gleitkomma-Puffer (`1e-9`). Sonst würde z. B. DDT 16,4 / Mehl 6,6 / Raum 22 / Starter 24 / Spiralkneter `3.999999999999993` ergeben und fälschlich `cold_warning` melden, obwohl das Ergebnis fachlich genau 4 °C ist (AC-5). Zurückgegeben wird trotzdem der ungerundete Rohwert.

Verworfene Alternativen:
- `assertFinite` aus `hydration.ts` exportieren bzw. in ein gemeinsames `validation.ts` auslagern: Dafür müsste `hydration.ts` angefasst werden, was nicht im Ticket steht. Vier duplizierte Zeilen sind die kleinere Änderung.
- Wassertemperatur auf eine Nachkommastelle runden oder bei 0 °C kappen: widerspricht den beantworteten offenen Fragen (ungerundet, negatives Ergebnis unverändert).
- Reibung als freie Zahl ohne Knetart: verliert die vorgegebenen Presets und die Regel „Custom-Wert bei Preset ignorieren“ (AC-1).
- Ergebnis als diskriminierte Union pro Status: mehr Typaufwand ohne Nutzen, solange es keine UI gibt. Ein flaches Interface mit `message: string | null` ist einfacher zu testen und anzuzeigen.
- Barrel-Datei `src/lib/baking-engine/index.ts`: gibt es bisher nicht, `hydration.ts` wird direkt importiert. Diese Konvention wird übernommen.

## Betroffene Dateien
<!-- Aktion: neu / ändern / löschen. "ändern"/"löschen" muss auf existierende Dateien zeigen (prüft das Gate). -->
| Pfad | Aktion | Zweck |
|---|---|---|
| src/lib/baking-engine/ddt.ts | neu | Typen, Presets, Grenzwerte, Meldungskonstanten und `calculateWaterTemperature` |
| src/lib/baking-engine/ddt.test.ts | neu | Vitest-Unit-Tests für AC-1 bis AC-6 inkl. Grenzwert- und Gleitkommafällen |
| vitest.config.mts | ändern | Unter `test` `testTimeout: 15000` ergänzen, damit die volle Suite stabil grün läuft (Abnahme aller AC). `maxWorkers: 4` nur bedingt, siehe Arbeitsschritt 8 |

Sonst bleiben bestehende Dateien unverändert (`hydration.ts`, Schema, UI, `src/lib/auth.test.ts`). Neue Abhängigkeiten gibt es keine.

Hinweis: Die Konfiguration heißt im Repo `vitest.config.mts`, nicht `vitest.config.ts`. Gemeint ist diese Datei, eine `vitest.config.ts` wird nicht angelegt.

## Komponenten & Datenfluss
Keine Komponenten, kein State, keine API-Aufrufe, keine Lade- oder Fehlerzustände in der UI. Datenfluss: `DdtParams` → Validierung (wirft `Error`) → Reibungswert → Formel → Status/Meldung → `DdtResult`. Alle Werte in °C.

### Öffentliche API von `src/lib/baking-engine/ddt.ts`
Gegen genau diese Namen und Werte schreibt der Test-Writer.
```ts
/** Knetarten. "custom" verlangt `customFriction`. */
export type KneadingMethod = "hand" | "stand_mixer" | "spiral" | "custom";
export type PresetKneadingMethod = Exclude<KneadingMethod, "custom">;

/** Reibungswerte der Presets in °C. */
export const FRICTION_PRESETS = {
  hand: 1,
  stand_mixer: 5,
  spiral: 9,
} as const satisfies Record<PresetKneadingMethod, number>;

/** Unter diesem Wert (°C) gilt Kaltwarnung, der Wert selbst ist "ok". */
export const COLD_WATER_THRESHOLD = 4;
/** Über diesem Wert (°C) gilt Hitzewarnung, der Wert selbst ist "ok". */
export const HOT_WATER_THRESHOLD = 45;

export type DdtStatus = "ok" | "cold_warning" | "heat_warning";

export interface DdtParams {
  /** Ziel-Teigtemperatur (DDT) in °C. */
  desiredDoughTemperature: number;
  /** Mehltemperatur in °C, darf negativ sein. */
  flourTemperature: number;
  /** Raumtemperatur in °C, darf negativ sein. */
  roomTemperature: number;
  /** Startertemperatur in °C, darf negativ sein. */
  starterTemperature: number;
  kneadingMethod: KneadingMethod;
  /** Nur bei "custom" ausgewertet (Pflicht, endlich, >= 0); bei Presets ignoriert, auch nicht validiert. */
  customFriction?: number;
}

export interface DdtResult {
  /** Benötigte Schüttwassertemperatur in °C, ungerundet, auch negativ möglich. */
  waterTemperature: number;
  /** Tatsächlich verwendeter Reibungswert in °C (Preset oder Custom). */
  frictionFactor: number;
  status: DdtStatus;
  /** Anzeigefertige Meldung bei Warnung, sonst null. */
  message: string | null;
}

export const COLD_WARNING_MESSAGE = "Eiswasser erforderlich";
export const HEAT_WARNING_MESSAGE = "Kritische Temperatur für Starter-Mikroben!";

export const NON_FINITE_DOUGH_TEMPERATURE_MESSAGE = "Die Teigtemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_FLOUR_TEMPERATURE_MESSAGE = "Die Mehltemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_ROOM_TEMPERATURE_MESSAGE = "Die Raumtemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_STARTER_TEMPERATURE_MESSAGE = "Die Startertemperatur muss eine gültige Zahl sein.";
export const NON_FINITE_FRICTION_MESSAGE = "Die Knetreibung muss eine gültige Zahl sein.";
export const NEGATIVE_FRICTION_MESSAGE = "Die Knetreibung darf nicht negativ sein.";
export const MISSING_CUSTOM_FRICTION_MESSAGE = "Für eigene Knetreibung muss ein Wert angegeben werden.";

/** Meldung für eine Knetart, die die Engine nicht kennt. */
export function unknownKneadingMethodMessage(method: string): string; // => `Unbekannte Knetart: ${method}.`

export function calculateWaterTemperature(params: DdtParams): DdtResult;
```

### Ablauf in `calculateWaterTemperature`
1. Endlichkeit in fester Reihenfolge prüfen: DDT, Mehl, Raum, Starter, jeweils mit der eigenen `NON_FINITE_*`-Meldung. Negative Temperaturen sind erlaubt, Obergrenzen gibt es nicht.
2. Reibungswert über einen internen Helfer `resolveFriction(params): number` mit `switch (params.kneadingMethod)`:
   - `"hand"`, `"stand_mixer"`, `"spiral"` → `FRICTION_PRESETS[method]`. `customFriction` wird nicht gelesen und nicht geprüft.
   - `"custom"` → `customFriction === undefined` ergibt `MISSING_CUSTOM_FRICTION_MESSAGE`, nicht endlich ergibt `NON_FINITE_FRICTION_MESSAGE`, `< 0` ergibt `NEGATIVE_FRICTION_MESSAGE`. Sonst wird der Wert ungerundet übernommen (0 ist gültig).
   - `default: { const unknown: never = params.kneadingMethod; throw new Error(unknownKneadingMethodMessage(String(unknown))); }`
3. `waterTemperature = 4 * desiredDoughTemperature - (flourTemperature + roomTemperature + starterTemperature + frictionFactor)`. Genau diese Klammerung beibehalten, die Testwerte im Plan sind damit nachgerechnet.
4. Status mit internem `FLOAT_EPSILON = 1e-9`: `waterTemperature < COLD_WATER_THRESHOLD - FLOAT_EPSILON` ergibt `cold_warning` + `COLD_WARNING_MESSAGE`, `waterTemperature > HOT_WATER_THRESHOLD + FLOAT_EPSILON` ergibt `heat_warning` + `HEAT_WARNING_MESSAGE`, sonst `ok` + `null`.
5. Rückgabe `{ waterTemperature, frictionFactor, status, message }`, ohne Rundung.

Interne Helfer (nicht exportiert): `assertFinite(value: number, message: string): void` (wie in `hydration.ts`), `resolveFriction`, `FLOAT_EPSILON`. JSDoc am Modulkopf beschreibt Formel, Einheit °C und „ungerundet, gerundet wird erst in der Anzeige“.

## Arbeitsschritte
<!-- Nummeriert, klein und einzeln prüfbar, jeweils mit AC-Bezug in Klammern. -->
1. Tests vorab (Test-Writer): `src/lib/baking-engine/ddt.test.ts` mit `// @vitest-environment node`, Fixture `referenceParams(overrides?: Partial<DdtParams>): DdtParams` (DDT 26, Mehl 20, Raum 22, Starter 24, `kneadingMethod: "hand"`) und Helfer `expectThrowMessage(fn, message)` (exakter Vergleich von `error.message`, Muster aus `hydration.test.ts`) anlegen (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
2. Tests vorab: `describe`-Blöcke `F009/AC-1` bis `F009/AC-6` mit den Fällen aus der Teststrategie schreiben, plus Literaltext-Prüfung aller exportierten Meldungskonstanten (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
3. `ddt.ts`: Typen `KneadingMethod`, `PresetKneadingMethod`, `DdtStatus`, `DdtParams`, `DdtResult` sowie `FRICTION_PRESETS` und die Grenzwert-Konstanten exportieren (AC-1, AC-5)
4. `ddt.ts`: alle Meldungskonstanten und `unknownKneadingMethodMessage` exportieren, `assertFinite` anlegen, Endlichkeitsprüfung der vier Temperaturen in fester Reihenfolge (AC-3, AC-4, AC-6)
5. `ddt.ts`: `resolveFriction` mit Preset-Zweigen, Custom-Zweig (fehlt, nicht endlich, negativ) und `never`-`default` (AC-1, AC-2, AC-6)
6. `ddt.ts`: Formel und Statuszuordnung mit `FLOAT_EPSILON`, Rückgabe ungerundet inkl. `frictionFactor` (AC-1, AC-2, AC-3, AC-4, AC-5)
7. Prüfen: `npx vitest run src/lib/baking-engine` grün (inkl. unveränderter F007/F008-Tests), `npx tsc --noEmit` ohne Fehler, `npx eslint src/lib/baking-engine` ohne Meldungen, `git status` zeigt nur die zwei neuen Dateien und `vitest.config.mts` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
8. Volle Suite stabilisieren (Abnahme für AC-1, AC-2, AC-3, AC-4, AC-5, AC-6):
   - a) In `vitest.config.mts` unter `test` `testTimeout: 15000` ergänzen (neben `environment` und `setupFiles`, kurzer Kommentar: kalter better-auth-Import nach `vi.resetModules()` dauert unter voller Parallelität über 5 s). `src/lib/auth.test.ts` bleibt unverändert.
   - b) Volle Suite `npx vitest run` mindestens dreimal hintereinander mit Standard-Parallelität laufen lassen.
   - c) Sind alle Läufe grün (411/411): fertig, `maxWorkers` wird **nicht** gesetzt.
   - d) Scheitert noch ein Lauf (z. B. weiter Timeout in `src/lib/auth.test.ts`): zusätzlich `maxWorkers: 4` unter `test` setzen und b) wiederholen. Bleibt es dann rot, nicht weiter an der Konfiguration drehen, sondern an den Hauptagenten melden.

## Teststrategie
<!-- Je AC: Testart (Unit / Komponente mit Testing Library / E2E), Testdatei, was geprüft wird. -->
Alle Tests liegen in `src/lib/baking-engine/ddt.test.ts` (Vitest, `// @vitest-environment node`) und importieren aus `@/lib/baking-engine/ddt`. Testnamen beginnen mit `F009/AC-n …`. Ganzzahlige Ergebnisse werden mit `toBe` verglichen (die Rechnung ist dort exakt), Ergebnisse mit Nachkommastellen mit `toBeCloseTo(x, 9)`, damit eine Rundung auf eine Stelle auffiele. Fehler werden über `expectThrowMessage` exakt verglichen, nicht über den Teilstring-Vergleich von `toThrow(string)`. Die Literaltexte aller Meldungskonstanten werden einmal gegen den Wortlaut aus Ticket bzw. Plan geprüft (`expect(COLD_WARNING_MESSAGE).toBe("Eiswasser erforderlich")` usw.).

Regressionsabnahme: Zusätzlich muss die volle Suite (`npx vitest run`, Standard-Parallelität) mehrfach hintereinander grün laufen (Arbeitsschritt 8). Für `vitest.config.mts` gibt es keinen eigenen Test. Den Nachweis liefert der bisher flaky Test „F003/AC-7 bricht den Import von @/lib/auth ohne BETTER_AUTH_SECRET mit der Meldung ab“ in `src/lib/auth.test.ts`, der in jedem Lauf grün sein muss.

| AC | Testart | Testdatei | Prüft |
|---|---|---|---|
| AC-1 | Unit | src/lib/baking-engine/ddt.test.ts | `it.each` über `hand` → 37/1, `stand_mixer` → 33/5, `spiral` → 29/9 mit den Referenzbedingungen: `waterTemperature`, `frictionFactor`, `status === "ok"`, `message === null`. `FRICTION_PRESETS` ist `{ hand: 1, stand_mixer: 5, spiral: 9 }`. Preset `stand_mixer` mit `customFriction: 3` ergibt weiter 33 und `frictionFactor` 5. Preset `hand` mit `customFriction` −1 bzw. NaN wirft nicht und liefert 37 (Custom-Wert wird ignoriert, auch nicht validiert). |
| AC-2 | Unit | src/lib/baking-engine/ddt.test.ts | `kneadingMethod: "custom"` mit `customFriction` 3 → 35, 0 → 38, 2,5 → 35,5 (`toBeCloseTo(35.5, 9)`), jeweils `status "ok"`, `message null` und `frictionFactor` gleich dem übergebenen Wert (2,5 nicht gerundet). |
| AC-3 | Unit | src/lib/baking-engine/ddt.test.ts | DDT 24, Mehl 26, Raum 30, Starter 28, `spiral` → `waterTemperature` 3, `status "cold_warning"`, `message` „Eiswasser erforderlich“. Negatives Ergebnis: DDT 24, Mehl 26, Raum 30, Starter 28, `custom` 14 → −2 unverändert (`toBe(-2)`), gleicher Status und gleiche Meldung. |
| AC-4 | Unit | src/lib/baking-engine/ddt.test.ts | DDT 27, Mehl 15, Raum 17, Starter 18, `hand` → 57, `status "heat_warning"`, `message` „Kritische Temperatur für Starter-Mikroben!“. |
| AC-5 | Unit | src/lib/baking-engine/ddt.test.ts | DDT 26, Mehl 30, Raum 32, Starter 29, `spiral` → 4, `ok`, `null`. DDT 26, Mehl 18, Raum 20, Starter 20, `hand` → 45, `ok`, `null`. Mehl 30,1 (sonst wie 4-°C-Fall) → `toBeCloseTo(3.9, 9)`, `cold_warning`. Raum 19,9 (sonst wie 45-°C-Fall) → `toBeCloseTo(45.1, 9)`, `heat_warning`. Gleitkomma-Grenzfälle (fachlich exakt auf der Grenze, roh minimal daneben): DDT 16,4, Mehl 6,6, Raum 22, Starter 24, `spiral` (roh `3.999999999999993`) → `ok`. DDT 21,6, Mehl −4,6, Raum 22, Starter 24, `custom` 0 (roh `45.00000000000001`) → `ok`. In beiden Fällen ist `waterTemperature` `toBeCloseTo(4 bzw. 45, 9)`. `COLD_WATER_THRESHOLD` ist 4, `HOT_WATER_THRESHOLD` ist 45. |
| AC-6 | Unit | src/lib/baking-engine/ddt.test.ts | `it.each([NaN, Infinity, -Infinity])` je Feld: `desiredDoughTemperature` → „Die Teigtemperatur muss eine gültige Zahl sein.“, `flourTemperature` → „Die Mehltemperatur …“, `roomTemperature` → „Die Raumtemperatur …“, `starterTemperature` → „Die Startertemperatur …“, `custom` + `customFriction` → „Die Knetreibung muss eine gültige Zahl sein.“. `custom` ohne `customFriction` → „Für eigene Knetreibung muss ein Wert angegeben werden.“. `custom` mit −1 und −0,1 → „Die Knetreibung darf nicht negativ sein.“. Jeder dieser Aufrufe wirft, ein Ergebnis wird nie zugewiesen (Variable bleibt `undefined`). Gültige Negativwerte: Mehl −18 mit Referenzbedingungen und `hand` → 75 und `heat_warning` (kein Fehler); Raum −5 → 64 bzw. Starter −2 → 63 (sonst Referenzbedingungen, `hand`) werden normal verrechnet. Keine Obergrenze: DDT 100 mit `hand` → 333, kein Fehler. Unbekannte Knetart `"kitchen" as unknown as KneadingMethod` → exakt „Unbekannte Knetart: kitchen.“ (Schutz gegen `NaN` aus ungeprüften Daten). |

## Risiken & Rollback
- **Custom-Wert bei Preset wird nicht validiert:** AC-1 verlangt, dass ein Custom-Wert bei Preset ignoriert wird. AC-6 nennt einen ungültigen Custom-Reibungswert als Fehlerfall, ohne die Knetart zu nennen. Der Plan liest beides so: Geprüft wird nur bei `custom`, bei einem Preset wirft auch `customFriction: NaN` oder `-1` nicht (Test in AC-1). Wird dem Hauptagenten zur Bestätigung gemeldet. Soll stattdessen immer validiert werden, ändern sich ein Testfall und eine Zeile in `resolveFriction`.
- **Nicht vorgegebene Meldungstexte:** Das Ticket gibt die Texte für DDT, negative und fehlende Reibung wörtlich vor, für Mehl, Raum und Starter nur „analog“. Der Plan legt „Die Mehl-/Raum-/Startertemperatur muss eine gültige Zahl sein.“ und für eine nicht endliche Custom-Reibung „Die Knetreibung muss eine gültige Zahl sein.“ fest, außerdem „Unbekannte Knetart: <wert>.“ (Muster aus F008).
- **Gleitkomma-Puffer an den Grenzen:** Mit `FLOAT_EPSILON = 1e-9` wird ein Rohwert wie 3,999999999999993 als `ok` eingestuft. Echte Werte wie 3,9 bzw. 45,1 (AC-5) liegen weit außerhalb des Puffers. Der Rückgabewert bleibt ungerundet, die UI rundet später selbst. Ohne den Puffer würde AC-5 bei Eingaben mit Nachkommastellen sporadisch verletzt.
- **Bezeichner der Knetarten** (`hand`, `stand_mixer`, `spiral`, `custom`) sind ab jetzt öffentliche API. Werden sie später gespeichert (nicht in diesem Ticket), wäre eine Umbenennung eine Datenmigration.
- **Flaky Timeout in `src/lib/auth.test.ts` (unabhängig von F009):** Unter voller Parallelität (33 Worker) dauert der kalte Import von better-auth nach `vi.resetModules()` 5,2 bis 6,5 s und reißt den Standard-Timeout von 5000 ms (Ergebnis 410/411). Allein bzw. mit `--maxWorkers=4` ist die Datei grün. Nach Entscheidung des Nutzers wird `testTimeout: 15000` global gesetzt, `maxWorkers: 4` nur bei weiterem Fehlschlag. Nebenwirkung: Ein wirklich hängender Test fällt erst nach 15 s statt 5 s auf. `maxWorkers: 4` würde die Suite auf schnellen Rechnern verlangsamen, deshalb nur bedingt. Die Ursache (langsamer Kaltimport) bleibt bestehen und kann bei weiter wachsender Suite wieder auftreten.
- **Keine Breaking Changes:** Es kommen zwei neue Dateien dazu, dazu eine Testkonfigurationsänderung ohne Einfluss auf Produktionscode. Bestehender Code und bestehende Tests bleiben unberührt. Rollback: den F009-Commit reverten bzw. `src/lib/baking-engine/ddt.ts` und `ddt.test.ts` löschen und die Änderung an `vitest.config.mts` zurücknehmen.
