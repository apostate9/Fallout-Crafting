import { MODULE_ID } from "./config.js";
import { resolveSuccess, resolveFailure } from "./crafting.js";

/**
 * Called from the renderChatMessage hook — rebinds action buttons after reload.
 */
export function bindChatCardButtons(html, message) {
  const state = message.getFlag(MODULE_ID, "craftingState");
  if (!state) return;

  html.querySelector("[data-action='craft-success']")
    ?.addEventListener("click", () => resolveSuccess(message.id));

  html.querySelector("[data-action='craft-failure']")
    ?.addEventListener("click", () => resolveFailure(message.id));

  html.querySelector("[data-action='craft-roll-prompt']")
    ?.addEventListener("click", () => sendRollPrompt(state));
}

async function sendRollPrompt(state) {
  const skillLabel = state.skill;   // renderer can look up the label if needed
  const content = game.i18n.format("FALLOUT_D30_CRAFTING.Chat.RollPrompt", {
    actor: state.actorName,
    skill: skillLabel,
    dc:    state.difficulty,
    recipe: state.recipeName,
  });
  await ChatMessage.create({
    content,
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
  });
}
