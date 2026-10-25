import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDnd5eJson } from "../src/dnd5e-import.ts";

test("normalizes common direct D&D 5e fields", () => {
  const sheet = normalizeDnd5eJson({
    name: "Aria",
    race: "Elf",
    class: "Ranger",
    level: 3,
    proficiencyBonus: 2,
    armorClass: 15,
    initiative: 3,
    speed: 30,
    hp: { current: 18, max: 24, temp: 2 },
    abilities: { str: 10, dex: 16, con: 12, int: 11, wis: 14, cha: 8 },
    skills: { perception: 4 },
    equipment: [{ name: "Longbow" }],
    spells: ["Hunter's Mark"],
    features: [{ name: "Favored Enemy" }],
    notes: "Scout"
  });

  assert.equal(sheet.name, "Aria");
  assert.equal(sheet.race, "Elf");
  assert.equal(sheet.className, "Ranger");
  assert.equal(sheet.level, 3);
  assert.equal(sheet.armorClass, 15);
  assert.equal(sheet.hitPoints.current, 18);
  assert.equal(sheet.hitPoints.maximum, 24);
  assert.equal(sheet.hitPoints.temporary, 2);
  assert.equal(sheet.abilities.dex, 16);
  assert.deepEqual(sheet.skills, { perception: 4 });
  assert.equal((sheet.equipment[0] as { name: string }).name, "Longbow");
  assert.equal(sheet.raw.name, "Aria");
});

test("normalizes nested character exports and sums multiclass levels", () => {
  const sheet = normalizeDnd5eJson({
    character: {
      name: "Bram",
      classes: [{ name: "Fighter", level: 2 }, { name: "Wizard", level: 1 }],
      stats: { strength: { score: 16 }, dexterity: { score: 12 } },
      combat: { ac: 17, hp: { current: 20, max: 20 } }
    }
  });

  assert.equal(sheet.name, "Bram");
  assert.equal(sheet.className, "Fighter / Wizard");
  assert.equal(sheet.level, 3);
  assert.equal(sheet.abilities.str, 16);
  assert.equal(sheet.abilities.dex, 12);
  assert.equal(sheet.armorClass, 17);
  assert.equal(sheet.hitPoints.maximum, 20);
});

test("rejects empty objects and array roots", () => {
  assert.throws(() => normalizeDnd5eJson({}), /об’єкт персонажа/);
  assert.throws(() => normalizeDnd5eJson([]), /об’єкт персонажа/);
});

test("preserves unknown source fields in raw JSON", () => {
  const source = { name: "Nyx", customSourceField: { marker: true } };
  const sheet = normalizeDnd5eJson(source);
  assert.deepEqual(sheet.raw.customSourceField, { marker: true });
});
