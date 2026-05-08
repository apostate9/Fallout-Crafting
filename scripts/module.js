import { MODULE_ID } from "./config.js";
import { registerSettings, getBenchTypesSetting } from "./settings.js";
import { getAllRecipes, exportRecipesJSON, importRecipesJSON, getRecipe, saveRecipe } from "./recipes.js";
import { initiateCraft } from "./crafting.js";
import { bindChatCardButtons } from "./chat.js";
import { RecipeManager } from "./apps/recipe-manager.js";
import { CraftingWindow } from "./apps/crafting-window.js";

// ── Init ──────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  registerSettings();
  registerHandlebarsHelpers();
  preloadTemplates();
});

// ── Ready ─────────────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  exposeAPI();
  console.log(`${MODULE_ID} | Ready`);
});

// ── Scene controls (GM recipe manager button) ─────────────────────────────────

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tokenLayer = controls.find(c => c.name === "token");
  if (!tokenLayer) return;
  tokenLayer.tools.push({
    name:  "recipe-manager",
    title: game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.Title"),
    icon:  "fas fa-flask",
    button: true,
    onClick: () => new RecipeManager().render({ force: true }),
  });
});

// ── Chat card buttons ─────────────────────────────────────────────────────────

Hooks.on("renderChatMessage", (message, html) => {
  // V13 passes HTMLElement; guard for jQuery wrapper in older versions
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;
  bindChatCardButtons(root, message);
  if (game.user.isGM) {
    root.querySelectorAll(".gm-btn").forEach(btn => btn.style.removeProperty("display"));
  }
});

// ── Handlebars helpers ────────────────────────────────────────────────────────

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("eq", (a, b, options) => {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper("benchTypeLabel", (benchId, benchTypes) => {
    if (!Array.isArray(benchTypes)) return benchId;
    return benchTypes.find(b => b.id === benchId)?.label ?? benchId;
  });
}

// ── Template preload ──────────────────────────────────────────────────────────

function preloadTemplates() {
  return loadTemplates([
    `modules/${MODULE_ID}/templates/recipe-manager.hbs`,
    `modules/${MODULE_ID}/templates/crafting-window.hbs`,
    `modules/${MODULE_ID}/templates/crafting-card.hbs`,
    `modules/${MODULE_ID}/templates/bench-editor.hbs`,
    `modules/${MODULE_ID}/templates/skills-editor.hbs`,
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

function exposeAPI() {
  const api = {
    openCrafting(actor, benchType) {
      if (!actor) { ui.notifications.warn(game.i18n.localize("FALLOUT_D30_CRAFTING.Macro.NoActor")); return; }
      return new CraftingWindow(actor, benchType).render({ force: true });
    },
    openRecipeManager() {
      if (!game.user.isGM) { ui.notifications.warn("Recipe Manager is GM-only."); return; }
      return new RecipeManager().render({ force: true });
    },
    craft:          initiateCraft,
    getRecipes:     getAllRecipes,
    setRecipes:     (recipes) => {
      if (!game.user.isGM) throw new Error("setRecipes is GM-only");
      return game.settings.set(MODULE_ID, "recipes", recipes);
    },
    exportRecipes:  exportRecipesJSON,
    importRecipes:  importRecipesJSON,
  };
  game.modules.get(MODULE_ID).api = api;
}
