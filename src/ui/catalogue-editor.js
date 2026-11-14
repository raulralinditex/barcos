/**
 * The catalogue editor on the settings screen (S80-S82).
 *
 * A view over `src/model/catalogue.js` and `catalogue-storage.js`, like the tuning
 * fields are a view over `settings.js`. The screen decides nothing: it lists what the
 * catalogue holds, shows each field with the margin that field actually has, and hands
 * every change back to the model, which clamps it.
 *
 * The one idea worth keeping in mind while reading this: a shipped record and a new one
 * are not the same thing. The first has an identity it cannot lose and a margin it
 * cannot leave; the second has neither, because nobody measured it.
 */

import { COUNTRIES } from "../data/naval-data.js";
import {
  CONVENTION_MARGIN,
  historicalMargin,
  newHull,
  normaliseCatalogue,
} from "../model/catalogue.js";
import { saveStoredCatalogue } from "../model/catalogue-storage.js";

/** The hull fields the editor shows, in the order a captain thinks about them. */
const HULL_NUMBERS = [
  { key: "arqueo", label: "catalogue.arqueo", scale: "tonnes", min: 1, max: 5000, step: 1, range: true },
  { key: "lengthM", label: "catalogue.length", scale: "metres", min: 1, max: 200, step: 0.5 },
  { key: "beamM", label: "catalogue.beam", scale: "metres", min: 1, max: 60, step: 0.1 },
  { key: "draftRefM", label: "catalogue.draft", scale: "metres", min: 0.5, max: 20, step: 0.1 },
  { key: "maxPiecesPerSide", label: "catalogue.pieces", scale: "count", min: 0, max: 60, step: 1 },
  { key: "crewMin", label: "catalogue.crew", scale: "count", min: 0, max: 400, step: 1 },
  { key: "priceGold", label: "catalogue.price", scale: "gold", min: 0, max: 200000, step: 50 },
];

/** The piece fields the editor shows. */
const PIECE_NUMBERS = [
  { key: "shotKg", label: "catalogue.shotKg", scale: "kg", min: 0.1, max: 60, step: 0.1 },
  { key: "rangeM", label: "catalogue.range", scale: "metres", min: 50, max: 2000, step: 10 },
  { key: "reloadS", label: "catalogue.reload", scale: "seconds", min: 5, max: 600, step: 5 },
  { key: "mountKg", label: "catalogue.mount", scale: "kg", min: 0, max: 12000, step: 50 },
  { key: "priceGold", label: "catalogue.price", scale: "gold", min: 0, max: 20000, step: 10 },
];

/** The derived fields, shown but never editable: they are a consequence (S80). */
const HULL_DERIVED_SHOWN = [
  { key: "arqueoMid", label: "catalogue.arqueoMid", scale: "tonnes" },
  { key: "displacementKg", label: "catalogue.displacement", scale: "kg" },
  { key: "lightMassKg", label: "catalogue.lightMass", scale: "kg" },
  { key: "waterplaneM2", label: "catalogue.waterplane", scale: "area" },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Build the catalogue section. `t` is the translator, `catalogue` the live pair of
 * lists, and `onChange` is called with the new pair whenever something is accepted, so
 * the caller owns storage and the live data.
 */
export function createCatalogueEditor({ t, catalogue, onChange, formatNumber }) {
  const root = document.createElement("section");
  root.className = "catalogue-card";
  const heading = document.createElement("h2");
  heading.textContent = t("catalogue.title");
  const lead = document.createElement("p");
  lead.className = "catalogue-lead";
  lead.textContent = t("catalogue.lead");
  const body = document.createElement("div");
  body.className = "settings-card-body";
  root.append(heading, lead, body);

  let live = normaliseCatalogue(catalogue);

  const commit = (next) => {
    live = normaliseCatalogue(next);
    onChange?.(live);
    draw();
  };

  /** The margin line for one field: the number the player may move within (S82). */
  const marginText = (record, key) => {
    const margin = historicalMargin(record, key);
    if (margin === null) return t("catalogue.marginFree");
    if (Math.abs(margin - CONVENTION_MARGIN) < 1e-9) return t("catalogue.marginConvention");
    return t("catalogue.marginMeasured", { percent: formatNumber(margin * 100) });
  };

  /** One numeric row. A shipped field is bounded by its margin; a new one by its range. */
  const numberRow = (record, spec, onEdit) => {
    const row = document.createElement("div");
    row.className = "settings-row";

    const label = document.createElement("label");
    label.className = "settings-label";
    label.textContent = t(spec.label);
    const id = `catalogue-${record.id}-${spec.key}`;
    label.htmlFor = id;

    const control = document.createElement("div");
    control.className = "settings-control";

    const shown = (value) => (spec.scale === "gold" ? Math.round(value) : value);
    const inputs = [];
    const values = spec.range ? record[spec.key] : [record[spec.key]];
    values.forEach((value, index) => {
      const input = document.createElement("input");
      input.type = "number";
      input.id = index === 0 ? id : `${id}-max`;
      input.dataset.catalogueField = spec.key;
      input.dataset.index = String(index);
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(shown(value));
      // A shipped record cannot leave its margin, and the box says so before the player
      // types: the browser refuses what the model would clamp anyway.
      if (!spec.range && record.provenance !== "nueva") {
        const margin = historicalMargin(record, spec.key);
        if (margin !== null && Number.isFinite(Number(record[spec.key]))) {
          input.min = String(shown(Number(record[spec.key]) * (1 - margin)));
          input.max = String(shown(Number(record[spec.key]) * (1 + margin)));
        }
      }
      input.addEventListener("change", () => {
        const numeric = Number(input.value);
        if (!Number.isFinite(numeric)) return;
        onEdit(spec, index, numeric);
      });
      inputs.push(input);
      control.append(input);
      if (spec.range && index === 0) {
        const dash = document.createElement("span");
        dash.className = "settings-unit";
        dash.textContent = "–";
        control.append(dash);
      }
    });

    const unit = document.createElement("span");
    unit.className = "settings-unit";
    unit.textContent = unitFor(spec.scale, t);
    control.append(unit);

    const note = document.createElement("p");
    note.className = "settings-range";
    note.textContent = marginText(record, spec.key);

    row.append(label, control, note);
    return row;
  };

  const unitFor = (scale, translate) => {
    switch (scale) {
      case "metres":
        return translate("settings.unit.m");
      case "seconds":
        return translate("settings.unit.s");
      case "gold":
        return translate("settings.unit.gold");
      case "kg":
        return "kg";
      case "tonnes":
        return "t";
      case "area":
        return "m²";
      default:
        return "";
    }
  };

  /** Apply one edit to a hull, clamped to the field's range and to its margin. */
  const editHull = (record, spec, index, numeric) => {
    const next = live.hulls.map((hull) => (hull.id === record.id ? { ...hull } : hull));
    const target = next.find((hull) => hull.id === record.id);
    if (!target) return;
    const value = clamp(numeric, spec.min, spec.max);
    if (spec.range) {
      target.arqueo = [...target.arqueo];
      target.arqueo[index] = value;
      if (target.arqueo[1] < target.arqueo[0]) target.arqueo[1] = target.arqueo[0];
    } else {
      target[spec.key] = value;
    }
    commit({ hulls: next, pieces: live.pieces });
  };

  const editPiece = (record, spec, index, numeric) => {
    const next = live.pieces.map((piece) => (piece.id === record.id ? { ...piece } : piece));
    const target = next.find((piece) => piece.id === record.id);
    if (!target) return;
    target[spec.key] = clamp(numeric, spec.min, spec.max);
    commit({ hulls: live.hulls, pieces: next });
  };

  const drawHull = (record) => {
    const card = document.createElement("div");
    card.className = "catalogue-record";
    card.dataset.hullId = record.id;

    const head = document.createElement("div");
    head.className = "catalogue-record-head";
    const name = document.createElement("strong");
    name.textContent = record.name;
    const badge = document.createElement("span");
    badge.className = `catalogue-badge is-${record.provenance === "nueva" ? "new" : "historical"}`;
    badge.textContent = record.provenance === "nueva" ? t("catalogue.badgeNew") : t("catalogue.badgeHistorical", { source: record.provenance });
    head.append(name, badge);
    card.append(head);

    for (const spec of HULL_NUMBERS) {
      card.append(numberRow(record, spec, (s, i, v) => editHull(record, s, i, v)));
    }

    // The derived fields are read-only and say so: they come from the ones above (S80).
    const derived = document.createElement("p");
    derived.className = "catalogue-derived";
    derived.textContent = HULL_DERIVED_SHOWN.map(
      (spec) => `${t(spec.label)}: ${formatNumber(record[spec.key])}`,
    ).join(" · ");
    card.append(derived);
    return card;
  };

  const drawPiece = (record) => {
    const card = document.createElement("div");
    card.className = "catalogue-record";
    card.dataset.pieceId = record.id;

    const head = document.createElement("div");
    head.className = "catalogue-record-head";
    const name = document.createElement("strong");
    name.textContent = record.name;
    const badge = document.createElement("span");
    badge.className = `catalogue-badge is-${record.provenance === "nueva" ? "new" : "historical"}`;
    badge.textContent = record.provenance === "nueva" ? t("catalogue.badgeNew") : t("catalogue.badgeHistorical", { source: record.provenance });
    head.append(name, badge);
    card.append(head);

    for (const spec of PIECE_NUMBERS) {
      card.append(numberRow(record, spec, (s, i, v) => editPiece(record, s, i, v)));
    }
    return card;
  };

  /** The "create" form: a name, a range, and the six transcribed numbers (S80). */
  const createForm = () => {
    const form = document.createElement("div");
    form.className = "catalogue-create";

    const title = document.createElement("h3");
    title.textContent = t("catalogue.createTitle");
    form.append(title);

    const fields = [
      { key: "name", label: "catalogue.name", type: "text" },
      { key: "arqueoLow", label: "catalogue.arqueoLow", type: "number", value: 100 },
      { key: "arqueoHigh", label: "catalogue.arqueoHigh", type: "number", value: 200 },
      { key: "lengthM", label: "catalogue.length", type: "number", value: 20 },
      { key: "beamM", label: "catalogue.beam", type: "number", value: 6 },
      { key: "draftRefM", label: "catalogue.draft", type: "number", value: 2.4 },
      { key: "maxPiecesPerSide", label: "catalogue.pieces", type: "number", value: 8 },
      { key: "crewMin", label: "catalogue.crew", type: "number", value: 12 },
      { key: "priceGold", label: "catalogue.price", type: "number", value: 1000 },
    ];
    const inputs = {};
    for (const spec of fields) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const label = document.createElement("label");
      label.className = "settings-label";
      label.textContent = t(spec.label);
      const input = document.createElement("input");
      input.type = spec.type;
      input.id = `catalogue-new-${spec.key}`;
      label.htmlFor = input.id;
      if (spec.value !== undefined) input.value = String(spec.value);
      inputs[spec.key] = input;
      const control = document.createElement("div");
      control.className = "settings-control";
      control.append(input);
      row.append(label, control);
      form.append(row);
    }

    const countryRow = document.createElement("div");
    countryRow.className = "settings-row";
    const countryLabel = document.createElement("label");
    countryLabel.className = "settings-label";
    countryLabel.textContent = t("catalogue.countries");
    const select = document.createElement("select");
    select.id = "catalogue-new-country";
    for (const country of COUNTRIES) {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = t(`shipyard.country.${country}`);
      select.append(option);
    }
    countryRow.append(countryLabel, select);
    form.append(countryRow);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-launch";
    button.id = "catalogue-create-hull";
    button.textContent = t("catalogue.create");
    button.addEventListener("click", () => {
      const taken = new Set(live.hulls.map((hull) => hull.id));
      const created = newHull(
        {
          name: inputs.name.value,
          arqueo: [Number(inputs.arqueoLow.value), Number(inputs.arqueoHigh.value)],
          lengthM: Number(inputs.lengthM.value),
          beamM: Number(inputs.beamM.value),
          draftRefM: Number(inputs.draftRefM.value),
          maxPiecesPerSide: Number(inputs.maxPiecesPerSide.value),
          crewMin: Number(inputs.crewMin.value),
          priceGold: Number(inputs.priceGold.value),
          countries: [select.value],
        },
        taken,
      );
      if (!created) return;
      commit({ hulls: [...live.hulls, created], pieces: live.pieces });
    });
    form.append(button);
    return form;
  };

  const draw = () => {
    body.textContent = "";

    const hullTitle = document.createElement("h3");
    hullTitle.textContent = t("catalogue.hulls");
    body.append(hullTitle);
    for (const hull of live.hulls) body.append(drawHull(hull));
    body.append(createForm());

    const pieceTitle = document.createElement("h3");
    pieceTitle.textContent = t("catalogue.pieces");
    body.append(pieceTitle);
    for (const piece of live.pieces) body.append(drawPiece(piece));
  };

  draw();
  return { root, redraw: draw };
}
