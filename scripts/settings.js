import { MODULE_ID, DEFAULT_BENCH_TYPES, DEFAULT_SKILLS, FAILURE_MODES } from "./config.js";

export function registerSettings() {
  // Hidden data stores — managed through the Recipe Manager UI
  game.settings.register(MODULE_ID, "recipes", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE_ID, "benchTypes", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_BENCH_TYPES,
  });

  game.settings.register(MODULE_ID, "skills", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_SKILLS,
  });

  // Visible world settings
  game.settings.register(MODULE_ID, "failureMode", {
    name: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.FailureMode.Name"),
    hint: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.FailureMode.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [FAILURE_MODES.TIME]:    game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.FailureMode.Time"),
      [FAILURE_MODES.CONSUME]: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.FailureMode.Consume"),
    },
    default: FAILURE_MODES.TIME,
  });

  game.settings.register(MODULE_ID, "cooldownSeconds", {
    name: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.CooldownSeconds.Name"),
    hint: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.CooldownSeconds.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 86400,
  });

  game.settings.register(MODULE_ID, "playersCanChangeBench", {
    name: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.PlayersCanChangeBench.Name"),
    hint: game.i18n.localize("FALLOUT_D30_CRAFTING.Settings.PlayersCanChangeBench.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // Client-scoped: remembers last bench per user
  game.settings.register(MODULE_ID, "lastBenchType", {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
}

export function getRecipesSetting()    { return game.settings.get(MODULE_ID, "recipes"); }
export function getBenchTypesSetting() { return game.settings.get(MODULE_ID, "benchTypes"); }
export function getSkillsSetting()     { return game.settings.get(MODULE_ID, "skills"); }
export function getFailureMode()       { return game.settings.get(MODULE_ID, "failureMode"); }
export function getCooldownSeconds()   { return game.settings.get(MODULE_ID, "cooldownSeconds"); }
export function playersCanChangeBench(){ return game.settings.get(MODULE_ID, "playersCanChangeBench"); }
export function getLastBenchType()     { return game.settings.get(MODULE_ID, "lastBenchType"); }
export function setLastBenchType(v)    { return game.settings.set(MODULE_ID, "lastBenchType", v); }
