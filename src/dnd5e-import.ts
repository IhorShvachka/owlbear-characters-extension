export type JsonObject = Record<string, unknown>;

export type Dnd5eSheet = {
  name: string;
  race: string;
  className: string;
  background: string;
  level: number | null;
  proficiencyBonus: number | null;
  armorClass: number | null;
  initiative: number | null;
  speed: string;
  hitPoints: { current: number | null; maximum: number | null; temporary: number | null };
  abilities: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number | null>;
  skills: JsonObject;
  savingThrows: JsonObject;
  equipment: unknown[];
  spells: unknown[];
  features: unknown[];
  notes: string;
  raw: JsonObject;
};

const asObject = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null && value !== "");
}
function text(value: unknown, fallback = ""): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return fallback;
}
function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

/**
 * Best-effort D&D 5e JSON normalizer. It accepts common direct exports and
 * preserves the original object so unsupported source-specific data is not lost.
 * It deliberately does not execute formulas or trust HTML embedded in the file.
 */
export function normalizeDnd5eJson(input: unknown): Dnd5eSheet {
  const root = asObject(input);
  if (!Object.keys(root).length) throw new Error("JSON має містити об’єкт персонажа, а не масив або порожнє значення.");

  const data = asObject(first(root.character, root.data, root.payload, root));
  const stats = asObject(first(data.stats, data.abilities, data.abilityScores));
  const combat = asObject(first(data.combat, data.defenses));
  const hp = asObject(first(data.hitPoints, data.hp, combat.hitPoints, combat.hp));
  // A plain string class (e.g. "Ranger") is a valid common export shape,
  // but it must not be treated as a class object and normalized to an empty name.
  const classSource = first(data.classes, typeof data.class === "string" ? undefined : data.class);
  const classes = array(classSource).map(item => asObject(item));
  const className = classes.length
    ? classes.map(item => text(first(item.name, asObject(item.definition).name, item.className))).filter(Boolean).join(" / ")
    : text(first(data.className, typeof data.class === "string" ? data.class : undefined, asObject(data.class).name));
  const ability = (short: string, long: string): number | null => {
    const value = first(stats[short], stats[long], asObject(stats[long]).score, asObject(data[short]).score, data[long]);
    return number(first(asObject(value).score, asObject(value).value, value));
  };
  const currentHp = number(first(hp.current, hp.currentHitPoints, hp.value, data.currentHp));
  const maxHp = number(first(hp.maximum, hp.max, hp.maxHitPoints, data.maxHp));
  const levelFromClasses = classes.reduce((sum, item) => sum + (number(item.level) ?? 0), 0);
  const inventory = first(data.inventory, data.equipment, data.items);
  const spellData = first(data.spells, asObject(data.spellcasting).spells);
  const features = first(data.features, data.traits, data.feats);

  return {
    name: text(first(data.name, data.characterName, data.label, root.name), "Персонаж без імені"),
    race: text(first(data.race, data.species, asObject(data.race).name, asObject(data.species).name)),
    className,
    background: text(first(data.background, asObject(data.background).name)),
    level: number(first(data.level, levelFromClasses || null)),
    proficiencyBonus: number(first(data.proficiencyBonus, data.proficiency, stats.proficiencyBonus)),
    armorClass: number(first(data.armorClass, data.ac, combat.armorClass, combat.ac)),
    initiative: number(first(data.initiative, combat.initiative)),
    speed: text(first(data.speed, asObject(data.movement).walk, asObject(data.speed).walk)),
    hitPoints: {
      current: currentHp,
      maximum: maxHp,
      temporary: number(first(hp.temporary, hp.temp, data.temporaryHp))
    },
    abilities: {
      str: ability("str", "strength"),
      dex: ability("dex", "dexterity"),
      con: ability("con", "constitution"),
      int: ability("int", "intelligence"),
      wis: ability("wis", "wisdom"),
      cha: ability("cha", "charisma")
    },
    skills: asObject(first(data.skills, stats.skills)),
    savingThrows: asObject(first(data.savingThrows, data.saves, stats.savingThrows)),
    equipment: array(inventory),
    spells: array(spellData),
    features: array(features),
    notes: text(first(data.notes, data.description, data.backstory)),
    raw: root
  };
}

export async function readDnd5eJsonFile(file: File): Promise<Dnd5eSheet> {
  if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
    throw new Error("Вибери файл із розширенням .json.");
  }
  const MAX_BYTES = 2 * 1024 * 1024;
  if (file.size > MAX_BYTES) throw new Error("Файл завеликий. Максимальний розмір для імпорту — 2 МБ.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Файл не є коректним JSON. Перевір його та спробуй ще раз.");
  }
  return normalizeDnd5eJson(parsed);
}
