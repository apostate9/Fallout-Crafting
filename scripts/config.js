export const MODULE_ID = "fallout-d30-crafting";

// CSB quantity and worn-armor field paths — retarget here if the system changes
export const QTY_PATH = "system.props.quantity";
export const WORN_PATH = "system.props.armor_worn";

export const DEFAULT_BENCH_TYPES = [
  { id: "workbench",  label: "Workbench" },
  { id: "cooking",    label: "Cooking Station" },
  { id: "chemistry",  label: "Chemistry Station" },
  { id: "armor",      label: "Armor Workbench" },
  { id: "weapons",    label: "Weapons Workbench" },
  { id: "power_armor",label: "Power Armor Station" },
  { id: "none",       label: "None (handcraft)" },
];

export const DEFAULT_SKILLS = [
  { key: "skill_barter",         label: "Barter" },
  { key: "skill_energy_weapons", label: "Energy Weapons" },
  { key: "skill_explosives",     label: "Explosives" },
  { key: "skill_guns",           label: "Guns" },
  { key: "skill_lockpick",       label: "Lockpick" },
  { key: "skill_medicine",       label: "Medicine" },
  { key: "skill_melee_weapons",  label: "Melee Weapons" },
  { key: "skill_repair",         label: "Repair" },
  { key: "skill_science",        label: "Science" },
  { key: "skill_sneak",          label: "Sneak" },
  { key: "skill_speech",         label: "Speech" },
  { key: "skill_survival",       label: "Survival" },
  { key: "skill_throwing",       label: "Throwing" },
  { key: "skill_unarmed",        label: "Unarmed" },
];

export const FAILURE_MODES = {
  TIME:    "time",
  CONSUME: "consume",
};
