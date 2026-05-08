import { MODULE_ID } from "../config.js";
import { getAllRecipes } from "../recipes.js";
import { getBenchTypesSetting, getSkillsSetting, playersCanChangeBench, getLastBenchType, setLastBenchType } from "../settings.js";
import { heldQuantity, actorHasItem } from "../inventory.js";
import { initiateCraft, isCoolingDown, cooldownRemaining, formatDuration } from "../crafting.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftingWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fallout-d30-crafting-window",
    tag: "div",
    window: { title: "FALLOUT_D30_CRAFTING.CraftingWindow.Title", resizable: true },
    position: { width: 680, height: 600 },
    classes: ["fallout-d30-crafting", "crafting-window"],
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/crafting-window.hbs` },
  };

  #actor = null;
  #benchType = null;
  #filter = "";

  constructor(actor, benchType, options = {}) {
    super(options);
    this.#actor    = actor;
    this.#benchType = benchType ?? getLastBenchType() ?? "none";
  }

  get title() {
    return `${game.i18n.localize("FALLOUT_D30_CRAFTING.CraftingWindow.Title")} — ${this.#actor?.name ?? ""}`;
  }

  async _prepareContext() {
    const actor      = this.#actor;
    const benchType  = this.#benchType;
    const benchTypes = getBenchTypesSetting();
    const skills     = getSkillsSetting();
    const skillMap   = Object.fromEntries(skills.map(s => [s.key, s.label]));
    const allRecipes = getAllRecipes();
    const canChange  = playersCanChangeBench() || game.user.isGM;

    // Filter by bench (include "none" recipes always) and text search
    const visible = allRecipes.filter(r =>
      (r.bench === benchType || r.bench === "none") &&
      (!this.#filter || r.name.toLowerCase().includes(this.#filter.toLowerCase()) ||
       r.description.toLowerCase().includes(this.#filter.toLowerCase()))
    );

    const enriched = await Promise.all(visible.map(async r => {
      const cooling  = isCoolingDown(actor, r.id);
      const coolSecs = cooldownRemaining(actor, r.id);

      const hasSchematic = r.schematicItemUuid
        ? await actorHasItem(actor, r.schematicItemUuid)
        : true;

      let schematicDisplay = null;
      if (r.schematicItemUuid) {
        const item = await fromUuid(r.schematicItemUuid).catch(() => null);
        schematicDisplay = { name: item?.name ?? r.schematicItemUuid, img: item?.img ?? "", held: hasSchematic };
      }

      const ingredients = await Promise.all(r.ingredients.map(async ing => {
        const item    = await fromUuid(ing.itemUuid).catch(() => null);
        const held    = item ? heldQuantity(actor, item) : 0;
        const enough  = held >= ing.quantity;
        return { name: item?.name ?? ing.itemUuid, img: item?.img ?? "", held, required: ing.quantity, enough };
      }));

      const outputs = await Promise.all(r.outputs.map(async out => {
        const item = await fromUuid(out.itemUuid).catch(() => null);
        return { name: item?.name ?? out.itemUuid, img: item?.img ?? "", quantity: out.quantity };
      }));

      const canCraft = !cooling && hasSchematic && ingredients.every(i => i.enough);

      return {
        ...r,
        skillLabel:      skillMap[r.skill] ?? r.skill,
        schematic:       schematicDisplay,
        ingredients,
        outputs,
        canCraft,
        cooling,
        cooldownLabel:   cooling ? formatDuration(coolSecs) : null,
      };
    }));

    return {
      actor,
      benchType,
      benchTypes,
      canChange,
      filter: this.#filter,
      recipes: enriched,
    };
  }

  _onRender(context, options) {
    const html = this.element;

    html.querySelector(".bench-select")?.addEventListener("change", e => {
      this.#benchType = e.target.value;
      setLastBenchType(this.#benchType);
      this.render();
    });

    html.querySelector(".recipe-filter")?.addEventListener("input", e => {
      this.#filter = e.target.value;
      this.render();
    });

    html.querySelectorAll(".recipe-row").forEach(row => {
      row.querySelector(".recipe-name")?.addEventListener("click", () => {
        row.classList.toggle("expanded");
      });
    });

    html.querySelectorAll("[data-action='craft']").forEach(btn => {
      btn.addEventListener("click", async () => {
        const recipeId = btn.dataset.recipeId;
        btn.disabled = true;
        await initiateCraft(this.#actor, recipeId);
        this.render();
      });
    });
  }
}
