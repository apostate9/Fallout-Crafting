import { MODULE_ID } from "../config.js";
import { getBenchTypesSetting } from "../settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BenchEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fallout-d30-bench-editor",
    tag: "div",
    window: { title: "FALLOUT_D30_CRAFTING.BenchEditor.Title", resizable: true },
    position: { width: 420, height: "auto" },
    classes: ["fallout-d30-crafting", "bench-editor"],
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/bench-editor.hbs` },
  };

  #rows = [];
  #dirty = false;
  #resolve = null;

  /** Open editor; resolves with the new bench type array when saved, or null if cancelled. */
  static async open() {
    return new Promise(resolve => {
      const app = new BenchEditor();
      app.#resolve = resolve;
      app.render({ force: true });
    });
  }

  async _prepareContext() {
    if (!this.#rows.length && !this.#dirty) {
      this.#rows = foundry.utils.deepClone(getBenchTypesSetting());
    }
    return { rows: this.#rows };
  }

  _onRender(context, options) {
    const html = this.element;
    html.querySelector("[data-action='add-row']")?.addEventListener("click", () => {
      this.#rows.push({ id: "", label: "" });
      this.#dirty = true;
      this.render();
    });
    html.querySelectorAll("[data-action='delete-row']").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        this.#rows.splice(idx, 1);
        this.#dirty = true;
        this.render();
      });
    });
    html.querySelectorAll(".bench-id-input").forEach(input => {
      input.addEventListener("change", e => {
        this.#rows[Number(e.target.dataset.index)].id = e.target.value.trim();
        this.#dirty = true;
      });
    });
    html.querySelectorAll(".bench-label-input").forEach(input => {
      input.addEventListener("change", e => {
        this.#rows[Number(e.target.dataset.index)].label = e.target.value;
        this.#dirty = true;
      });
    });
    html.querySelector("[data-action='save']")?.addEventListener("click", async () => {
      await game.settings.set(MODULE_ID, "benchTypes", this.#rows);
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
