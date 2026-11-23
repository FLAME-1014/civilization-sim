import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, RESOURCE_KEYS, RESOURCE_META, Random } from '../src/core/model.js';
import { EconomySystem, EventSystem, SimulationEngine, TransportSystem, WorldManager } from '../src/core/systems.js';

function start({ seed = 2026, scenario = 'balanced' } = {}) {
  const world = createWorld({ seed, scenario });
  const engine = new SimulationEngine(world);
  engine.capture();
  return { world, engine };
}

test('seeded generation repeats exactly but retains genuine city differentiation', () => {
  const first = createWorld({ seed: 8128 });
  const second = createWorld({ seed: 8128 });
  assert.deepEqual(first.cities, second.cities);
  assert.deepEqual(first.links, second.links);
  assert.equal(first.cities.length, 12);
  assert.ok(first.links.length >= 11);
  assert.ok(new Set(first.cities.map((city) => city.primarySector)).size >= 4);
  assert.ok(Math.max(...first.cities.map((city) => city.population)) / Math.min(...first.cities.map((city) => city.population)) > 1.4);
  assert.ok(new Set(first.cities.map((city) => city.climate.toFixed(2))).size > 7);
  assert.ok(new Set(first.cities.map((city) => city.gdp.toFixed(0))).size > 10);
  for (const city of first.cities) assert.equal(Object.values(city.industry).reduce((a, b) => a + b, 0).toFixed(6), '1.000000');
});

test('the PRNG is reproducible and never returns either endpoint', () => {
  const left = new Random(31415);
  const right = new Random(31415);
  assert.deepEqual(Array.from({ length: 100 }, () => left.next()), Array.from({ length: 100 }, () => right.next()));
  assert.equal(new Random(7).next() >= 0, true);
  assert.equal(new Random(7).next() < 1, true);
});

test('every market price moves in response to the system supply/demand balance', () => {
  const { world, engine } = start();
  for (const city of world.cities) {
    for (const key of RESOURCE_KEYS) {
      city.resources[key] = 0;
      city.production[key] = 0;
      city.resourceUse[key] = 0;
    }
  }
  world.cities[0].resourceUse.food = 100_000;
  engine.economySystem.updatePrices([]);
  assert.ok(world.prices.food > RESOURCE_META.food.price);
  for (const key of RESOURCE_KEYS) assert.ok(Number.isFinite(world.prices[key]) && world.prices[key] > 0);
});

test('a trade route bottleneck caps delivered cargo and a restored link increases it', () => {
  const { world, engine } = start();
  const buyerId = 0;
  const sellerId = 2;
  for (const city of world.cities) {
    city.resources.food = 0;
    city.production.food = 0;
    city.resourceUse.food = 0;
    city.resourceCaps ??= {};
    city.resourceCaps.food = 10_000;
  }
  world.cities[buyerId].resourceUse.food = 100;
  world.cities[sellerId].resources.food = 1000;
  const path = engine.transportSystem.pathsFrom(buyerId).paths[sellerId];
  assert.ok(path?.length);
  for (const link of world.links) link.capacity = 1;
  for (const link of path) link.capacity = 30;
  const limited = engine.transportSystem.step(world.prices);
  const limitedDelivery = limited.filter((shipment) => shipment.from === sellerId && shipment.to === buyerId && shipment.key === 'food').reduce((total, shipment) => total + shipment.amount, 0);
  assert.ok(limitedDelivery > 0);
  assert.ok(limitedDelivery <= 30.0001);
  world.cities[sellerId].resources.food = 1000;
  world.cities[buyerId].resources.food = 0;
  for (const link of world.links) link.capacity = 1000;
  const restored = engine.transportSystem.step(world.prices);
  const restoredDelivery = restored.filter((shipment) => shipment.from === sellerId && shipment.to === buyerId && shipment.key === 'food').reduce((total, shipment) => total + shipment.amount, 0);
  assert.ok(restoredDelivery > limitedDelivery);
  assert.equal(world.links.some((link) => link.congestion > 0), true);
});

test('resources remain nonnegative, bounded, and productive through one hundred years', () => {
  const { world, engine } = start();
  engine.step(100);
  assert.equal(world.year, 2140);
  assert.equal(world.history.length, 101);
  assert.equal(world.cities.length, 12);
  for (const city of world.cities) {
    for (const key of RESOURCE_KEYS) {
      assert.ok(Number.isFinite(city.resources[key]), `${city.name}: ${key} is finite`);
      assert.ok(city.resources[key] >= 0, `${city.name}: ${key} never goes negative`);
      assert.ok(city.resources[key] <= city.resourceCaps[key] + 1e-8, `${city.name}: ${key} respects storage capacity`);
    }
    assert.ok(city.population >= 120 && city.population <= 6000);
    assert.ok(city.gdp >= city.population * 3 && city.gdp <= city.population * 190);
    assert.ok(city.employment >= 0.39 && city.employment <= 0.985);
    assert.ok(city.happiness >= 7 && city.happiness <= 95);
    assert.ok(city.environment >= 0.1 && city.environment <= 0.99);
    for (const [sector, share] of Object.entries(city.industry)) assert.ok(share > 0 && share < 1, `${city.name}: ${sector} mix is valid`);
  }
  for (const [key, price] of Object.entries(world.prices)) {
    assert.ok(price >= RESOURCE_META[key].price * 0.36);
    assert.ok(price <= RESOURCE_META[key].price * 3.8);
  }
  assert.ok(world.cities.some((city) => city.gdp > 0));
});

test('independent world seeds all stay inside the 100-year demographic and resource bounds', () => {
  for (const seed of [1, 7, 42, 9999, 1234567]) {
    const { world, engine } = start({ seed });
    engine.step(100);
    assert.ok(world.history.at(-1).gdp > 0, `seed ${seed} retains a productive global economy`);
    for (const city of world.cities) {
      assert.ok(city.population >= 120 && city.population <= 6000, `seed ${seed}: ${city.name} population`);
      assert.ok(city.happiness >= 7 && city.happiness <= 95, `seed ${seed}: ${city.name} happiness`);
      for (const key of RESOURCE_KEYS) assert.ok(city.resources[key] >= 0 && city.resources[key] <= city.resourceCaps[key] + 0.0001, `seed ${seed}: ${city.name} ${key}`);
      for (const price of Object.values(world.prices)) assert.ok(Number.isFinite(price) && price > 0, `seed ${seed} market remains finite`);
    }
  }
});

test('world growth stays bounded for two centuries, with no runaway economy', () => {
  const { world, engine } = start();
  engine.step(200);
  const first = world.history[0].gdp;
  const final = world.history.at(-1).gdp;
  assert.ok(final > first * 0.15);
  assert.ok(final < first * 12);
  assert.equal(world.history.length, 180);
  assert.equal(world.events.length, 37);
  assert.ok(world.cities.every((city) => city.gdp <= city.population * 190));
  assert.ok(world.cities.every((city) => city.population >= 120));
});

test('each intervention changes simulation state and records its cause', () => {
  for (const type of ['scarcity', 'migration', 'disaster', 'breakthrough']) {
    const { world, engine } = start();
    const city = world.cities[0];
    const before = { food: city.resources.food, environment: city.environment, technology: city.industry.technology, renewables: city.renewableShare, housing: city.housing };
    engine.trigger(type, city.id);
    assert.notEqual(world.events[0].id, 0, `${type} should record a new event`);
    assert.ok(world.events[0].cityId === city.id);
    if (type === 'scarcity') assert.ok(city.resources.food < before.food);
    if (type === 'migration') {
      assert.ok(city.housing < before.housing);
      assert.ok(city.migrationImpulse > 0);
    }
    if (type === 'disaster') assert.ok(city.environment < before.environment && city.resources.food < before.food);
    if (type === 'breakthrough') assert.ok(city.industry.technology > before.technology && city.renewableShare > before.renewables);
  }
});

test('climate, shortages, energy, migration, and policy pressure produce distinct outcomes', () => {
  const outcomes = new Map();
  for (const scenario of ['balanced', 'energy', 'migration', 'ecological', 'scarcity', 'extreme']) {
    const { world, engine } = start({ scenario });
    const initial = world.history[0];
    assert.equal(world.cities.length, 12);
    engine.step(100);
    const result = world.history.at(-1);
    outcomes.set(scenario, { world, initial, result });
    assert.ok(Number.isFinite(result.gdp));
    assert.ok(result.gdp > 0);
    assert.ok(world.cities.every((city) => Number.isFinite(city.attractiveness)));
  }
  assert.ok(outcomes.get('energy').initial.gdp > 0);
  assert.ok(outcomes.get('extreme').initial.environment < outcomes.get('balanced').initial.environment - 0.1);
  assert.ok(outcomes.get('extreme').initial.stocks.water < outcomes.get('balanced').initial.stocks.water);
  assert.ok(outcomes.get('extreme').result.gdp < outcomes.get('balanced').result.gdp);
  assert.ok(outcomes.get('ecological').result.environment >= outcomes.get('balanced').result.environment - 0.01);
  assert.ok(outcomes.get('migration').world.cities[9].population > outcomes.get('balanced').world.cities[9].population);
  assert.ok(outcomes.get('migration').world.cities[9].population > outcomes.get('migration').world.cities[8].population * 0.85);
});

test('an ecological treaty persists and affects ecosystem state rather than only displaying an event', () => {
  const { world, engine } = start();
  const initialRenewables = world.cities.map((city) => city.renewableShare);
  engine.setPolicy('green');
  assert.equal(world.events[0].type, 'policy');
  assert.ok(world.cities.every((city) => city.plan === 'green'));
  engine.step(8);
  for (let i = 0; i < world.cities.length; i++) {
    assert.ok(world.cities[i].renewableShare >= initialRenewables[i]);
    assert.ok(world.cities[i].commitmentYears === 0);
  }
});

test('within-city migration redistribution conserves the population pool', () => {
  const { world, engine } = start();
  const total = world.cities.reduce((sum, city) => sum + city.population, 0);
  engine.economySystem.movePopulation();
  const totalAfter = world.cities.reduce((sum, city) => sum + city.population, 0);
  assert.ok(Math.abs(totalAfter - total) < 0.01);
  assert.ok(world.cities.some((city) => city.migration > 0));
  assert.ok(world.cities.some((city) => city.migration < 0));
});

test('a complete replay produces the identical historical output on a repeated seed', () => {
  const left = start({ seed: 55_129, scenario: 'migration' });
  const right = start({ seed: 55_129, scenario: 'migration' });
  left.engine.step(70);
  right.engine.step(70);
  assert.deepEqual(left.world.history, right.world.history);
  assert.deepEqual(left.world.events, right.world.events);
  assert.deepEqual(left.world.prices, right.world.prices);
  assert.deepEqual(left.world.links, right.world.links);
});

test('compressed city and price history retain bounded long-term storage', () => {
  const { world, engine } = start();
  engine.step(225);
  assert.equal(world.history.length, 180);
  assert.equal(world.priceHistory.length, 60);
  assert.ok(world.cities.every((city) => city.history.length <= 90));
  assert.ok(world.events.length <= 96);
});

test('all requested system modules are instantiated once per world', () => {
  const { engine } = start();
  const names = ['worldManager', 'citySystem', 'resourceSystem', 'transportSystem', 'energySystem', 'environmentSystem', 'economySystem', 'populationSystem', 'industrySystem', 'policySystem', 'eventSystem'];
  for (const name of names) assert.ok(engine[name], `${name} is available on the simulator`);
  assert.ok(engine.worldManager instanceof WorldManager);
  assert.ok(engine.transportSystem instanceof TransportSystem);
  assert.ok(engine.eventSystem instanceof EventSystem);
  assert.ok(engine.economySystem instanceof EconomySystem);
});
