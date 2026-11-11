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

/**
 * Hulls. `arqueo` is the historical range from 01_Buques; `displacementKg` and
 * `lightMassKg` are derived from it with CONVENTIONS. `draftRefM` is either
 * transcribed from 04_Calados (draftSource "verified") or interpolated
 * (draftSource "derived") because the workbook explicitly refuses to infer drafts
 * for those types.
 */
export const HULLS = [
  {
    id: "patache",
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
  },
  {
    id: "carabela-latina",
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
  },
  {
    id: "jacht",
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
  },
  {
    id: "zabra",
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
  },
  {
    id: "galeon-pequeno",
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
  },
  {
    id: "fluyt",
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
  },
  {
    id: "nao-armada",
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
  },
  {
    id: "galeon-guerra",
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
  },
  {
    id: "gran-mercante",
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
  },
  {
    id: "galeaza",
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
  },
  {
    id: "gran-galeon",
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
  },
  {
    id: "gran-buque-real",
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
 */
export const PIECES = [
  {
    id: "canon-60",
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
    name: "Verso de hierro (giratoria)",
    family: "verso",
    shotKg: 0.5,
    rangeM: 180,
    reloadS: 30,
    mountKg: 90,
    priceGold: 45,
    provenance: "R6 / S4",
    note: "Pieza giratoria antipersonal; alcance eficaz de referencia 180 m.",
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

export const STARTING_GOLD = 12000;

export const byId = (list, id) => list.find((item) => item.id === id) ?? null;

export const hullById = (id) => byId(HULLS, id);
export const pieceById = (id) => byId(PIECES, id);
export const ammoById = (id) => byId(AMMO, id);
export const crewRoleById = (id) => byId(CREW_ROLES, id);
