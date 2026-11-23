import { writeFile } from 'node:fs/promises';
import { createWorld, RESOURCE_KEYS } from '../src/core/model.js';
import { SimulationEngine } from '../src/core/systems.js';

const YEARS = 100;
const SCENARIOS = ['balanced', 'energy', 'migration', 'ecological', 'scarcity', 'extreme'];
const SCENARIO_NAMES = { balanced: '平衡演进', energy: '能源危机', migration: '迁徙潮', ecological: '生态治理', scarcity: '资源短缺', extreme: '极端环境' };
const SHOCKS = ['scarcity', 'migration', 'disaster', 'breakthrough'];
const POLICIES = ['green', 'innovation', 'resilience'];
const SEEDS = [1, 7, 42, 9999, 1234567];
const round = (value, digits = 2) => Number(value.toFixed(digits));

function validate(world) {
  const issues = [];
  for (const city of world.cities) {
    for (const resource of RESOURCE_KEYS) {
      if (!Number.isFinite(city.resources[resource]) || city.resources[resource] < -1e-9 || city.resources[resource] > city.resourceCaps[resource] + 1e-8) issues.push(`${city.name} 的 ${resource} 储备越界`);
      if (!Number.isFinite(world.prices[resource]) || world.prices[resource] <= 0) issues.push(`${resource} 市场价格异常`);
    }
    if (!Number.isFinite(city.population) || city.population < 120 || city.population > 6000) issues.push(`${city.name} 人口异常`);
    if (!Number.isFinite(city.gdp) || city.gdp < 12 || city.gdp > city.population * 190 + 0.001) issues.push(`${city.name} 经济指标越界`);
    if (city.happiness < 7 || city.happiness > 95 || city.employment < 0.39 || city.employment > 0.985) issues.push(`${city.name} 人口福利指标越界`);
  }
  return issues;
}

function summarize(world, initial, years, additional = {}) {
  const cities = world.cities;
  const ending = world.history.at(-1);
  const sectorSpecialization = cities.reduce((total, city) => total + city.industry[city.primarySector], 0) / cities.length;
  return {
    ...additional,
    seed: world.seed,
    years,
    start: { year: initial.year, gdp: round(initial.gdp), population: round(initial.population), environment: round(initial.environment, 3), happiness: round(initial.happiness, 1) },
    end: {
      year: ending.year,
      gdp: round(ending.gdp),
      gdpPercent: round((ending.gdp / initial.gdp - 1) * 100, 1),
      population: round(ending.population),
      populationPercent: round((ending.population / initial.population - 1) * 100, 1),
      environment: round(ending.environment, 3),
      environmentChange: round((ending.environment - initial.environment) * 100, 1),
      happiness: round(ending.happiness, 1),
      employment: round(ending.employment * 100, 1),
      prices: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, round(world.prices[key], 2)])),
      resourceShortages: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, round(cities.reduce((total, city) => total + (city.unmetResources[key] ?? 0), 0) / cities.length * 100, 1)])),
      tradeValue: round(world.annualTradeValue),
      tradeVolume: round(world.annualTrade),
      migrationRedistribution: round(cities.reduce((total, city) => total + Math.abs(city.population - city.originalPopulation), 0)),
      growingCities: cities.filter((city) => city.gdp > (city.history[0]?.gdp ?? city.gdp)).length,
      sectorSpecialization: round(sectorSpecialization, 3),
      leastHappyCity: cities.reduce((weakest, city) => city.happiness < weakest.happiness ? city : weakest, cities[0]).name,
      leastHappiness: round(Math.min(...cities.map((city) => city.happiness)), 1),
      mineralReserves: round(cities.reduce((total, city) => total + (city.mineralReserves ?? 0), 0)),
      cityOutcomes: cities.map((city) => ({ name: city.name, sector: city.primarySector, population: round(city.population), gdp: round(city.gdp), gdpPercent: round((city.gdp / (city.history[0]?.gdp ?? city.gdp) - 1) * 100, 1), happiness: round(city.happiness, 1), environment: round(city.environment, 3), migration: round(city.migration, 1), foodShortage: round((city.unmetResources.food ?? 0) * 100, 1), waterShortage: round((city.unmetResources.water ?? 0) * 100, 1) })),
    },
    eventCount: world.events.length,
    recentEvents: world.events.slice(0, 12),
    issues: validate(world),
  };
}

function runScenario(scenario, years = YEARS, action = null, seed = 2026, metadata = {}) {
  const world = createWorld({ seed, scenario });
  const engine = new SimulationEngine(world);
  engine.capture();
  const initial = world.history[0];
  action?.(engine);
  engine.step(years);
  return summarize(world, initial, years, { scenario, scenarioName: SCENARIO_NAMES[scenario], ...metadata });
}

const runStarted = performance.now();
const results = SCENARIOS.map((scenario) => runScenario(scenario));
for (const result of results) {
  const label = SCENARIO_NAMES[result.scenario];
  console.log(`${label.padEnd(6)} | 经济 ${result.end.gdpPercent > 0 ? '+' : ''}${result.end.gdpPercent}% | 人口 ${result.end.populationPercent > 0 ? '+' : ''}${result.end.populationPercent}% | 幸福 ${result.end.happiness} | 生态 ${(result.end.environment * 100).toFixed(1)} | 就业 ${result.end.employment}% | 事件 ${result.eventCount} | ${result.issues.length ? `警告 ${result.issues.join(', ')}` : '数值边界检查通过'}`);
}

const milestones = [];
{
  const world = createWorld({ seed: 2026 });
  const engine = new SimulationEngine(world);
  engine.capture();
  const initial = world.history[0];
  for (const years of [10, 50, 100, 200]) {
    engine.step(years - (world.year - initial.year));
    milestones.push({ ...summarize(world, initial, years).end, years });
  }
  console.log(`平衡世界年度节点 | ${milestones.map((item) => `${item.year}: GDP ${item.gdpPercent > 0 ? '+' : ''}${item.gdpPercent}%, 人口 ${item.populationPercent > 0 ? '+' : ''}${item.populationPercent}%`).join(' | ')}`);
}

const shockResults = SHOCKS.map((event) => runScenario('balanced', 50, (engine) => engine.trigger(event), 2026, { injectedEvent: event }));
for (const result of shockResults) {
  const name = ({ scarcity: '资源危机', migration: '迁徙潮', disaster: '风暴灾害', breakthrough: '技术突破' })[result.injectedEvent];
  console.log(`事件干预 50 年 ${name.padEnd(6)} | GDP ${result.end.gdpPercent > 0 ? '+' : ''}${result.end.gdpPercent}% | 人口 ${result.end.populationPercent > 0 ? '+' : ''}${result.end.populationPercent}% | 幸福 ${result.end.happiness} | ${result.issues.length ? result.issues.join(', ') : '数值边界检查通过'}`);
}

const policyResults = POLICIES.map((policy) => runScenario('balanced', YEARS, (engine) => engine.setPolicy(policy), 2026, { policy }));
for (const result of policyResults) {
  const name = ({ green: '绿色转型', innovation: '创新投资', resilience: '韧性建设' })[result.policy];
  console.log(`世界级政策 100 年 ${name.padEnd(6)} | GDP ${result.end.gdpPercent > 0 ? '+' : ''}${result.end.gdpPercent}% | 生态 ${(result.end.environment * 100).toFixed(1)} | 幸福 ${result.end.happiness} | ${result.issues.length ? result.issues.join(', ') : '数值边界检查通过'}`);
}

const seedResults = SEEDS.map((seed) => runScenario('balanced', YEARS, null, seed));
for (const result of seedResults) {
  console.log(`独立种子 100 年 #${result.seed.toString().padEnd(8)} | GDP ${result.end.gdpPercent > 0 ? '+' : ''}${result.end.gdpPercent}% | 人口 ${result.end.populationPercent > 0 ? '+' : ''}${result.end.populationPercent}% | 幸福 ${result.end.happiness} | ${result.issues.length ? result.issues.join(', ') : '数值边界检查通过'}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  deterministicSeed: 2026,
  scenarioYears: YEARS,
  interpretation: '合成模拟指标，用于比较同模型内的相对变化；不代表现实预测。',
  results,
  milestones,
  shockResults,
  policyResults,
  seedSweep: seedResults.map((result) => ({ seed: result.seed, gdpPercent: result.end.gdpPercent, populationPercent: result.end.populationPercent, happiness: result.end.happiness, environment: result.end.environment, issues: result.issues })),
  runtimeMs: round(performance.now() - runStarted, 1),
  allCheckedScenariosWithinBounds: [...results, ...shockResults, ...policyResults, ...seedResults].every((result) => result.issues.length === 0),
};
await writeFile(new URL('../docs/simulation-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`完整研究记录已写入 docs/simulation-results.json · ${results.length} 情景 · ${milestones.length} 长期节点 · ${shockResults.length} 事件 · ${policyResults.length} 政策 · ${seedResults.length} 独立种子 · ${report.runtimeMs} ms`);
if (!report.allCheckedScenariosWithinBounds) process.exitCode = 1;
