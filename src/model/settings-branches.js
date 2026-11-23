/**
 * The branches of the settings screen (S143).
 *
 * The player asked for it (verbatim): "en el panel de configuracion, empieza a haber muchos
 * paneles, crea un menu lateral con ramas si es necesario y agrupa toda esa informacion".
 * His decision (verbatim): "Una rama a la vez, plegables, recuerda la elegida" for the
 * behaviour. The grouping agreed with him is the five branches declared here: sea and world,
 * the fight, the yard, the trade and the catalogue. They cover the twenty-two blocks of
 * `SETTINGS_FIELDS` exactly once, which is the invariant this file exists to make checkable.
 *
 * The catalogue (S80-S83) is not a block of fields, so it is a branch of its own with no
 * group ids: the screen shows it under that branch and nowhere else.
 */

/**
 * The branches, in the order the menu shows them.
 *
 * `groups` are ids of `SETTINGS_FIELDS` blocks. `catalogue` marks the branch that owns the
 * hull and piece editor, which lives beside the fields but is not one of them.
 */
export const SETTINGS_BRANCHES = [
  {
    id: "sea",
    label: "settings.branch.sea",
    groups: ["world", "wind", "time", "levels", "voyage", "fog"],
  },
  {
    id: "fight",
    label: "settings.branch.fight",
    groups: ["combat", "oars", "zones", "turning", "escort", "danger", "trail", "bars"],
  },
  {
    id: "yard",
    label: "settings.branch.yard",
    groups: ["fort", "fortUpgrade", "repair", "refit"],
  },
  {
    id: "trade",
    label: "settings.branch.trade",
    groups: ["commerce", "prices", "yardMarkets", "sales", "loot"],
  },
  {
    id: "catalogue",
    label: "settings.branch.catalogue",
    groups: [],
    catalogue: true,
  },
];

/** The branch that owns a block, or `null` when no branch does (which the test forbids). */
export function branchOfGroup(group) {
  for (const branch of SETTINGS_BRANCHES) {
    if (branch.groups.includes(group)) return branch;
  }
  return null;
}

/** The branch by id, or `null` for anything that is not a branch. */
const branchById = (id) => SETTINGS_BRANCHES.find((branch) => branch.id === id) ?? null;

/**
 * A saved selection resolved to something the screen can show (S143-C).
 *
 * A selection is a branch id, or `branch/group` when the player opened one block. Anything
 * unreadable — missing, unknown, a block that no longer exists, a block of another branch —
 * falls back to the whole first branch, so the screen is never empty.
 */
export function resolveSelection(saved) {
  const text = typeof saved === "string" ? saved.trim() : "";
  const [branchId, groupId] = text.split("/");
  const branch = branchById(branchId) ?? SETTINGS_BRANCHES[0];
  return branch.groups.includes(groupId)
    ? { branch: branch.id, group: groupId }
    : { branch: branch.id, group: null };
}

/** The selection as the one string the screen stores (S143-C). */
export function selectionKey(selection) {
  const branch = branchById(selection?.branch) ?? SETTINGS_BRANCHES[0];
  return branch.groups.includes(selection?.group)
    ? `${branch.id}/${selection.group}`
    : branch.id;
}
