/** A small seeded PRNG. No simulation result depends on wall-clock time. */
export class Random {
  constructor(seed = 2026) { this.state = Number(seed) >>> 0 || 1; }
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
  between(min, max) { return min + this.next() * (max - min); }
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
}

export const RESOURCE_KEYS = ['food', 'water', 'energy', 'materials'];
export const RESOURCE_META = {
  food: { name: '粮食', unit: '万吨', price: 94, icon: '◉', color: '#d5bc7c' },
  water: { name: '淡水', unit: '亿吨', price: 72, icon: '≈', color: '#68b5d4' },
  energy: { name: '电力', unit: '太瓦时', price: 118, icon: 'ϟ', color: '#e7a666' },
  materials: { name: '建材', unit: '万吨', price: 138, icon: '⬡', color: '#a995ce' },
};

export const SECTORS = {
  agriculture: { name: '农业', color: '#8eae7c', jobs: 0.9 },
  manufacturing: { name: '制造业', color: '#73a9c6', jobs: 1.1 },
  technology: { name: '科技', color: '#ad9adb', jobs: 0.72 },
  mining: { name: '采掘', color: '#d49c69', jobs: 0.62 },
  services: { name: '服务业', color: '#d59b9b', jobs: 1.3 },
};

const CITY_BLUEPRINTS = [
  ['岚港', '海湾贸易口岸', 'manufacturing', 0.11, 0.18, 16],
  ['青岑', '山地水源城', 'technology', 0.56, 0.12, 31],
  ['白沄', '高原风光谷地', 'agriculture', 0.89, 0.22, 46],
  ['澄原', '河谷粮仓', 'agriculture', 0.26, 0.43, 13],
  ['新铸', '内陆装备基地', 'manufacturing', 0.64, 0.39, 35],
  ['金屿', '离岸能源港', 'mining', 0.95, 0.45, 55],
  ['望川', '流域枢纽城市', 'technology', 0.12, 0.65, 18],
  ['砾城', '矿带工业腹地', 'mining', 0.43, 0.64, 37],
  ['林屿', '湿地与水网', 'services', 0.75, 0.67, 49],
  ['曙城', '南境创新中心', 'technology', 0.22, 0.88, 22],
  ['归原', '丘陵生物城', 'agriculture', 0.58, 0.89, 42],
  ['远舟', '边境轨道新城', 'manufacturing', 0.91, 0.87, 59],
];

const SCENARIOS = {
  balanced: { label: '平衡演进', energyFactor: 1, migrationPressure: 0, greenPush: false, extreme: false },
  energy: { label: '能源危机', energyFactor: 0.42, migrationPressure: 0.018, greenPush: false, extreme: false },
  migration: { label: '迁徙潮', energyFactor: 1, migrationPressure: 0.034, greenPush: false, extreme: false },
  ecological: { label: '生态治理', energyFactor: 0.88, migrationPressure: 0, greenPush: true, extreme: false },
  scarcity: { label: '资源短缺', energyFactor: 0.82, migrationPressure: 0.006, greenPush: false, extreme: false },
  extreme: { label: '极端环境', energyFactor: 0.84, migrationPressure: 0.009, greenPush: false, extreme: true },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function normaliseShares(entries) {
  const sum = Object.values(entries).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value / sum]));
}

function makeIndustry(primary, random) {
  const shares = Object.fromEntries(Object.keys(SECTORS).map((key) => [key, random.between(0.08, 0.2)]));
  shares[primary] = random.between(0.34, 0.53);
  return normaliseShares(shares);
}

function createLinks(cities, random) {
  const possible = [];
  for (let a = 0; a < cities.length; a++) for (let b = a + 1; b < cities.length; b++) {
    const distance = Math.hypot((cities[a].x - cities[b].x) / 854, (cities[a].y - cities[b].y) / 400);
    possible.push({ a: cities[a].id, b: cities[b].id, distance, cost: 0.08 + distance * 0.64, quality: clamp(1.04 - distance * 0.78, 0.44, 0.97), capacity: (60 + random.next() * 56) * (1.14 - distance * 0.3), congestion: 0 });
  }
  const connected = new Set([0]);
  const links = [];
  const add = (link) => { if (!link) return; links.push(link); connected.add(link.a); connected.add(link.b); };
  while (connected.size < cities.length) {
    const next = possible.filter((link) => connected.has(link.a) !== connected.has(link.b)).sort((a, b) => a.distance - b.distance)[0];
    add(next);
  }
  for (const city of cities) {
    const nearest = possible.filter((link) => link.a === city.id || link.b === city.id).sort((a, b) => a.distance - b.distance).slice(0, 2);
    for (const link of nearest) if (!links.includes(link)) add(link);
  }
  return links;
}

export function makeCity(blueprint, id, random, scenario = SCENARIOS.balanced) {
  const [name, identity, primarySector, x, y, resourceOffset] = blueprint;
  const population = Math.round(random.between(490, 1320));
  const climate = clamp(0.28 + random.next() * 0.6 + (primarySector === 'agriculture' ? 0.1 : 0) - (scenario.extreme ? 0.22 : 0), 0.12, 0.98);
  const wealth = random.between(0.43, 0.79);
  const industryLevel = random.between(0.68, 1.33);
  const energyCapacity = population * random.between(0.36, 0.64) * scenario.energyFactor;
  const geology = clamp(0.64 + resourceOffset / 72, 0.65, 1.5);
  const renewablePotential = clamp(0.83 + resourceOffset / 210 + (primarySector === 'technology' ? 0.08 : 0), 0.84, 1.22);
  const shoreRisk = x < 0.15 || x > 0.84 || y > 0.84 ? 0.13 : 0;
  const resourceModifier = scenario.label === '资源短缺' ? 0.43 : scenario.extreme ? 0.7 : 1;
  const resources = {
    food: population * random.between(0.19, 0.44) * climate * resourceModifier * clamp(0.88 + geology * 0.12, 0.82, 1.1),
    water: population * random.between(0.16, 0.36) * climate * resourceModifier * clamp(0.86 + renewablePotential * 0.14, 0.8, 1.06),
    energy: energyCapacity * random.between(0.44, 1.02),
    materials: population * random.between(0.12, 0.3) * (primarySector === 'mining' ? 1.8 : resourceModifier) * geology,
  };
  const fertility = random.between(0.66, 0.93);
  const industry = makeIndustry(primarySector, random);
  const employment = random.between(0.83, 0.95);
  const housing = population * random.between(0.93, 1.18);
  const housingQuality = random.between(0.58, 0.92);
  const environment = clamp(random.between(0.57, 0.91) - (primarySector === 'mining' ? 0.1 : 0) - (scenario.extreme ? 0.2 : 0), 0.1, 0.96);
  const pollution = clamp((primarySector === 'mining' ? 0.34 : 0.18) + (scenario.extreme ? 0.26 : 0), 0.01, 0.96);
  const happiness = random.between(56, 78);
  const affordability = clamp(housing / population, 0.45, 1.08);
  const livingQuality = clamp((0.08 + employment * 0.22 + environment * 0.25 + affordability * 0.16 + housingQuality * 0.12 + wealth * 0.1 - pollution * 0.16) * 100, 8, 96);
  return {
    id, name, identity, x: 72 + x * 854, y: 52 + y * 400,
    population, originalPopulation: population,
    ageStructure: { young: fertility, working: random.between(3.2, 4.1), old: random.between(0.55, 1.05) },
    gdp: population * random.between(21, 42),
    previousGdp: 0,
    wealth,
    savings: population * random.between(11, 30),
    wages: random.between(0.72, 1.35),
    employment,
    jobs: 0,
    housing,
    housingQuality,
    infrastructure: random.between(0.46, 0.78),
    transportAccess: 0.5,
    industry,
    industryLevel,
    primarySector,
    resources,
    resourceCaps: {
      food: population * 0.52 + 5,
      water: population * 0.42 + 5,
      energy: population * 0.56 + 5,
      materials: population * 0.39 + 5,
    },
    mineralReserves: population * (0.43 + geology * 0.48 + (primarySector === 'mining' ? 0.6 : 0)),
    production: { food: 0, water: 0, energy: 0, materials: 0 },
    imports: { food: 0, water: 0, energy: 0, materials: 0 },
    exports: { food: 0, water: 0, energy: 0, materials: 0 },
    resourceUse: { food: 0, water: 0, energy: 0, materials: 0 },
    energyCapacity,
    renewablePotential,
    renewableShare: clamp(random.between(0.08, 0.37) * renewablePotential + (scenario.greenPush ? 0.12 : 0), 0.05, 0.82),
    powerCoverage: 1,
    environment,
    pollution,
    happiness,
    attractiveness: clamp(happiness * 0.48 + environment * 18 + employment * 15 + affordability * 9 + 0.5 * 6 - pollution * 17, 0, 100),
    policy: scenario.greenPush ? 'green' : 'balanced',
    policyYears: 0,
    action: '评估城市发展',
    migration: 0,
    netTradeValue: 0,
    budget: population * random.between(2.8, 5),
    fiscalHealth: random.between(0.45, 0.77),
    investment: 1,
    growth: 0,
    livingQuality,
    agePressure: clamp(0.18 + random.next() * 0.26, 0.16, 0.54),
    climate,
    geology,
    hazardExposure: clamp(random.between(scenario.extreme ? 0.44 : 0.1, scenario.extreme ? 0.96 : 0.62) + shoreRisk, 0.1, 0.98),
    serviceQuality: random.between(0.46, 0.76),
    scenarioMigration: id === 9 ? scenario.migrationPressure : 0,
    migrationImpulse: 0,
    migrationYears: 0,
    history: [],
  };
}

export function createWorld({ seed = 2026, scenario = 'balanced' } = {}) {
  const selectedScenario = SCENARIOS[scenario] ? scenario : 'balanced';
  const random = new Random(seed);
  const cities = CITY_BLUEPRINTS.map((blueprint, id) => makeCity(blueprint, id, random, SCENARIOS[selectedScenario]));
  const links = createLinks(cities, random);
  for (const city of cities) {
    const adjacent = links.filter((link) => link.a === city.id || link.b === city.id);
    city.transportAccess = clamp(adjacent.reduce((sum, link) => sum + link.quality, 0) / Math.max(2, adjacent.length), 0.2, 1);
    city.population = Math.round(city.population * (0.93 + city.transportAccess * 0.14));
    city.originalPopulation = city.population;
    city.gdp = Math.round(city.gdp * (0.9 + city.infrastructure * 0.2));
    city.jobs = Math.round(city.population * 0.53 * city.industryLevel * city.employment);
  }
  return {
    seed: Number(seed) >>> 0 || 1,
    scenario: selectedScenario,
    year: 2040,
    tick: 0,
    cities,
    links,
    prices: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, RESOURCE_META[key].price])),
    priceHistory: [],
    history: [],
    events: [{ id: 0, year: 2040, type: 'founding', title: '联盟档案建立', description: `${cities.length} 座差异化城市开始共享贸易网络。`, cityId: null, severity: 'info' }],
    nextEventId: 1,
    annualTrade: 0,
    running: false,
    speed: 1,
    annualTradeVolume: 0,
    annualTradeValue: 0,
  };
}

export function scenarioLabel(scenario) { return SCENARIOS[scenario]?.label ?? SCENARIOS.balanced.label; }
export function clampValue(value, min, max) { return clamp(value, min, max); }
