/**
 * Naval data extracted from `modelo_naval.xlsx` (sheets 01_Buques, 02_Tripulaciones,
 * 03_Armamento, 04_Calados, 05_Calculadora, 06_Notas_y_formulas).
 *
 * Two kinds of numbers live here and they are never mixed silently:
 *
 *  - `provenance: "R1".."R7"` marks a value transcribed from the workbook reports.
 *  - `provenance: "convention"` marks a *game* conversion invented to make the
 *    workbook playable (arqueo -> displacement, powder charge, person mass...).
 *
 * The workbook itself warns that arqueo is not displacement, that a piece count is
 * not firepower, and that no historical 0-100 damage scale exists. Every derived
 * constant below is listed in CONVENTIONS so the UI can show it to the player.
 */

/** Documented game conventions. Each one is a modelling choice, not a datum. */
export const CONVENTIONS = {
  /** Metric tonnes of displacement per historical "tonelada de arqueo". */
  displacementPerArqueoTon: 2.0,
  /** Share of full displacement that the empty hull already weighs. */
  lightMassFraction: 0.55,
  /** Waterplane area as a fraction of length x beam. */
  waterplaneFraction: 0.72,
  /** Mass of one person plus personal kit, kg. */
  personMassKg: 80,
  /** Useful consumables per person per day, kg (food + drink + other). */
  rationKgPerDay: 4.5,
  /** Default spoilage fraction of provisions. */
  provisionLoss: 0.12,
  /** Powder charge as a fraction of shot mass (16th-17th c. heavy ordnance). */
  powderPerShotFraction: 0.45,
  /** Wad, cartridge and tools as a fraction of shot mass, per shot. */
  otherPerShotFraction: 0.1,
  /** Calibrated speed exponent from the workbook speed model (R3). */
  beta: 0.66,
  /** Sea water density, kg/m3. */
  waterDensity: 997,
};

/** Stable ASCII country ids. The game default is England (S26). */
export const COUNTRIES = ["inglaterra", "espana", "portugal", "paises-bajos"];
export const DEFAULT_COUNTRY = "inglaterra";

/**
 * Hulls. `arqueo` is the historical range from 01_Buques; `displacementKg` and
 * `lightMassKg` are derived from it with CONVENTIONS. `draftRefM` is either
 * transcribed from 04_Calados (draftSource "verified") or interpolated
 * (draftSource "derived") because the workbook explicitly refuses to infer drafts
 * for those types.
 *
 * `countries` (S27) is the list of country ids that may buy the hull. The free-text
 * `country` stays untouched for display; the two composite values resolve as
 * Nápoles -> Spain and "Portugal / Felipe II" -> Spain and Portugal.
 *
 * `defaultLoadout` is the rig the buy screen shows when the player selects that hull: the
 * batteries, crew, days and masses that make her a ship the model accepts without a single
 * issue (`buildShip` -> `validateShip`). It belongs to the hull and not to the screen, so
 * picking a barca costera can never inherit the galleon's rig. Only pieces sold in every
 * country of the hull are used, and each entry fires ammunition its piece carries.
 */
export const HULLS = [
  {
    id: "patache",
    countries: ["espana"],
    name: "Patache",
    type: "Patache de enlace",
    country: "España",
    date: "1564-1565",
    arqueo: [40, 100],
    provenance: "R4",
    note: "Rango de ejemplos; no desplazamiento métrico.",
    lengthM: 18,
    beamM: 5.5,
    draftRefM: 2.3,
    draftSource: "derived",
    maxPiecesPerSide: 9,
    crewMin: 10,
    priceGold: 900,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Bancos de convención del juego.
     */
    oarBanks: 16,
    oarMaxKn: 4.0,
    defaultLoadout: {
      batteries: [
        { pieceId: "falconete", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "falconete", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 10, artillero: 3, soldado: 2 },
      days: 30,
      cargoKg: 0,
      ballastKg: 10800,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "carabela-latina",
    countries: ["portugal"],
    name: "Carabela latina",
    type: "Carabela de dos y tres mástiles",
    country: "Portugal",
    date: "Siglo XVI",
    arqueo: [50, 100],
    provenance: "R4",
    note: "Referencia de tipos; revisar unidades originales.",
    lengthM: 20,
    beamM: 6,
    draftRefM: 3.3,
    draftSource: "verified",
    draftNote: "Réplica Vera Cruz; las fuentes discrepan (3.3 m frente a 3.6 m).",
    maxPiecesPerSide: 10,
    crewMin: 8,
    priceGold: 1200,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Bancos de convención del juego.
     */
    oarBanks: 20,
    oarMaxKn: 4.5,
    defaultLoadout: {
      batteries: [
        { pieceId: "falconete", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "falconete", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 8, artillero: 3, soldado: 2 },
      days: 30,
      cargoKg: 0,
      ballastKg: 12400,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "jacht",
    countries: ["paises-bajos"],
    name: "Jacht",
    type: "Pequeña nave exploradora",
    country: "Países Bajos",
    date: "Hacia 1600",
    arqueo: [60, 60],
    provenance: "R4",
    note: "Duyfken; no mezclar con dimensiones de la réplica.",
    lengthM: 24,
    beamM: 6,
    draftRefM: 2.45,
    draftSource: "verified",
    draftNote: "Réplica moderna publicada como cargada.",
    maxPiecesPerSide: 12,
    crewMin: 10,
    priceGold: 700,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Bancos de convención del juego.
     */
    oarBanks: 10,
    oarMaxKn: 4.0,
    defaultLoadout: {
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 10, artillero: 3, soldado: 2 },
      days: 30,
      cargoKg: 0,
      ballastKg: 7200,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "zabra",
    countries: ["espana"],
    name: "Zabra",
    type: "Zabra o galeoncete",
    country: "España",
    date: "1588",
    arqueo: [166, 166],
    provenance: "R4",
    note: "Augusta y Julia; valor atribuido a cada barco.",
    lengthM: 26,
    beamM: 7,
    draftRefM: 2.8,
    draftSource: "derived",
    maxPiecesPerSide: 13,
    crewMin: 20,
    priceGold: 2200,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Bancos de convención del juego.
     */
    oarBanks: 10,
    oarMaxKn: 4.0,
    defaultLoadout: {
      batteries: [
        { pieceId: "falcon", qty: 3, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "falcon", qty: 3, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 20, artillero: 4, soldado: 4 },
      days: 30,
      cargoKg: 0,
      ballastKg: 27700,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "galeon-pequeno",
    countries: ["inglaterra"],
    name: "Galeón pequeño",
    type: "Galeón corsario",
    country: "Inglaterra",
    date: "1577-1580",
    arqueo: [100, 150],
    provenance: "R4",
    note: "Golden Hind; R1 recogía estimaciones desde 100.",
    lengthM: 25,
    beamM: 7.5,
    draftRefM: 2.7,
    draftSource: "verified",
    draftNote: "Referencia secundaria; condición de carga desconocida.",
    maxPiecesPerSide: 12,
    crewMin: 25,
    priceGold: 3200,
    defaultLoadout: {
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
        { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6000,
      ballastKg: 3000,
      equipmentKg: 2500,
      reserveKg: 1500,
    },
  },
  {
    id: "fluyt",
    countries: ["paises-bajos"],
    name: "Fluyt",
    type: "Mercante holandés",
    country: "Países Bajos",
    date: "Siglo XVII",
    arqueo: [250, 350],
    provenance: "R4",
    note: "Se publicó hasta 350 t de carga; no hay mínimo establecido.",
    lengthM: 30,
    beamM: 8.5,
    draftRefM: 3.5,
    draftSource: "derived",
    maxPiecesPerSide: 15,
    crewMin: 12,
    priceGold: 3600,
    defaultLoadout: {
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 12, artillero: 3, soldado: 3 },
      days: 30,
      cargoKg: 6000,
      ballastKg: 54500,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "nao-armada",
    countries: ["espana"],
    name: "Nao mercante armada",
    type: "Transporte armado",
    country: "España",
    date: "1588",
    arqueo: [291, 1200],
    provenance: "R4",
    note: "Rango de muestra, no límites de toda la clase.",
    lengthM: 35,
    beamM: 10,
    draftRefM: 3.6,
    draftSource: "derived",
    maxPiecesPerSide: 17,
    crewMin: 30,
    priceGold: 4200,
    defaultLoadout: {
      batteries: [
        { pieceId: "sacre", qty: 3, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "sacre", qty: 3, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 30, artillero: 4, soldado: 8 },
      days: 30,
      cargoKg: 12000,
      ballastKg: 140500,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "galeon-guerra",
    countries: ["inglaterra"],
    name: "Galeón de guerra",
    type: "Galeón de escuadra",
    country: "Inglaterra",
    date: "Finales del XVI",
    arqueo: [400, 500],
    provenance: "R4",
    note: "Dreadnought, Swiftsure, Revenge.",
    lengthM: 40,
    beamM: 11,
    draftRefM: 4.0,
    draftSource: "derived",
    maxPiecesPerSide: 20,
    crewMin: 60,
    priceGold: 6500,
    defaultLoadout: {
      batteries: [
        { pieceId: "sacre", qty: 4, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "sacre", qty: 4, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 3, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 60, artillero: 6, soldado: 15 },
      days: 30,
      cargoKg: 0,
      ballastKg: 75000,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "gran-mercante",
    countries: ["paises-bajos"],
    name: "Gran mercante",
    type: "Mercante oceánico",
    country: "Países Bajos",
    date: "1628",
    arqueo: [550, 650],
    provenance: "R4",
    note: "Batavia, reconstrucción; no medición del original.",
    lengthM: 45,
    beamM: 12,
    draftRefM: 5.1,
    draftSource: "verified",
    draftNote: "Máximo publicado de la reconstrucción.",
    maxPiecesPerSide: 22,
    crewMin: 40,
    priceGold: 7000,
    defaultLoadout: {
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 40, artillero: 4, soldado: 10 },
      days: 30,
      cargoKg: 10000,
      ballastKg: 108300,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "galeaza",
    countries: ["espana"],
    name: "Galeaza",
    type: "Galera artillada",
    country: "Nápoles / Felipe II",
    date: "1588",
    arqueo: [700, 900],
    provenance: "R5",
    note: "Cuatro galeazas de 1588, 300 remeros cada una.",
    lengthM: 50,
    beamM: 10,
    draftRefM: 2.5,
    draftSource: "derived",
    maxPiecesPerSide: 20,
    crewMin: 100,
    priceGold: 9000,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Remeros documentados: "300 remeros cada una".
     */
    oarBanks: 300,
    oarMaxKn: 7.0,
    defaultLoadout: {
      batteries: [
        { pieceId: "falcon", qty: 4, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "falcon", qty: 4, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 3, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 100, artillero: 6, soldado: 25, remero: 120 },
      days: 30,
      cargoKg: 0,
      ballastKg: 117200,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "gran-galeon",
    countries: ["espana", "portugal"],
    name: "Gran galeón",
    type: "Galeón de mando",
    country: "Portugal / Felipe II",
    date: "1588",
    arqueo: [1000, 1000],
    provenance: "R1",
    note: "San Martín; R4 recoge portugueses hasta 1050.",
    lengthM: 50,
    beamM: 14,
    draftRefM: 4.8,
    draftSource: "derived",
    maxPiecesPerSide: 24,
    crewMin: 120,
    priceGold: 11000,
    defaultLoadout: {
      batteries: [
        { pieceId: "media-culebrina-9", qty: 3, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "media-culebrina-9", qty: 3, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 3, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 120, artillero: 5, soldado: 30 },
      days: 30,
      cargoKg: 0,
      ballastKg: 181200,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "gran-buque-real",
    countries: ["inglaterra"],
    name: "Gran buque real",
    type: "Buque insignia",
    country: "Inglaterra",
    date: "Finales del XVI",
    arqueo: [800, 1100],
    provenance: "R4",
    note: "Triumph; R1 atribuyó 1100 y R4 lo clasifica aparte.",
    lengthM: 55,
    beamM: 15,
    draftRefM: 5.0,
    draftSource: "derived",
    maxPiecesPerSide: 26,
    crewMin: 150,
    priceGold: 14000,
    defaultLoadout: {
      batteries: [
        { pieceId: "media-culebrina-9", qty: 4, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "media-culebrina-9", qty: 4, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 3, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 150, artillero: 6, soldado: 38 },
      days: 30,
      cargoKg: 0,
      ballastKg: 158400,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  /* ------------------------------------------------- S28: English small hulls */
  {
    id: "barca-costera",
    name: "Barca costera",
    type: "Barca pequeña de cabotaje",
    country: "Inglaterra",
    countries: ["inglaterra"],
    date: "1586",
    arqueo: [14, 40],
    provenance: "BWAS-1603 / convención",
    note: "El Swallow, barca pequeña de 14 t con dos falconetes y dos giratorias, apresada en 1586; eslora, calado y precio son convención del juego.",
    lengthM: 12,
    beamM: 4,
    draftRefM: 1.6,
    draftSource: "derived",
    maxPiecesPerSide: 4,
    crewMin: 6,
    priceGold: 320,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Bancos de convención del juego.
     */
    oarBanks: 8,
    oarMaxKn: 3.5,
    defaultLoadout: {
      batteries: [
        { pieceId: "falconete", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "falconete", qty: 1, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 1, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 6, artillero: 2, soldado: 1 },
      days: 20,
      cargoKg: 0,
      ballastKg: 3700,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "pinaza",
    name: "Pinaza",
    type: "Pinaza pequeña",
    country: "Inglaterra",
    countries: ["inglaterra"],
    date: "Hacia 1603",
    arqueo: [50, 50],
    provenance: "BWAS-1603 / convención",
    note: "Quilla de 50 pies (15,24 m), manga de 13-14 pies y puntal de 6 pies en el Sun y el Spy; tripulación de 35 a 40 y 5-9 piezas. Precio y calado, convención del juego.",
    lengthM: 17,
    beamM: 4.2,
    draftRefM: 1.83,
    draftSource: "derived",
    maxPiecesPerSide: 5,
    crewMin: 14,
    priceGold: 620,
    /**
     * Banks of oars (S159): how many rowers she can seat and how fast she moves
     * under them at a full bank and full effort. Bancos de convención del juego.
     */
    oarBanks: 12,
    oarMaxKn: 4.0,
    defaultLoadout: {
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 1, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 14, artillero: 3, soldado: 2 },
      days: 30,
      cargoKg: 0,
      ballastKg: 4100,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
  {
    id: "bark-armado",
    name: "Bark mercante armado",
    type: "Bark mercante artillado",
    country: "Inglaterra",
    countries: ["inglaterra"],
    date: "1585",
    arqueo: [100, 200],
    provenance: "Friel / convención",
    note: "El Bark Hawkyns (1585) era de 150 t y 100 t era el mínimo oficial para que un mercante pudiera combatir; eslora, calado y precio son convención del juego.",
    lengthM: 22,
    beamM: 6.5,
    draftRefM: 2.5,
    draftSource: "derived",
    maxPiecesPerSide: 9,
    crewMin: 12,
    priceGold: 1150,
    defaultLoadout: {
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "metralla" },
      ],
      crew: { marino: 12, artillero: 4, soldado: 3 },
      days: 30,
      cargoKg: 0,
      ballastKg: 25200,
      equipmentKg: 0,
      reserveKg: 0,
    },
  },
].map((hull) => {
  const arqueoMid = (hull.arqueo[0] + hull.arqueo[1]) / 2;
  const displacementKg =
    arqueoMid * CONVENTIONS.displacementPerArqueoTon * 1000;
  const waterplaneM2 = hull.lengthM * hull.beamM * CONVENTIONS.waterplaneFraction;
  return {
    ...hull,
    arqueoMid,
    displacementKg: Math.round(displacementKg),
    lightMassKg: Math.round(displacementKg * CONVENTIONS.lightMassFraction),
    waterplaneM2: Math.round(waterplaneM2 * 10) / 10,
    /** Reference load fraction used as the calibration point for draft and speed. */
    draftRefFraction: 0.75,
  };
});

/**
 * Ordnance. Shot mass and effective range come from 03_Armamento; mount mass uses
 * the transcribed archaeological pieces (culebrina 2750 kg, 1340 kg, 900 kg) and
 * scales by shot mass. Reload times are game conventions anchored on the workbook's
 * "verso de cámaras = 30 s" and the terrestrial 240-360 s figure.
 *
 * `countries` (S29) lists the navies that used the piece. Naval ordnance of the
 * period was largely international, so the map separates little between England,
 * Spain and Portugal; what it does separate is the minion (English and Dutch only)
 * and the doubtful Dutch rows for the sacre and the 60-pounder.
 */
export const PIECES = [
  {
    id: "canon-60",
    countries: ["inglaterra", "espana", "portugal"],
    name: "Cañón de 60 libras",
    family: "cañón",
    shotKg: 27.2,
    rangeM: 400,
    reloadS: 240,
    mountKg: 2800,
    priceGold: 900,
    provenance: "R6",
    ammo: ["bala-hierro", "metralla"],
  },
  {
    id: "canon-40",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Cañón de 40 libras",
    family: "cañón",
    shotKg: 18.1,
    rangeM: 380,
    reloadS: 210,
    mountKg: 2200,
    priceGold: 700,
    provenance: "R6",
    ammo: ["bala-hierro", "metralla"],
  },
  {
    id: "medio-canon-32",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Medio cañón de 32 libras",
    family: "medio cañón",
    shotKg: 14.5,
    rangeM: 360,
    reloadS: 180,
    mountKg: 1900,
    priceGold: 600,
    provenance: "R6",
    ammo: ["bala-hierro", "metralla"],
  },
  {
    id: "culebrina-18",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Culebrina de 18 libras",
    family: "culebrina",
    shotKg: 8.2,
    rangeM: 460,
    reloadS: 150,
    mountKg: 1400,
    priceGold: 650,
    provenance: "R6",
    ammo: ["bala-hierro", "cadena", "metralla"],
  },
  {
    id: "media-culebrina-9",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Media culebrina de 9 libras",
    family: "media culebrina",
    shotKg: 4.1,
    rangeM: 430,
    reloadS: 120,
    mountKg: 1100,
    priceGold: 420,
    provenance: "R6",
    ammo: ["bala-hierro", "cadena", "metralla"],
  },
  {
    id: "sacre",
    countries: ["inglaterra", "espana", "portugal"],
    name: "Sacre",
    family: "sacre",
    shotKg: 2.7,
    rangeM: 380,
    reloadS: 100,
    mountKg: 800,
    priceGold: 260,
    provenance: "R6",
    ammo: ["bala-hierro", "cadena", "metralla"],
  },
  {
    id: "minion",
    countries: ["inglaterra", "paises-bajos"],
    name: "Minion de 4 libras",
    family: "minion",
    shotKg: 1.8,
    rangeM: 350,
    reloadS: 90,
    mountKg: 600,
    priceGold: 180,
    provenance: "R6",
    ammo: ["bala-hierro", "cadena", "metralla"],
  },
  {
    id: "falcon",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Falcón",
    family: "falcón",
    shotKg: 1.25,
    rangeM: 320,
    reloadS: 80,
    mountKg: 450,
    priceGold: 140,
    provenance: "R6",
    ammo: ["bala-hierro", "cadena", "metralla"],
  },
  {
    id: "falconete",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Falconete",
    family: "falconete",
    shotKg: 0.62,
    rangeM: 280,
    reloadS: 70,
    mountKg: 300,
    priceGold: 90,
    provenance: "R6",
    ammo: ["bala-hierro", "cadena", "metralla"],
  },
  {
    id: "pedrero",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Pedrero",
    family: "pedrero",
    shotKg: 5.5,
    rangeM: 260,
    reloadS: 140,
    mountKg: 900,
    priceGold: 220,
    provenance: "R6",
    note: "Pieza recuperada del San Diego; dispara piedra.",
    ammo: ["bala-piedra", "metralla"],
  },
  {
    id: "verso",
    countries: ["inglaterra", "espana", "portugal", "paises-bajos"],
    name: "Verso de hierro (giratoria)",
    family: "verso",
    shotKg: 0.5,
    rangeM: 180,
    reloadS: 30,
    mountKg: 90,
    priceGold: 45,
    provenance: "R6 / S4",
    note: "Pieza giratoria antipersonal; alcance eficaz de referencia 180 m.",
    /** Not bolted to a broadside: it answers for whichever side fires (S20). */
    swivel: true,
    ammo: ["metralla", "bala-hierro"],
  },
];

/**
 * Ammunition. The workbook refuses to publish a historical 0-100 damage scale
 * (03_Armamento: "No hay valores históricos 0-100 medidos"), so the split below is
 * a declared game convention: it distributes a shot's energy budget between hull,
 * rigging and crew, and it is shown to the player as such.
 */
export const AMMO = [
  {
    id: "bala-hierro",
    name: "Bala de hierro",
    provenance: "R1 / R6",
    description: "Munición sólida; el reparto clásico contra el casco.",
    massFactor: 1.0,
    rangeFactor: 1.0,
    damageSplit: { hull: 0.78, rigging: 0.17, crew: 0.05 },
    pricePerShotGold: 0.55,
  },
  {
    id: "bala-piedra",
    name: "Bala de piedra",
    provenance: "R1 / R6",
    description: "Menos densa que el hierro: rompe más astillas, penetra menos.",
    massFactor: 0.75,
    rangeFactor: 0.9,
    damageSplit: { hull: 0.55, rigging: 0.1, crew: 0.35 },
    pricePerShotGold: 0.15,
  },
  {
    id: "cadena",
    name: "Munición de cadena",
    provenance: "R6",
    description: "Dos balas unidas: destrozan aparejo y jarcias, no el casco.",
    massFactor: 0.6,
    rangeFactor: 0.7,
    damageSplit: { hull: 0.08, rigging: 0.86, crew: 0.06 },
    pricePerShotGold: 0.4,
  },
  {
    id: "metralla",
    name: "Metralla (hailshot)",
    provenance: "R6 / S2",
    description: "Dados de hierro; finalidad antipersonal, casi nulo contra el casco.",
    massFactor: 0.35,
    rangeFactor: 0.45,
    damageSplit: { hull: 0.06, rigging: 0.14, crew: 0.8 },
    pricePerShotGold: 0.2,
  },
];

/** Crew categories stay separate, exactly as 02_Tripulaciones keeps them. */
export const CREW_ROLES = [
  {
    id: "marino",
    name: "Marino",
    description: "Personal naval; sin él el barco no maniobra.",
    massKg: CONVENTIONS.personMassKg,
    hireGold: 25,
    wageGoldPerDay: 1.0,
    provenance: "R5",
  },
  {
    id: "artillero",
    name: "Artillero",
    description: "Sirve las piezas; el workbook lo cuenta aparte de los soldados.",
    massKg: CONVENTIONS.personMassKg,
    hireGold: 45,
    wageGoldPerDay: 2.0,
    provenance: "R5",
  },
  {
    id: "soldado",
    name: "Soldado",
    description: "Infantería embarcada; no incluye a los artilleros.",
    massKg: CONVENTIONS.personMassKg,
    hireGold: 35,
    wageGoldPerDay: 1.5,
    provenance: "R5",
  },
  {
    id: "remero",
    name: "Remero",
    description: "Solo en galeazas y galeras; consume masa y provisiones.",
    massKg: CONVENTIONS.personMassKg,
    hireGold: 15,
    wageGoldPerDay: 0.5,
    provenance: "R5",
  },
];

/** Prices that are not attached to a hull, piece or crew role. */
export const PRICES = {
  /** Gold per person-day of provisions (food + drink + other consumables). */
  provisionGoldPerPersonDay: 0.15,
  /** Gold per kg of gunpowder. */
  powderGoldPerKg: 1.2,
  /** Gold per kg of merchant cargo capacity the player chooses to load. */
  cargoGoldPerKg: 0.04,
  /** Gold per kg of extra ballast. */
  ballastGoldPerKg: 0.01,
};

/** Difficulty zones from S6. */
export const ZONES = [
  {
    id: "costera",
    name: "Aguas costeras",
    description: "Rutas conocidas, poca profundidad y velas amigas.",
    danger: 1,
    lootFactor: 1,
  },
  {
    id: "abierto",
    name: "Mar abierto",
    description: "Rutas oceánicas, corsarios y mercantes ricos.",
    danger: 2.2,
    lootFactor: 2.4,
  },
  {
    id: "abismo",
    name: "El abismo",
    description: "Tormenta, arrecifes y escuadras de guerra.",
    danger: 4,
    lootFactor: 5,
  },
];

/**
 * The goods of the trade (S113). `baseGold` is what one unit is worth in the water that
 * produces it; every yard scales it by her zone, so the price the player sees is always
 * the price of that market and never a constant written here.
 *
 * The spread between the coastal and the abyssal market is what makes a voyage pay, and
 * the voyage is the only thing that does: nothing here produces gold on its own.
 */
export const COMMODITIES = [
  {
    id: "maderas",
    nameKey: "commodity.maderas",
    /** Kg one unit (a load) adds to the hold, and so to the draught. */
    kgPerUnit: 640,
    baseGold: 9,
  },
  {
    id: "carbon",
    nameKey: "commodity.carbon",
    kgPerUnit: 520,
    baseGold: 14,
  },
  {
    id: "sal",
    nameKey: "commodity.sal",
    /** Kg one unit (a barrel) adds to the hold, and so to the draught. */
    kgPerUnit: 320,
    baseGold: 18,
  },
  {
    id: "vino",
    nameKey: "commodity.vino",
    kgPerUnit: 280,
    baseGold: 26,
  },
  {
    id: "hierro",
    nameKey: "commodity.hierro",
    kgPerUnit: 400,
    baseGold: 22,
  },
  {
    id: "lana",
    nameKey: "commodity.lana",
    kgPerUnit: 300,
    baseGold: 30,
  },
  {
    id: "cuero",
    nameKey: "commodity.cuero",
    kgPerUnit: 240,
    baseGold: 38,
  },
  {
    id: "brea",
    nameKey: "commodity.brea",
    kgPerUnit: 200,
    baseGold: 46,
  },
  {
    id: "tabaco",
    nameKey: "commodity.tabaco",
    kgPerUnit: 160,
    baseGold: 48,
  },
  {
    id: "cobre",
    nameKey: "commodity.cobre",
    kgPerUnit: 150,
    baseGold: 60,
  },
  {
    id: "cafe",
    nameKey: "commodity.cafe",
    kgPerUnit: 120,
    baseGold: 74,
  },
  {
    id: "azucar",
    nameKey: "commodity.azucar",
    kgPerUnit: 100,
    baseGold: 86,
  },
  {
    id: "especias",
    nameKey: "commodity.especias",
    kgPerUnit: 90,
    baseGold: 95,
  },
  {
    id: "canela",
    nameKey: "commodity.canela",
    kgPerUnit: 45,
    baseGold: 150,
  },
  {
    id: "plata",
    nameKey: "commodity.plata",
    kgPerUnit: 60,
    baseGold: 180,
  },
  {
    id: "seda",
    nameKey: "commodity.seda",
    kgPerUnit: 25,
    baseGold: 320,
  },
  {
    id: "diamantes",
    nameKey: "commodity.diamantes",
    kgPerUnit: 4,
    baseGold: 1400,
  },
];

export const commodityById = (id) => byId(COMMODITIES, id);

/**
 * The mooring radius of the home port (S112). A hull inside it is at the yard, which is
 * what opens the shipyard screen (S51); the other yards declare their own.
 */
export const SHIPYARD_MOORING_M = 110;

/**
 * The shipyards of the sea (S112). One per zone, and the list is meant to grow: a new
 * yard is a row here plus her mark on the chart, and no trade rule changes.
 *
 * `zoneId` is deliberately absent: a yard's zone is derived from `x`/`y` by
 * `zoneAtRadius` (world.js), so a new yard cannot be built in the coastal band and sit
 * in the abyssal water.
 *
 * `market` is the yard's own market: the goods she trades and her own price multipliers
 * over each good's `baseGold` (`buy` is what she charges, `sell` what she pays). A good
 * that is not listed is neither bought nor sold there. The numbers are chosen so that
 * every good is cheap where it is made and dear where it is missed.
 */
export const SHIPYARDS = [
  {
    id: "puerto-casa",
    nameKey: "shipyard.puerto-casa",
    x: 0,
    y: 0,
    mooringM: SHIPYARD_MOORING_M,
    /** The port a voyage starts from, so the builder screen opens here (S51). */
    home: true,
    market: {
      sal: { buy: 0.55, sell: 0.9 },
      vino: { buy: 0.6, sell: 1.0 },
      tabaco: { buy: 0.95, sell: 1.5 },
      plata: { buy: 1.1, sell: 1.7 },
      maderas: { buy: 0.5, sell: 0.8 },
      carbon: { buy: 0.55, sell: 0.85 },
      hierro: { buy: 0.6, sell: 0.95 },
      lana: { buy: 0.6, sell: 0.95 },
      cuero: { buy: 0.65, sell: 1.0 },
      brea: { buy: 0.6, sell: 0.95 },
      cobre: { buy: 0.65, sell: 1.0 },
      azucar: { buy: 0.7, sell: 1.05 },
    },
  },
  {
    id: "ensenada-abierta",
    nameKey: "shipyard.ensenada-abierta",
    x: 2400,
    y: 0,
    mooringM: 140,
    market: {
      vino: { buy: 0.95, sell: 1.5 },
      tabaco: { buy: 0.6, sell: 1.0 },
      especias: { buy: 1.1, sell: 1.8 },
      plata: { buy: 0.9, sell: 1.5 },
      lana: { buy: 1.0, sell: 1.6 },
      cuero: { buy: 1.05, sell: 1.7 },
      cobre: { buy: 1.1, sell: 1.75 },
      azucar: { buy: 1.15, sell: 1.8 },
      cafe: { buy: 0.75, sell: 1.2 },
      canela: { buy: 1.2, sell: 1.9 },
      seda: { buy: 1.3, sell: 2.1 },
      diamantes: { buy: 1.35, sell: 2.2 },
    },
  },
  {
    id: "cala-del-abismo",
    nameKey: "shipyard.cala-del-abismo",
    x: 4600,
    y: 0,
    mooringM: 160,
    market: {
      sal: { buy: 1.4, sell: 2.2 },
      tabaco: { buy: 1.6, sell: 2.6 },
      especias: { buy: 0.7, sell: 1.1 },
      plata: { buy: 0.75, sell: 1.3 },
      maderas: { buy: 1.6, sell: 2.5 },
      carbon: { buy: 1.55, sell: 2.4 },
      hierro: { buy: 1.5, sell: 2.3 },
      brea: { buy: 1.5, sell: 2.3 },
      cafe: { buy: 0.8, sell: 1.3 },
      canela: { buy: 0.85, sell: 1.35 },
      seda: { buy: 0.9, sell: 1.45 },
      diamantes: { buy: 1.0, sell: 1.6 },
    },
  },
];

export const shipyardById = (id) => byId(SHIPYARDS, id);

export const STARTING_GOLD = 12000;

/**
 * The starting purse the shipyard actually reads (S77). `STARTING_GOLD` stays the shipped
 * constant, because the balance tests and the "flagship is out of reach" rule are written
 * against it; this is the live copy the settings screen is allowed to change.
 */
export const START = { gold: STARTING_GOLD };

export const byId = (list, id) => list.find((item) => item.id === id) ?? null;

export const hullById = (id) => byId(HULLS, id);
export const pieceById = (id) => byId(PIECES, id);
export const ammoById = (id) => byId(AMMO, id);
export const crewRoleById = (id) => byId(CREW_ROLES, id);

/**
 * The shipyard whose water holds `position`, or null in open water (S112). The edge of
 * the mooring counts as inside, so a hull cannot sit exactly on the line and be refused.
 * A broken position resolves to no yard at all: a corrupted save never gets a market.
 */
export function shipyardAt(position) {
  const x = position?.x;
  const y = position?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const yard of SHIPYARDS) {
    const radius = Number.isFinite(yard.mooringM) && yard.mooringM > 0 ? yard.mooringM : 0;
    if (Math.hypot(x - yard.x, y - yard.y) <= radius) return yard;
  }
  return null;
}
