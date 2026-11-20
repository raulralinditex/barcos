/**
 * Whether the ship+rig panels belong on screen (S165).
 *
 * The player reported it (verbatim): "en la pantalla tu flota del astillero, no mostrar el
 * panel de aparejo si no hay ninguna nave seleccionada".
 *
 * The panels followed the ROOM, not the selection. `showScreen` moved them into the fleet
 * room and left them visible, so the room greeted the player with the captain's rig, guns
 * and crew before she had chosen anything: numbers belonging to a hull she had not asked
 * about, and a builder for a refit nobody had started.
 *
 * The rooms that never take them are the reading rooms (S145/S147): settings, the yard and
 * the market. `comprar` always keeps them, because there a hull is built from scratch and
 * there is no fleet selection to make.
 */

/** The rooms that never show the builder panels, whatever is selected. */
const READING_ROOMS = new Set(["configuracion", "astillero", "mercado"]);

/** The rooms that always show them, because they build a hull rather than refit one. */
const BUILDING_ROOMS = new Set(["comprar"]);

/**
 * Whether the ship+rig panels are on screen.
 *
 * `hasSelection` is whether the player has picked a hull of her fleet. Only the fleet room
 * cares: everywhere else the panels answer to the room itself.
 */
export function showsBuilderPanels(input) {
  const { screen, hasSelection } = input && typeof input === "object" ? input : {};
  if (READING_ROOMS.has(screen)) return false;
  if (BUILDING_ROOMS.has(screen)) return true;
  if (screen === "flota") return Boolean(hasSelection);
  // An unknown room is no room: show nothing rather than inventing a layout.
  return false;
}
