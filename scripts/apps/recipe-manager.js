import { MODULE_ID } from "../config.js";
import { getAllRecipes, getRecipe, saveRecipe, deleteRecipe, duplicateRecipe, exportRecipesJSON, importRecipesJSON } from "../recipes.js";
import { getBenchTypesSetting, getSkillsSetting } from "../settings.js";
import { BenchEditor } from "./bench-editor.js";
import { SkillsEditor } from "./skills-editor.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RecipeManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fallout-d30-recipe-manager",
    tag: "div",
    window: { title: "FALLOUT_D30_CRAFTING.RecipeManager.Title", resizable: true },
    position: { width: 900, height: 650 },
    classes: ["fallout-d30-crafting", "recipe-manager"],
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/recipe-manager.hbs` },
  };

  #selectedId = null;
  #filter = "";
  #draft = null;      // working copy of the selected recipe
  #dirty = false;

  async _prepareContext() {
    const allRecipes = getAllRecipes();
    const benchTypes = getBenchTypesSetting();
    const skills     = getSkillsSetting();
    const filtered   = allRecipes.filter(r =>
      !this.#filter || r.name.toLowerCase().includes(this.#filter.toLowerCase())
    );

    let draft = this.#draft;
    if (!draft && this.#selectedId) {
      draft = foundry.utils.deepClone(getRecipe(this.#selectedId));
      this.#draft = draft;
    }

    // Enrich draft ingredient/output display names
    if (draft) {
      draft = foundry.utils.deepClone(draft);
      draft.ingredients = await Promise.all(draft.ingredients.map(async ing => {
        const item = await fromUuid(ing.itemUuid).catch(() => null);
        return { ...ing, itemName: item?.name ?? ing.itemUuid, itemImg: item?.img ?? "" };
      }));
      draft.outputs = await Promise.all(draft.outputs.map(async out => {
        const item = await fromUuid(out.itemUuid).catch(() => null);
        return { ...out, itemName: item?.name ?? out.itemUuid, itemImg: item?.img ?? "" };
      }));
      if (draft.schematicItemUuid) {
        const item = await fromUuid(draft.schematicItemUuid).catch(() => null);
        draft.schematicName = item?.name ?? draft.schematicItemUuid;
        draft.schematicImg  = item?.img ?? "";
      }
    }

    return { recipes: filtered, benchTypes, skills, draft, dirty: this.#dirty };
  }

  _onRender(context, options) {
    const html = this.element;

    // List interactions
    html.querySelector(".recipe-search")?.addEventListener("input", e => {
      this.#filter = e.target.value;
      this.render();
    });

    html.querySelectorAll(".recipe-list-row").forEach(row => {
      row.addEventListener("click", async () => {
        if (this.#dirty) {
          const confirm = await foundry.applications.api.DialogV2.confirm({
            content: game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.UnsavedChanges"),
          });
          if (!confirm) return;
        }
        this.#selectedId = row.dataset.recipeId;
        this.#draft = null;
        this.#dirty = false;
        this.render();
      });
    });

    // Toolbar buttons
    html.querySelector("[data-action='new-recipe']")?.addEventListener("click", () => this.#newRecipe());
    html.querySelector("[data-action='duplicate-recipe']")?.addEventListener("click", () => this.#duplicateRecipe());
    html.querySelector("[data-action='delete-recipe']")?.addEventListener("click", () => this.#deleteRecipe());
    html.querySelector("[data-action='import-json']")?.addEventListener("click", () => this.#importJSON());
    html.querySelector("[data-action='export-json']")?.addEventListener("click", () => this.#exportJSON());
    html.querySelector("[data-action='edit-benches']")?.addEventListener("click", async () => {
      await BenchEditor.open();
      this.render();
    });
    html.querySelector("[data-action='edit-skills']")?.addEventListener("click", async () => {
      await SkillsEditor.open();
      this.render();
    });

    // Form editing
    html.querySelector("[data-action='save-recipe']")?.addEventListener("click", () => this.#saveRecipe());

    html.querySelectorAll(".recipe-field[data-field]").forEach(input => {
      input.addEventListener("change", e => this.#patchDraft(e.target.dataset.field, e.target.value));
    });

    // Drag-drop for schematic slot
    this.#bindDragSlot(html, ".schematic-drop-slot", uuid => {
      this.#patchDraft("schematicItemUuid", uuid);
    });
    html.querySelector("[data-action='clear-schematic']")?.addEventListener("click", () => {
      this.#patchDraft("schematicItemUuid", null);
    });

    // Ingredients
    html.querySelectorAll(".ingredient-row").forEach((row, idx) => {
      row.querySelector(".qty-input")?.addEventListener("change", e => {
        const draft = this.#draft;
        draft.ingredients[idx].quantity = Number(e.target.value);
        this.#dirty = true;
      });
      row.querySelector("[data-action='remove-ingredient']")?.addEventListener("click", () => {
        this.#draft.ingredients.splice(idx, 1);
        this.#dirty = true;
        this.render();
      });
      this.#bindDragSlot(row, ".item-drop-slot", uuid => {
        this.#draft.ingredients[idx].itemUuid = uuid;
        this.#dirty = true;
        this.render();
      });
    });
    html.querySelector("[data-action='add-ingredient']")?.addEventListener("click", () => {
      this.#draft.ingredients.push({ itemUuid: "", quantity: 1 });
      this.#dirty = true;
      this.render();
    });

    // Outputs
    html.querySelectorAll(".output-row").forEach((row, idx) => {
      row.querySelector(".qty-input")?.addEventListener("change", e => {
        this.#draft.outputs[idx].quantity = Number(e.target.value);
        this.#dirty = true;
      });
      row.querySelector("[data-action='remove-output']")?.addEventListener("click", () => {
        this.#draft.outputs.splice(idx, 1);
        this.#dirty = true;
        this.render();
      });
      this.#bindDragSlot(row, ".item-drop-slot", uuid => {
        this.#draft.outputs[idx].itemUuid = uuid;
        this.#dirty = true;
        this.render();
      });
    });
    html.querySelector("[data-action='add-output']")?.addEventListener("click", () => {
      this.#draft.outputs.push({ itemUuid: "", quantity: 1 });
      this.#dirty = true;
      this.render();
    });
  }

  #bindDragSlot(container, selector, onDrop) {
    const slot = container.querySelector?.(selector) ?? (container.matches?.(selector) ? container : null);
    if (!slot) return;
    slot.addEventListener("dragover", e => { e.preventDefault(); slot.classList.add("drag-over"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
    slot.addEventListener("drop", async e => {
      e.preventDefault();
      slot.classList.remove("drag-over");
      let data;
      try { data = JSON.parse(e.dataTransfer.getData("text/plain")); }
      catch { return; }
      if (data.type !== "Item" || !data.uuid) return;
      onDrop(data.uuid);
    });
  }

  #patchDraft(field, value) {
    if (!this.#draft) return;
    if (field === "difficulty") value = Number(value);
    foundry.utils.setProperty(this.#draft, field, value);
    this.#dirty = true;
    this.render();
  }

  async #newRecipe() {
    if (this.#dirty) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        content: game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.UnsavedChanges"),
      });
      if (!ok) return;
    }
    this.#draft = {
      id: foundry.utils.randomID(),
      name: game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.NewRecipeName"),
      description: "",
      bench: "none",
      skill: "",
      difficulty: 10,
      schematicItemUuid: null,
      ingredients: [],
      outputs: [],
    };
    this.#selectedId = this.#draft.id;
    this.#dirty = true;
    this.render();
  }

  async #duplicateRecipe() {
    if (!this.#selectedId) return;
    const dup = duplicateRecipe(this.#selectedId);
    if (!dup) return;
    await saveRecipe(dup);
    this.#selectedId = dup.id;
    this.#draft = null;
    this.#dirty = false;
    this.render();
  }

  async #deleteRecipe() {
    if (!this.#selectedId) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      content: game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.ConfirmDelete"),
    });
    if (!ok) return;
    await deleteRecipe(this.#selectedId);
    this.#selectedId = null;
    this.#draft = null;
    this.#dirty = false;
    this.render();
  }

  async #saveRecipe() {
    if (!this.#draft) return;
    try {
      await saveRecipe(this.#draft);
      this.#dirty = false;
      this.#draft = null;
      this.render();
      ui.notifications.info(game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.Saved"));
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }

  async #exportJSON() {
    const json = exportRecipesJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "fallout-d30-recipes.json"; a.click();
    URL.revokeObjectURL(url);
  }

  async #importJSON() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        await importRecipesJSON(text, { merge: false });
        this.#selectedId = null;
        this.#draft = null;
        this.#dirty = false;
        this.render();
        ui.notifications.info(game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.Imported"));
      } catch (e) {
        ui.notifications.error(e.message);
      }
    });
    input.click();
  }

  async close(options) {
    if (this.#dirty) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        content: game.i18n.localize("FALLOUT_D30_CRAFTING.RecipeManager.UnsavedChanges"),
      });
      if (!ok) return;
    }
    return super.close(options);
  }
}
