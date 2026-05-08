import { MODULE_ID } from "./config.js";
import { getRecipesSetting } from "./settings.js";

// ── Validation ────────────────────────────────────────────────────────────────

function isValidIngredient(obj) {
  return obj && typeof obj.itemUuid === "string" && obj.itemUuid.length > 0
    && typeof obj.quantity === "number" && obj.quantity > 0;
}

function isValidRecipe(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.id !== "string" || !obj.id) return false;
  if (typeof obj.name !== "string" || !obj.name) return false;
  if (typeof obj.bench !== "string") return false;
  if (typeof obj.skill !== "string") return false;
  if (typeof obj.difficulty !== "number") return false;
  if (!Array.isArray(obj.ingredients) || obj.ingredients.length === 0) return false;
  if (!Array.isArray(obj.outputs) || obj.outputs.length === 0) return false;
  if (!obj.ingredients.every(isValidIngredient)) return false;
  if (!obj.outputs.every(isValidIngredient)) return false;
  return true;
}

function normaliseRecipe(raw) {
  return {
    id:               raw.id,
    name:             String(raw.name ?? ""),
    description:      String(raw.description ?? ""),
    bench:            String(raw.bench ?? "none"),
    skill:            String(raw.skill ?? ""),
    difficulty:       Number(raw.difficulty ?? 0),
    schematicItemUuid:raw.schematicItemUuid ?? null,
    ingredients:      (raw.ingredients ?? []).map(i => ({ itemUuid: String(i.itemUuid), quantity: Number(i.quantity) })),
    outputs:          (raw.outputs ?? []).map(o => ({ itemUuid: String(o.itemUuid), quantity: Number(o.quantity) })),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getAllRecipes() {
  return getRecipesSetting().map(normaliseRecipe);
}

export function getRecipe(id) {
  return getAllRecipes().find(r => r.id === id) ?? null;
}

export async function saveRecipe(recipe) {
  if (!isValidRecipe(recipe)) throw new Error("fallout-d30-crafting | Invalid recipe shape");
  const all = getAllRecipes();
  const idx = all.findIndex(r => r.id === recipe.id);
  if (idx >= 0) all[idx] = normaliseRecipe(recipe);
  else          all.push(normaliseRecipe(recipe));
  await game.settings.set(MODULE_ID, "recipes", all);
  return recipe;
}

export async function deleteRecipe(id) {
  const all = getAllRecipes().filter(r => r.id !== id);
  await game.settings.set(MODULE_ID, "recipes", all);
}

export async function saveAllRecipes(recipes) {
  const normalised = recipes.map(normaliseRecipe);
  for (const r of normalised) {
    if (!isValidRecipe(r)) throw new Error(`fallout-d30-crafting | Invalid recipe: ${r.name}`);
  }
  await game.settings.set(MODULE_ID, "recipes", normalised);
}

export function duplicateRecipe(id) {
  const src = getRecipe(id);
  if (!src) return null;
  return { ...foundry.utils.deepClone(src), id: foundry.utils.randomID(), name: src.name + " (Copy)" };
}

// ── Import / Export ───────────────────────────────────────────────────────────

export function exportRecipesJSON() {
  return JSON.stringify(getAllRecipes(), null, 2);
}

export async function importRecipesJSON(json, { merge = false } = {}) {
  let parsed;
  try { parsed = JSON.parse(json); }
  catch { throw new Error("fallout-d30-crafting | JSON parse error"); }
  if (!Array.isArray(parsed)) throw new Error("fallout-d30-crafting | Expected a JSON array of recipes");
  const incoming = parsed.map(normaliseRecipe);
  for (const r of incoming) {
    if (!isValidRecipe(r)) throw new Error(`fallout-d30-crafting | Invalid recipe in import: ${r.name}`);
  }
  if (!merge) {
    await saveAllRecipes(incoming);
    return;
  }
  const existing = getAllRecipes();
  const byId = Object.fromEntries(existing.map(r => [r.id, r]));
  for (const r of incoming) byId[r.id] = r;
  await saveAllRecipes(Object.values(byId));
}
