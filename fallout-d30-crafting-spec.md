# FALLOUT d30 Crafting Module — Specification

A Foundry VTT V13 module providing recipe-based crafting for the FALLOUT d30 system, designed to replace Furukai's Simple Crafting (`furu-sc`) for this campaign.

## Goals

Replace `furu-sc` with a system that:

1. Stores recipes as world-level data, edited through a dedicated UI — not as fake "schematic" items polluting actor inventories.
2. Treats schematics (when required by a recipe) as real items the player owns, *referenced* by the recipe but *not consumed* during crafting.
3. Handles ingredient quantities correctly across multiple stacks of the same item — no string-concatenation bugs.
4. Supports multiple output items per recipe, for scrapping recipes that yield several materials.
5. Resolves skill checks through GM-mediated rolls in chat, not automated success/failure logic the players can game.

## Target environment

- **Foundry VTT V13** (use the V13 application API, `foundry.applications.api.ApplicationV2` and `HandlebarsApplicationMixin`; do not use the deprecated V1 `Application`/`FormApplication`).
- **System:** FALLOUT d30, built on **Custom System Builder (CSB)**. Item data lives under `system.props.<key>`. The campaign's quantity key is `system.props.quantity` (number). Worn-armor flag is `system.props.armor_worn` (boolean).
- **Browser:** Firefox is the project standard; do not use APIs that are Chromium-only.

The module must be installable as a standard Foundry module (manifest + scripts + templates + styles) without external build tooling. Plain ES modules, plain Handlebars, plain CSS. No bundler.

## Module identity

- Module ID: `fallout-d30-crafting`
- Title: `FALLOUT d30 Crafting`
- Author / authors field: leave as `Rob`
- Compatibility: minimum `13`, verified `13`
- Manifest must declare `esmodules`, `styles`, `languages`, and the relevant `flags`.

## Data model

### Recipe

Recipes are stored as entries in a single world-level setting (`fallout-d30-crafting.recipes`), as an array of recipe objects. They are *not* Foundry Items, Journals, or Documents — keeping them in a setting makes them trivial to back up, edit in bulk, and import/export as JSON, and avoids creating a parallel item type.

Each recipe object has the following shape:

```js
{
  id: "uuid-v4-string",                // generated on creation, immutable
  name: "Patch Leather Armor",         // display name
  description: "Stitches scrap...",    // optional flavor / GM notes, plain text
  bench: "workbench",                  // string ID of a bench type — see Bench types below
  skill: "repair",                     // FALLOUT d30 skill key — see Skills below
  difficulty: 15,                      // target number for the skill check
  schematicItemUuid: null,             // optional: Foundry UUID of an Item the actor must own; not consumed
  ingredients: [                       // consumed on success
    { itemUuid: "Compendium...", quantity: 2 },
    { itemUuid: "Compendium...", quantity: 1 }
  ],
  outputs: [                           // produced on success; at least one
    { itemUuid: "Compendium...", quantity: 1 }
  ]
}
```

Ingredient and output `itemUuid` values are Foundry UUIDs pointing to **world items** or **compendium items** — the canonical "template" for that material. When an output is granted to an actor, the module resolves the UUID, copies the item's data, and creates an embedded item on the actor (or increments quantity on an existing matching stack — see Stacking semantics).

### Bench types

Bench types are a configurable list, stored in a second world setting (`fallout-d30-crafting.benchTypes`). Default contents:

- `workbench` — Workbench
- `cooking` — Cooking Station
- `chemistry` — Chemistry Station
- `armor` — Armor Workbench
- `weapons` — Weapons Workbench
- `power_armor` — Power Armor Station
- `none` — None (handcraft)

Bench type is a free-form string ID with a display label; the GM can add/remove from the list via a Bench Types editor accessible from the Recipe Manager. A recipe declares which bench it requires; `none` means it can be done anywhere.

### Skills

The skill key is one of the FALLOUT d30 skill identifiers. The module ships a default list matching standard Fallout skills (Barter, Energy Weapons, Explosives, Guns, Lockpick, Medicine, Melee Weapons, Repair, Science, Sneak, Speech, Survival, Throwing, Unarmed) but reads the actual list from a third world setting (`fallout-d30-crafting.skills`) so it can be tuned to whatever skill list the FALLOUT d30 system ends up using. Each entry: `{ key: "repair", label: "Repair" }`.

The module does not need to know how to roll FALLOUT d30 skill checks. It posts a chat message containing recipe info and a button labeled "Roll [Skill] vs DC [N]" — clicking the button is left to the GM, who rolls in their normal way and clicks Success or Failure. (See Crafting flow.)

## UIs

Three application windows, all V13 ApplicationV2 + HandlebarsApplicationMixin.

### 1. Recipe Manager (GM only)

Opened from a scene-controls button (in the Tokens layer's bottom button strip, GM-only) and from a settings menu entry.

Two-pane layout:

- **Left pane:** sortable list of all recipes, with a search/filter input. Each row shows recipe name, bench type label, skill, and difficulty. Clicking a row loads it into the right pane. Buttons above the list: New, Duplicate, Delete, Import JSON, Export JSON.
- **Right pane:** form editor for the selected recipe. Fields: name, description (textarea), bench type (dropdown from bench types list), skill (dropdown from skills list), difficulty (number input), schematic item (drag-drop slot accepting an Item; clear button to unset), ingredients (repeating rows: drag-drop slot for item + quantity number input + remove button + Add Ingredient button), outputs (repeating rows, same structure as ingredients + Add Output button).

The drag-drop slots accept Foundry drag data of type `Item`. They store the dragged item's UUID and display the item's name and image. Dropping a different item replaces the contents.

Save button writes back to the world setting. Closing without saving prompts to confirm if there are unsaved changes.

A "Bench Types" button opens a small sub-dialog for editing the bench type list (add row, edit ID/label, delete row).

A "Skills" button opens an analogous sub-dialog for the skill list.

### 2. Crafting Window (player-facing)

Opened by a macro the module ships, or by an exposed API method `game.modules.get("fallout-d30-crafting").api.openCrafting(actor, benchType)`.

Inputs: an Actor (the crafter) and a bench type (string ID, or `null`/`"none"` for handcraft).

Layout:

- Header: actor name + portrait, current bench type label, and a bench-type selector dropdown so the player can swap benches if they have access to multiple. (The GM can configure whether players can change bench type freely or whether it's locked to whatever was passed in — see Settings.)
- Filter input: text search across recipe names and descriptions.
- Recipe list: every recipe whose `bench` matches the current bench type (plus all `none` recipes regardless). Each row shows:
  - Recipe name
  - Skill + DC
  - Schematic icon (greyed out if not held by the actor; full color if held)
  - Ingredients list with **held / required** quantities, e.g. `Steel Scrap 2/3` (red if insufficient, green if sufficient)
  - Outputs list with quantities and item names
  - A **Craft** button, disabled if the actor lacks the schematic or any ingredient
- Selecting a row expands it for full description text.

Clicking Craft initiates the crafting flow.

### 3. Resolution chat card

Posted to chat when crafting is initiated. Not a standalone window — it's a chat message rendered from a Handlebars template, with whisper restricted to the crafting player and the GM.

Contents:

- Recipe name, crafter name
- Skill + DC
- Schematic (if any) with held confirmation
- Ingredients to be consumed
- Outputs to be granted
- A "Roll [Skill] vs DC [N]" button (visible to the player; clicking it doesn't auto-roll, it just whispers a reminder to the GM with the relevant numbers — the GM rolls in their own way)
- **Success** and **Failure** buttons (visible to GM only; clicking them executes the success or failure resolution)

The chat card stores all the info needed to resolve it in message flags (`flags.fallout-d30-crafting.craftingState`), so it survives reload.

## Crafting flow

1. Player opens Crafting Window for their actor at a bench.
2. Player picks a recipe and clicks Craft.
3. Module validates: actor has the schematic (if required), actor has sufficient ingredient quantities (summed across all matching stacks — see Stacking semantics).
4. If validation fails, show a `ui.notifications.warn` and abort.
5. Module posts the resolution chat card, whispered to player + GM. Ingredients are **not** consumed yet.
6. Player clicks the roll prompt button (this is just a UX nudge; it doesn't gate anything).
7. GM rolls the skill check in their normal way.
8. GM clicks Success or Failure on the chat card.
   - On **Success**: ingredients are consumed (see Consumption logic), outputs are granted (see Granting logic), and the chat card is updated to a "Crafted!" state with the rolled outputs listed. Buttons are disabled / replaced with a status string.
   - On **Failure**: a configurable failure mode applies. Default mode is **time cost only** — no ingredients consumed, but the recipe is locked for that actor for 24 in-game hours (tracked via actor flag, queried via `game.time.worldTime`). Other mode: **consume ingredients on failure** (set per-recipe override, falling back to global setting).
   - Either way, the chat card is updated with the outcome and the action buttons are removed/disabled.

The 24-hour cooldown is a per-actor, per-recipe timestamp stored at `actor.flags.fallout-d30-crafting.cooldowns[recipeId] = worldTime + 86400`. The Crafting Window shows a "Cooling down — 4h 12m remaining" message in place of the Craft button when active. Cooldown duration is a global setting (default 86400 seconds = 24 in-game hours).

## Stacking semantics (the actual hard part)

The whole reason this module exists. Read carefully.

### Quantity field

CSB stores it at `system.props.quantity`. The module exposes this as a constant in a config module (`scripts/config.js`) so it can be retargeted if needed:

```js
export const QTY_PATH = "system.props.quantity";
export const WORN_PATH = "system.props.armor_worn";
```

All quantity reads must `Number()`-coerce the value. All quantity writes must write a JS number, never a string. This is non-negotiable; this is the bug the module exists to avoid.

### Matching items in inventory

When checking "does the actor have N of item X" or "consume N of item X":

- Match by **source identity**, not name. Each item carries `flags.core.sourceId` (or `_stats.compendiumSource` in V12+/V13) when created from a compendium/world item via Foundry's normal drag-drop. The module uses this UUID match as the primary criterion.
- Fall back to exact trimmed name + item type if source ID is missing (e.g., manually created items). Document this limitation in the README.
- **Never** match by name alone across types.
- Worn armor (`system.props.armor_worn === true`) is excluded from being consumed as an ingredient even if it would otherwise match — players shouldn't have the armor on their back scrapped out from under them.

### Summing across stacks

When the player has the same item in multiple stacks (the bug case): sum `Number(item.system.props.quantity)` across **all** matching items to determine "held quantity". The validation check uses the sum.

### Consumption logic

To consume `N` of item `X` from an actor:

1. Find all matching items (by source ID, then name+type fallback), excluding worn armor.
2. Sort them by quantity ascending (consume smallest stacks first — this naturally cleans up dust stacks).
3. Walk the list, decrementing `N` from each stack until `N` reaches zero.
4. For each stack: if its quantity drops to zero, delete the item; otherwise update the quantity.
5. Batch all updates and deletions into single `updateEmbeddedDocuments` / `deleteEmbeddedDocuments` calls per actor.

If after walking the entire list `N > 0`, something has gone wrong (validation should have caught this) — abort the transaction (no partial consumption) and post an error to the GM.

### Granting logic

To grant `N` of item with UUID `U` to an actor:

1. Resolve the UUID via `await fromUuid(U)` to get the canonical item document.
2. Search the actor's items for an existing matching stack (by source ID first, then name+type fallback), **excluding worn armor**.
3. If a match exists: increment its `system.props.quantity` by `N`.
4. If no match exists: create an embedded item on the actor by cloning the source item's data, setting `system.props.quantity` to `N`, and ensuring `flags.core.sourceId` is set to `U` so future grants stack with this one.

### Atomicity

Consumption and granting for a single craft must succeed or fail together. The module performs validation, then consumes, then grants. If granting fails for any reason (e.g., a UUID no longer resolves), the consumption must be rolled back — implement this by computing both the consumption updates and the granting updates *before* applying any of them, and only apply if both compute successfully. Granting can fail if a recipe references a deleted compendium item; this is a real failure mode worth handling.

## Settings

World-scoped:

- `recipes` (array, hidden — edited through Recipe Manager UI)
- `benchTypes` (array, hidden — edited through Bench Types editor)
- `skills` (array, hidden — edited through Skills editor)
- `failureMode` (choice: `"time"` | `"consume"`; default `"time"`)
- `cooldownSeconds` (number, default `86400`)
- `playersCanChangeBench` (boolean, default `true`)

Client-scoped:

- `lastBenchType` (string, hidden — remembers the last bench used per user)

## Macros

The module ships with two compendium macros (in a module-provided macro pack):

1. **Open Crafting** — opens the Crafting Window for the user's selected token's actor, at the bench type stored in `lastBenchType` (or prompts if unset). Falls back to the user's assigned character if no token is selected.
2. **Open Crafting at Bench…** — prompts for a bench type via dialog, then opens the window.

GMs get a third macro **Open Recipe Manager**.

## API

Expose via `game.modules.get("fallout-d30-crafting").api`:

- `openCrafting(actor, benchType)` — opens the Crafting Window.
- `openRecipeManager()` — opens the Recipe Manager (GM only; warns and returns if called by a player).
- `craft(actor, recipeId)` — programmatically initiate a craft (skips the window, posts the chat card directly). Returns the chat message.
- `getRecipes()` — returns a deep clone of the current recipe array.
- `setRecipes(recipes)` — replaces the recipe array (GM only). Validates shape before writing.
- `exportRecipes()` — returns a JSON string.
- `importRecipes(json, { merge = false })` — parses and writes; if `merge`, recipes with matching IDs are overwritten and others are appended; otherwise the import replaces the list entirely.

## Hooks

- On `ready`: register settings, register Handlebars helpers, expose the API, register the scene-controls button.
- On `getSceneControlButtons`: add the GM Recipe Manager button to the Tokens layer.
- On `renderChatMessage`: rebind the action buttons on resolution chat cards (so they survive reload).

## Files

```
fallout-d30-crafting/
├── module.json
├── README.md
├── scripts/
│   ├── module.js                # entry point: hooks, init, ready, API exposure
│   ├── config.js                # constants (QTY_PATH, WORN_PATH, defaults)
│   ├── settings.js              # registerSettings()
│   ├── recipes.js               # CRUD on the recipes setting; validation; import/export
│   ├── inventory.js             # find/sum/consume/grant logic, source-ID matching
│   ├── crafting.js              # craft flow: validate → post chat → resolve success/failure
│   ├── chat.js                  # render and rebind resolution chat cards
│   └── apps/
│       ├── recipe-manager.js    # GM Recipe Manager ApplicationV2
│       ├── crafting-window.js   # player Crafting Window ApplicationV2
│       ├── bench-editor.js      # bench types sub-dialog
│       └── skills-editor.js     # skills sub-dialog
├── templates/
│   ├── recipe-manager.hbs
│   ├── recipe-form.hbs          # partial: the right-pane form
│   ├── crafting-window.hbs
│   ├── crafting-card.hbs        # the chat card template
│   ├── bench-editor.hbs
│   └── skills-editor.hbs
├── styles/
│   └── fallout-d30-crafting.css
└── lang/
    └── en.json
```

## Styling

A single stylesheet, namespaced under `.fallout-d30-crafting` to avoid bleeding into other modules. Visual tone: terminal-green-on-dark, monospace headers, sans-serif body, evoking Pip-Boy / Vault-Tec aesthetics without being a pastiche. Use CSS custom properties at the top so colors are tweakable. No external font dependencies.

The CSS must not override any global Foundry selectors. All rules are scoped under the namespace class.

## Localization

All user-facing strings go through `game.i18n.localize` / `game.i18n.format`, with keys in `lang/en.json` under a `FALLOUT_D30_CRAFTING.` namespace. No need to ship other languages.

## README

A `README.md` covering:

- What this module replaces and why (the furu-sc quantity bug).
- Installation (manifest URL placeholder).
- Quick start: how to add a recipe, how a player crafts.
- The CSB integration assumptions (`system.props.quantity`, `system.props.armor_worn`) and how to retarget them in `scripts/config.js`.
- The source-ID matching behavior and the manual-item fallback caveat.
- The skill-check flow (GM rolls; clicks Success/Failure).
- API reference.

## Non-goals

The module deliberately does not:

- Track materials by category or tag (no "any metal scrap" wildcards).
- Support partial successes, critical successes, or graduated outcomes — Success/Failure only. The GM can adjudicate criticals manually by editing the chat card or just granting/consuming through normal Foundry actions.
- Auto-roll skill checks. The GM rolls; the module just consumes and grants.
- Provide a graphical bench placement system. Bench type is a string the GM picks; no scene-tile awareness.
- Migrate data from `furu-sc`. Recipes get rebuilt fresh.

## Implementation order suggestion

If implementing in stages, a sensible order:

1. Manifest, settings, config, empty entry point — module loads cleanly.
2. Recipe data layer: CRUD, validation, import/export. Tested via console.
3. Inventory module: source-ID matching, summing, consumption, granting. Tested via console with hand-rolled actors.
4. Recipe Manager UI.
5. Crafting Window UI (read-only validation display first).
6. Resolution chat card and the success/failure flow.
7. Cooldowns, settings polish.
8. Macros, scene-controls button, README.

This order keeps the messy data work front-loaded and the pretty UI work as a reward at the end.
