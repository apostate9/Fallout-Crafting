import { MODULE_ID } from "./config.js";
import { getRecipe } from "./recipes.js";
import { heldQuantity, actorHasItem, buildConsumption, buildGrant, applyConsumption, applyGrant } from "./inventory.js";
import { getFailureMode, getCooldownSeconds } from "./settings.js";
import { FAILURE_MODES } from "./config.js";

// ── Cooldown helpers ──────────────────────────────────────────────────────────

export function getCooldownExpiry(actor, recipeId) {
  return actor.getFlag(MODULE_ID, `cooldowns.${recipeId}`) ?? 0;
}

export function isCoolingDown(actor, recipeId) {
  return game.time.worldTime < getCooldownExpiry(actor, recipeId);
}

export function cooldownRemaining(actor, recipeId) {
  return Math.max(0, getCooldownExpiry(actor, recipeId) - game.time.worldTime);
}

async function setCooldown(actor, recipeId) {
  const expiry = game.time.worldTime + getCooldownSeconds();
  await actor.setFlag(MODULE_ID, `cooldowns.${recipeId}`, expiry);
}

async function clearCooldown(actor, recipeId) {
  await actor.unsetFlag(MODULE_ID, `cooldowns.${recipeId}`);
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate that actor can attempt this recipe.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export async function validateCraft(actor, recipe) {
  if (isCoolingDown(actor, recipe.id)) {
    const secs = cooldownRemaining(actor, recipe.id);
    return { valid: false, reason: game.i18n.format("FALLOUT_D30_CRAFTING.Cooldown.Remaining", { time: formatDuration(secs) }) };
  }

  if (recipe.schematicItemUuid) {
    const has = await actorHasItem(actor, recipe.schematicItemUuid);
    if (!has) {
      return { valid: false, reason: game.i18n.localize("FALLOUT_D30_CRAFTING.Craft.MissingSchematic") };
    }
  }

  for (const ing of recipe.ingredients) {
    let template;
    try { template = await fromUuid(ing.itemUuid); }
    catch { return { valid: false, reason: game.i18n.format("FALLOUT_D30_CRAFTING.Craft.BadIngredientUUID", { uuid: ing.itemUuid }) }; }
    if (!template) return { valid: false, reason: game.i18n.format("FALLOUT_D30_CRAFTING.Craft.BadIngredientUUID", { uuid: ing.itemUuid }) };

    const held = heldQuantity(actor, template);
    if (held < ing.quantity) {
      return {
        valid: false,
        reason: game.i18n.format("FALLOUT_D30_CRAFTING.Craft.InsufficientIngredient", {
          name: template.name, held, required: ing.quantity,
        }),
      };
    }
  }

  return { valid: true };
}

// ── Initiate craft (posts chat card) ─────────────────────────────────────────

export async function initiateCraft(actor, recipeId) {
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    ui.notifications.error(`fallout-d30-crafting | Recipe ${recipeId} not found`);
    return null;
  }

  const { valid, reason } = await validateCraft(actor, recipe);
  if (!valid) {
    ui.notifications.warn(reason);
    return null;
  }

  // Resolve display data for the card
  const ingredientDisplay = await Promise.all(recipe.ingredients.map(async ing => {
    const item = await fromUuid(ing.itemUuid).catch(() => null);
    return { name: item?.name ?? ing.itemUuid, img: item?.img ?? "", quantity: ing.quantity, uuid: ing.itemUuid };
  }));

  const outputDisplay = await Promise.all(recipe.outputs.map(async out => {
    const item = await fromUuid(out.itemUuid).catch(() => null);
    return { name: item?.name ?? out.itemUuid, img: item?.img ?? "", quantity: out.quantity, uuid: out.itemUuid };
  }));

  let schematicDisplay = null;
  if (recipe.schematicItemUuid) {
    const item = await fromUuid(recipe.schematicItemUuid).catch(() => null);
    schematicDisplay = { name: item?.name ?? recipe.schematicItemUuid, img: item?.img ?? "" };
  }

  const craftingState = {
    recipeId:   recipe.id,
    actorId:    actor.id,
    actorName:  actor.name,
    recipeName: recipe.name,
    skill:      recipe.skill,
    difficulty: recipe.difficulty,
    schematic:  schematicDisplay,
    ingredients: ingredientDisplay,
    outputs:    outputDisplay,
    resolved:   false,
    outcome:    null,
  };

  const content = await renderTemplate(
    `modules/${MODULE_ID}/templates/crafting-card.hbs`,
    { craftingState, isGM: false }
  );

  const whisperIds = [
    ...game.users.filter(u => u.isGM).map(u => u.id),
    game.user.id,
  ];

  const msg = await ChatMessage.create({
    content,
    whisper: whisperIds,
    flags: { [MODULE_ID]: { craftingState } },
  });

  return msg;
}

// ── Resolution ────────────────────────────────────────────────────────────────

export async function resolveSuccess(messageId) {
  const msg = game.messages.get(messageId);
  if (!msg) return;
  const state = msg.getFlag(MODULE_ID, "craftingState");
  if (!state || state.resolved) return;

  const actor = game.actors.get(state.actorId);
  if (!actor) {
    ui.notifications.error(game.i18n.localize("FALLOUT_D30_CRAFTING.Craft.ActorNotFound"));
    return;
  }

  const recipe = getRecipe(state.recipeId);
  if (!recipe) {
    ui.notifications.error(game.i18n.localize("FALLOUT_D30_CRAFTING.Craft.RecipeNotFound"));
    return;
  }

  // Build all ops before applying any — atomicity
  let consumeOps, grantOps;
  try {
    consumeOps = await buildAllConsumptions(actor, recipe);
    grantOps   = await buildAllGrants(actor, recipe);
  } catch (e) {
    ui.notifications.error(e.message);
    return;
  }

  // Apply
  for (const [template, ops] of consumeOps) await applyConsumption(actor, ops);
  for (const op of grantOps) await applyGrant(actor, op);

  await clearCooldown(actor, recipe.id);

  await updateChatState(msg, { resolved: true, outcome: "success" });
}

export async function resolveFailure(messageId) {
  const msg = game.messages.get(messageId);
  if (!msg) return;
  const state = msg.getFlag(MODULE_ID, "craftingState");
  if (!state || state.resolved) return;

  const actor = game.actors.get(state.actorId);
  if (!actor) {
    ui.notifications.error(game.i18n.localize("FALLOUT_D30_CRAFTING.Craft.ActorNotFound"));
    return;
  }

  const recipe = getRecipe(state.recipeId);
  if (!recipe) {
    ui.notifications.error(game.i18n.localize("FALLOUT_D30_CRAFTING.Craft.RecipeNotFound"));
    return;
  }

  const mode = getFailureMode();
  if (mode === FAILURE_MODES.CONSUME) {
    let consumeOps;
    try { consumeOps = await buildAllConsumptions(actor, recipe); }
    catch (e) { ui.notifications.error(e.message); return; }
    for (const [template, ops] of consumeOps) await applyConsumption(actor, ops);
  }

  await setCooldown(actor, recipe.id);
  await updateChatState(msg, { resolved: true, outcome: "failure" });
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function buildAllConsumptions(actor, recipe) {
  const ops = [];
  for (const ing of recipe.ingredients) {
    const template = await fromUuid(ing.itemUuid);
    if (!template) throw new Error(`fallout-d30-crafting | Cannot resolve ingredient UUID "${ing.itemUuid}"`);
    ops.push([template, buildConsumption(actor, template, ing.quantity)]);
  }
  return ops;
}

async function buildAllGrants(actor, recipe) {
  const ops = [];
  for (const out of recipe.outputs) {
    ops.push(await buildGrant(actor, out.itemUuid, out.quantity));
  }
  return ops;
}

async function updateChatState(msg, patch) {
  const state = foundry.utils.mergeObject(
    foundry.utils.deepClone(msg.getFlag(MODULE_ID, "craftingState")),
    patch
  );
  const content = await renderTemplate(
    `modules/${MODULE_ID}/templates/crafting-card.hbs`,
    { craftingState: state, isGM: game.user.isGM }
  );
  await msg.update({ content, [`flags.${MODULE_ID}.craftingState`]: state });
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
