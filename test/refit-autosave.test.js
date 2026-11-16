/**
 * The refit save button is optional: "reforma automatica" is a setting, on by default.
 *
 * User request (verbatim): "el boton guardar reforma, lo vamos a hacer opcional, creamos
 * un check en la configuracion reforma automatica, si esta on todo cambio se guarda
 * automaticamente, si esta en off, mostramos el boton y se hace manual clickeando el
 * boton, por defecto es on"
 */
import test from "node:test";
import assert from "node:assert/strict";

import { REFIT, applyRefit, configFromShip } from "../src/model/refit.js";
import { SETTINGS_BLOCKS, SETTINGS_DEFAULTS, SETTINGS_FIELDS, applySettings, fieldId, normaliseSettings, resetSettings } from "../src/model/settings.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { withHold } from "../src/model/commerce.js";

const field = SETTINGS_FIELDS.find((entry) => entry.group === "refit" && entry.key === "autoSave");

const hull = () =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 0,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name: "Test" },
  );

test("the automatic refit is a switch setting, on by default", () => {
  assert.ok(field, "settings must declare refit.autoSave");
  assert.equal(field.control, "switch");
  assert.equal(REFIT.autoSave, 1);
  assert.equal(SETTINGS_DEFAULTS[fieldId(field)], 1);
  assert.equal(SETTINGS_BLOCKS.refit, REFIT);
});

test("the setting writes the live flag and a broken value falls back to on", () => {
  try {
    applySettings({ ...normaliseSettings({}), [fieldId(field)]: 0 });
    assert.equal(REFIT.autoSave, 0);
    assert.equal(normaliseSettings({ [fieldId(field)]: "nonsense" })[fieldId(field)], 1);
  } finally {
    resetSettings();
  }
  assert.equal(REFIT.autoSave, 1);
});

test("a refit keeps the merchandise aboard (auto-save must not eat the hold)", () => {
  const loaded = withHold(hull(), { manifest: [{ commodityId: "sal", units: 5 }] });
  const result = applyRefit(loaded, { ...configFromShip(loaded), days: 50 }, 20000);
  assert.equal(result.applied, true);
  assert.deepEqual(result.ship.manifest, loaded.manifest);
  assert.equal(result.ship.cargoKg, loaded.cargoKg);
});

test("a refit that cuts the cargo below the merchandise drops what no longer fits", () => {
  const loaded = withHold(hull(), { manifest: [{ commodityId: "sal", units: 5 }] });
  const result = applyRefit(loaded, { ...configFromShip(loaded), cargoKg: 0 }, 20000);
  assert.equal(result.applied, true);
  assert.equal(result.ship.manifest, undefined);
  assert.equal(result.ship.cargoKg, 0);
});
