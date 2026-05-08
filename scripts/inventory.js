import { QTY_PATH, WORN_PATH } from "./config.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getQty(item) {
  return Number(foundry.utils.getProperty(item, QTY_PATH) ?? 0);
}

function isWorn(item) {
  return foundry.utils.getProperty(item, WORN_PATH) === true;
}

/** Returns the source UUID used for stack-matching. */
function sourceId(item) {
  return item.flags?.core?.sourceId
    ?? item._stats?.compendiumSource
    ?? null;
}

/** True if two items refer to the same canonical source, or share name+type when source is absent. */
function itemsMatch(a, b) {
  const aid = sourceId(a), bid = sourceId(b);
  if (aid && bid) return aid === bid;
  // fallback: name + type
  return a.name?.trim() === b.name?.trim() && a.type === b.type;
}

/** Find all actor items matching the template item (not worn). */
function findStacks(actor, templateItem) {
  return actor.items.filter(i => !isWorn(i) && itemsMatch(i, templateItem));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the total held quantity of items matching `templateItem` on `actor`.
 * @param {Actor} actor
 * @param {Item}  templateItem  — the resolved canonical item
 */
export function heldQuantity(actor, templateItem) {
  return findStacks(actor, templateItem).reduce((n, i) => n + getQty(i), 0);
}

/**
 * Returns true if `actor` owns an item whose sourceId matches `uuid`
 * (or name+type fallback), irrespective of worn status — schematic check.
 */
export async function actorHasItem(actor, uuid) {
  let template;
  try { template = await fromUuid(uuid); }
  catch { return false; }
  if (!template) return false;
  return actor.items.some(i => itemsMatch(i, template));
}

/**
 * Compute the update/delete operations needed to consume `quantity` of
 * `templateItem` from `actor`. Does NOT apply them.
 *
 * Returns { updates: [{_id, [QTY_PATH]: n}], deletes: [id] }
 * or throws if insufficient quantity.
 */
export function buildConsumption(actor, templateItem, quantity) {
  const stacks = findStacks(actor, templateItem)
    .sort((a, b) => getQty(a) - getQty(b));   // smallest first

  let remaining = quantity;
  const updates = [];
  const deletes = [];

  for (const stack of stacks) {
    if (remaining <= 0) break;
    const qty = getQty(stack);
    if (qty <= remaining) {
      deletes.push(stack.id);
      remaining -= qty;
    } else {
      updates.push({ _id: stack.id, [QTY_PATH]: qty - remaining });
      remaining = 0;
    }
  }

  if (remaining > 0) {
    throw new Error(`fallout-d30-crafting | Insufficient quantity of "${templateItem.name}" (need ${quantity}, short by ${remaining})`);
  }

  return { updates, deletes };
}

/**
 * Compute the update/create operation needed to grant `quantity` of the item
 * at `uuid` to `actor`. Does NOT apply it.
 *
 * Returns { stackId: string|null, qty: number, itemData: object|null }
 * stackId — existing item to update, or null if a new item must be created
 * itemData — full item data to create (only set when stackId is null)
 */
export async function buildGrant(actor, uuid, quantity) {
  let template;
  try { template = await fromUuid(uuid); }
  catch (e) { throw new Error(`fallout-d30-crafting | Cannot resolve UUID "${uuid}": ${e.message}`); }
  if (!template) throw new Error(`fallout-d30-crafting | UUID "${uuid}" resolved to nothing`);

  // Prefer non-worn matching stack
  const existing = actor.items.find(i => !isWorn(i) && itemsMatch(i, template));
  if (existing) {
    return { stackId: existing.id, qty: getQty(existing) + quantity, itemData: null, template };
  }

  const itemData = template.toObject();
  foundry.utils.setProperty(itemData, QTY_PATH, quantity);
  // ensure sourceId for future stacking
  foundry.utils.setProperty(itemData, "flags.core.sourceId", uuid);
  return { stackId: null, qty: quantity, itemData, template };
}

/**
 * Apply pre-computed consumption ops to `actor`.
 * @param {Actor}  actor
 * @param {{ updates: object[], deletes: string[] }} ops
 */
export async function applyConsumption(actor, ops) {
  if (ops.updates.length) await actor.updateEmbeddedDocuments("Item", ops.updates);
  if (ops.deletes.length) await actor.deleteEmbeddedDocuments("Item", ops.deletes);
}

/**
 * Apply a pre-computed grant op to `actor`.
 * @param {Actor} actor
 * @param {{ stackId: string|null, qty: number, itemData: object|null }} op
 */
export async function applyGrant(actor, op) {
  if (op.stackId) {
    await actor.updateEmbeddedDocuments("Item", [{ _id: op.stackId, [QTY_PATH]: op.qty }]);
  } else {
    await actor.createEmbeddedDocuments("Item", [op.itemData]);
  }
}
