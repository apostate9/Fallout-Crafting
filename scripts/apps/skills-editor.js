import { MODULE_ID } from "../config.js";
import { getSkillsSetting } from "../settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SkillsEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fallout-d30-skills-editor",
    tag: "div",
    window: { title: "FALLOUT_D30_CRAFTING.SkillsEditor.Title", resizable: true },
    position: { width: 420, height: "auto" },
    classes: ["fallout-d30-crafting", "skills-editor"],
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/skills-editor.hbs` },
  };

  #rows = [];
  #dirty = false;
  #resolve = null;

  static async open() {
    return new Promise(resolve => {
      const app = new SkillsEditor();
      app.#resolve = resolve;
      app.render({ force: true });
    });
  }

  async _prepareContext() {
    if (!this.#rows.length && !this.#dirty) {
      this.#rows = foundry.utils.deepClone(getSkillsSetting());
    }
    return { rows: this.#rows };
  }

  _onRender(context, options) {
    const html = this.element;
    html.querySelector("[data-action='add-row']")?.addEventListener("click", () => {
      this.#rows.push({ key: "", label: "" });
      this.#dirty = true;
      this.render();
    });
    html.querySelectorAll("[data-action='delete-row']").forEach(btn => {
      btn.addEventListener("click", () => {
        this.#rows.splice(Number(btn.dataset.index), 1);
        this.#dirty = true;
        this.render();
      });
    });
    html.querySelectorAll(".skill-key-input").forEach(input => {
      input.addEventListener("change", e => {
        this.#rows[Number(e.target.dataset.index)].key = e.target.value.trim();
        this.#dirty = true;
      });
    });
    html.querySelectorAll(".skill-label-input").forEach(input => {
      input.addEventListener("change", e => {
        this.#rows[Number(e.target.dataset.index)].label = e.target.value;
        this.#dirty = true;
      });
    });
    html.querySelector("[data-action='save']")?.addEventListener("click", async () => {
      await game.settings.set(MODULE_ID, "skills", this.#rows);
      this.#resolve?.(this.#rows);
      this.#resolve = null;
      this.close();
    });
    html.querySelector("[data-action='cancel']")?.addEventListener("click", () => {
      this.#resolve?.(null);
      this.#resolve = null;
      this.close();
    });
  }

  async close(options) {
    this.#resolve?.(null);
    this.#resolve = null;
    return super.close(options);
  }
}
