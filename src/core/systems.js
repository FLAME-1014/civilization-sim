import { Random, RESOURCE_KEYS, RESOURCE_META, SECTORS, clampValue } from './model.js';

const clamp = clampValue;
const round = (value, digits = 2) => Number(value.toFixed(digits));
const sum = (object) => Object.values(object).reduce((total, value) => total + value, 0);

export class WorldManager {
  constructor(world) { this.world = world; this.random = new Random(world.seed ^ 0x5f356495); }
  addEvent(type, title, description, city = null, severity = 'info') {
    const event = { id: this.world.nextEventId++, year: this.world.year, type, title, description, cityId: city?.id ?? null, severity };
    this.world.events.unshift(event);
    if (this.world.events.length > 96) this.world.events.length = 96;
    return event;
  }
  naturalEvents() {
    const r = this.random.next();
    if (r > 0.2) return;
    const totalRisk = this.world.cities.reduce((total, item) => total + 1 + item.hazardExposure * 1.3 + Math.max(0, 0.5 - item.environment) * 0.42 + Math.max(0, item.pollution - 0.48) * 0.32, 0);
    let risk = this.random.next() * totalRisk;
    let city = this.world.cities.at(-1);
    for (const candidate of this.world.cities) {
      risk -= 1 + candidate.hazardExposure * 1.3 + Math.max(0, 0.5 - candidate.environment) * 0.42 + Math.max(0, candidate.pollution - 0.48) * 0.32;
      if (risk <= 0) { city = candidate; break; }
    }
    const kind = this.random.next();
    if (kind < 0.19) {
      city.climate = clamp(city.climate - 0.09, 0.12, 0.98);
      city.resources.food *= 0.84;
      city.resources.water *= 0.89;
      city.happiness -= 4;
      this.addEvent('drought', '流域遭遇旱情', `${city.name} 的降雨与收成下降，水粮库存开始收紧。`, city, 'warning');
    } else if (kind < 0.36) {
      city.industry.technology = clamp(city.industry.technology + 0.045, 0.04, 0.62);
      city.industryLevel = clamp(city.industryLevel + 0.045, 0.5, 2.15);
      city.savings += city.population * 1.8;
      this.addEvent('breakthrough', '协同制造取得突破', `${city.name} 提升了工艺效率与本地研发投入。`, city, 'positive');
    } else if (kind < 0.5) {
      city.energyCapacity *= 0.87;
      city.resources.energy *= 0.79;
      this.addEvent('energy', '电网设备意外停运', `${city.name} 的可用发电能力暂时下降。`, city, 'warning');
    } else if (kind < 0.63) {
      city.environment = clamp(city.environment - 0.115, 0.12, 0.98);
      city.pollution += 0.08;
      city.happiness -= 3;
      this.addEvent('pollution', '工业河段发生污染', `${city.name} 的水土修复负担上升，居住吸引力受到影响。`, city, 'danger');
    } else if (kind < 0.77) {
      city.housing *= 1.065;
      city.infrastructure = clamp(city.infrastructure + 0.025, 0.15, 0.98);
      city.savings += city.population * 0.65;
      this.addEvent('expansion', '交通新廊道投入运营', `${city.name} 附近的通勤和仓储设施扩容。`, city, 'positive');
    } else if (kind < 0.89) {
      const link = this.random.pick(this.world.links);
      link.capacity *= 0.69;
      this.addEvent('disaster', '山体滑坡中断货运', `${this.world.cities[link.a].name}—${this.world.cities[link.b].name} 通道运力短时下降。`, city, 'warning');
    } else {
      city.environment = clamp(city.environment + 0.075, 0.12, 0.98);
      city.renewableShare = clamp(city.renewableShare + 0.065, 0.05, 0.9);
      city.policy = 'green';
      city.policyYears = 0;
      this.addEvent('policy', '区域发布清洁转型协定', `${city.name} 增加修复投入并加快可再生能源建设。`, city, 'positive');
    }
  }
}

export class CitySystem {
  decide(city) {
    city.investment = 1;
    if ((city.commitmentYears ?? 0) > 0) {
      city.commitmentYears -= 1;
      if (city.plan === 'green') {
        city.action = '执行联盟清洁能源与生态修复方案';
        city.policy = 'green';
        city.renewableShare = clamp(city.renewableShare + 0.014, 0.04, 0.94);
        city.environment = clamp(city.environment + 0.008, 0.1, 0.99);
      } else if (city.plan === 'innovation') {
        city.action = '执行联盟研发与产业升级方案';
        city.policy = 'innovation';
        city.industry.technology = clamp(city.industry.technology + 0.009, 0.04, 0.66);
        city.investment = 1.035;
      } else if (city.plan === 'resilience') {
        city.action = '执行联盟能源韧性与民生保障方案';
        city.policy = 'resilience';
        city.energyCapacity = Math.min(city.population * 0.98, city.energyCapacity + city.population * 0.022);
        city.housing = Math.min(city.population * 1.24, Math.max(city.housing, city.population * 1.04) + city.population * 0.015);
      }
      const policyTotal = sum(city.industry);
      for (const sector of Object.keys(city.industry)) city.industry[sector] /= policyTotal;
      return;
    }
    const shortage = (key) => city.unmetResources?.[key] ?? Math.max(0, city.resourceUse[key] - city.production[key]) / Math.max(city.resourceUse[key], 1);
    const jobsGap = 0.9 - city.employment;
    const airStress = city.pollution > 0.52 || city.environment < 0.48;
    if (shortage('energy') > 0.28) {
      city.action = '增建发电与储能';
      city.energyCapacity = Math.min(city.population * 0.98, city.energyCapacity + city.population * 0.045 * (0.5 + city.fiscalHealth));
      city.renewableShare = clamp(city.renewableShare + 0.008, 0.04, 0.9);
      city.policy = 'resilience';
      city.infrastructure = clamp(city.infrastructure + 0.004, 0.12, 0.98);
    } else if (shortage('food') > 0.28 && city.climate > 0.18) {
      city.action = '增强本地粮食安全与储备';
      city.industry.agriculture = clamp(city.industry.agriculture + 0.022, 0.04, 0.7);
      city.renewableShare = clamp(city.renewableShare + 0.002, 0.04, 0.9);
    } else if (shortage('materials') > 0.34 && city.mineralReserves > city.originalPopulation * 0.16) {
      city.action = '强化本地材料供给';
      city.industry.mining = clamp(city.industry.mining + 0.018, 0.04, 0.7);
      city.industry.manufacturing = clamp(city.industry.manufacturing + 0.005, 0.04, 0.68);
    } else if (airStress) {
      city.action = '启动工业减排与生态修复';
      city.policy = 'green';
      city.renewableShare = clamp(city.renewableShare + 0.012, 0.04, 0.93);
      city.environment = clamp(city.environment + 0.012, 0.12, 0.98);
      city.pollution = clamp(city.pollution - 0.019, 0, 0.98);
    } else if (city.housing < city.population * 0.91) {
      city.action = '加快保障住房建设';
      city.housing = Math.min(city.population * 1.22, city.housing + city.population * 0.04 * (0.45 + city.fiscalHealth));
      city.housingQuality = clamp(city.housingQuality + 0.006, 0.2, 0.99);
    } else if (jobsGap > 0.055) {
      city.action = '扶持吸纳就业的产业';
      city.policy = 'inclusive';
      city.industry[city.primarySector] = clamp(city.industry[city.primarySector] + 0.012, 0.04, 0.62);
      city.industry.services = clamp(city.industry.services + 0.005, 0.04, 0.54);
      city.investment = 1.015;
    } else if (city.environment > 0.69 && city.fiscalHealth > 0.46 && city.primarySector !== 'mining') {
      city.action = '投资技术升级与新产业';
      city.policy = 'innovation';
      city.industry.technology = clamp(city.industry.technology + 0.008, 0.04, 0.66);
      city.investment = 1.035;
    } else {
      city.action = '按比较优势优化产业';
      city.policy = city.renewableShare < 0.24 ? 'balanced' : 'transition';
      city.industry[city.primarySector] = clamp(city.industry[city.primarySector] + 0.005, 0.04, 0.65);
      city.infrastructure = clamp(city.infrastructure + 0.0025, 0.12, 0.98);
      city.investment = 1.005;
    }
    const total = sum(city.industry);
    for (const sector of Object.keys(city.industry)) city.industry[sector] /= total;
    city.policyYears += 1;
  }
}

export class ResourceSystem {
  calculate(city) {
    const p = city.population;
    const ag = city.industry.agriculture;
    const mine = city.industry.mining;
    const manufacturing = city.industry.manufacturing;
    const technology = city.industry.technology;
    const sectorEfficiency = 0.8 + city.industryLevel * 0.18 + technology * 0.2;
    const energyDemand = p * (0.19 + city.industryLevel * 0.105 + manufacturing * 0.17 + city.wealth * 0.045);
    city.resourceUse = { food: p * 0.19, water: p * (0.118 + ag * 0.075), energy: energyDemand, materials: p * (0.054 + manufacturing * 0.085 + city.infrastructure * 0.018) };
    const solarFactor = 0.8 + city.climate * 0.34;
    const generation = city.energyCapacity * (0.65 + city.renewableShare * 0.25 * solarFactor) * sectorEfficiency;
    city.production = {
      food: p * (0.048 + ag * 1.76 * city.climate) * sectorEfficiency,
      water: p * (0.038 + city.climate * 0.17 + ag * city.climate * 0.025),
      energy: Math.max(0, generation),
      materials: p * (0.025 + manufacturing * 0.052 + technology * 0.025 + mine * 0.14 * sectorEfficiency),
    };
    if (city.mineralReserves === undefined) city.mineralReserves = p * 2.15;
    const extraction = Math.min(p * mine * 0.12 * sectorEfficiency, city.mineralReserves * 0.024);
    city.production.materials += extraction;
    city.mineralReserves = Math.max(0, city.mineralReserves - extraction);
    for (const key of RESOURCE_KEYS) {
      const cap = p * ({ food: 0.52, water: 0.42, energy: 0.56, materials: 0.39 }[key]) + 5;
      city.resourceCaps ??= {};
      city.resourceCaps[key] = cap;
      city.resources[key] = clamp(city.resources[key], 0, cap);
      city.resources[key] = clamp(city.resources[key] + city.production[key], 0, cap);
    }
    city.powerCoverage = clamp(city.resources.energy / Math.max(1, city.resourceUse.energy), 0.12, 1.18);
    city.jobs = p * (0.16 + city.industryLevel * 0.33 + city.industry.services * 0.12) * (0.88 + technology * 0.35);
    return city;
  }
}

export class TransportSystem {
  constructor(world) { this.world = world; }
  pathsFrom(startId) {
    const distance = new Array(this.world.cities.length).fill(Infinity);
    const paths = new Array(this.world.cities.length).fill(null);
    const visited = new Set();
    distance[startId] = 0;
    while (visited.size < this.world.cities.length) {
      let current = -1;
      for (let id = 0; id < distance.length; id++) if (!visited.has(id) && (current < 0 || distance[id] < distance[current])) current = id;
      if (current < 0 || !Number.isFinite(distance[current])) break;
      visited.add(current);
      for (const link of this.world.links) {
        const next = link.a === current ? link.b : link.b === current ? link.a : -1;
        if (next < 0 || visited.has(next)) continue;
        const weight = link.cost * (1.42 - link.quality * 0.52) * (1 + link.congestion * 1.4);
        if (distance[current] + weight < distance[next]) {
          distance[next] = distance[current] + weight;
          paths[next] = [...(paths[current] ?? []), link];
        }
      }
    }
    return { distance, paths };
  }
  trade(key, prices) {
    const cities = this.world.cities;
    const routes = cities.map((city) => this.pathsFrom(city.id));
    const demand = cities.map((city) => Math.max(0, city.resourceUse[key] - city.resources[key]));
    const surplus = cities.map((city) => Math.max(0, city.resources[key] - Math.max(city.population * 0.035, city.resourceUse[key] * 0.065)));
    const shipments = [];
    const buyers = cities.map((city) => city.id).sort((a, b) => demand[b] - demand[a]);
    for (const buyerId of buyers) {
      for (let attempts = 0; attempts < cities.length && demand[buyerId] > 0.01; attempts++) {
        let best = null;
        for (let sellerId = 0; sellerId < cities.length; sellerId++) {
          if (sellerId === buyerId || surplus[sellerId] < 0.01) continue;
          const path = routes[buyerId].paths[sellerId];
          if (!path?.length) continue;
          const limit = Math.min(...path.map((link) => Math.max(0, link.capacity - link.used)));
          const delivered = Math.min(surplus[sellerId], demand[buyerId], limit);
          if (delivered <= 0.025) continue;
          const edgeCost = routes[buyerId].distance[sellerId];
          const tariff = 1 + edgeCost * 0.22;
          const affordability = Math.max(0, cities[buyerId].availableTradeBudget) / Math.max(1, prices[key] * tariff) * 1.2;
          const affordable = Math.min(delivered, affordability);
          const score = affordable / (0.72 + edgeCost);
          if (affordable > 0.025 && (!best || score > best.score)) best = { sellerId, path, amount: affordable, score, tariff };
        }
        if (!best) break;
        const seller = cities[best.sellerId];
        const buyer = cities[buyerId];
        const amount = Math.min(best.amount, surplus[best.sellerId], demand[buyerId]);
        if (amount <= 0.025) break;
        surplus[best.sellerId] -= amount;
        demand[buyerId] -= amount;
        seller.resources[key] -= amount;
        buyer.resources[key] = Math.min(buyer.resourceCaps[key], buyer.resources[key] + amount);
        seller.exports[key] += amount;
        buyer.imports[key] += amount;
        const value = amount * prices[key];
        seller.netTradeValue += value;
        buyer.netTradeValue -= value * best.tariff;
        buyer.availableTradeBudget = Math.max(0, buyer.availableTradeBudget - value * best.tariff);
        for (const link of best.path) link.used += amount;
        shipments.push({ key, from: seller.id, to: buyer.id, amount, distance: routes[buyerId].distance[best.sellerId] });
      }
    }
    for (const city of cities) {
      const use = city.resourceUse[key];
      const unmet = Math.min(1, demand[city.id] / Math.max(1, use));
      city.unmetResources ??= {};
      city.unmetResources[key] = unmet;
      city.resources[key] = Math.max(0, city.resources[key] - Math.min(use, city.resources[key]));
      city.resources[key] = clamp(city.resources[key], 0, city.resourceCaps[key]);
    }
    return shipments;
  }
  step(prices) {
    for (const link of this.world.links) link.used = 0;
    for (const city of this.world.cities) {
      city.imports = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
      city.exports = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
      city.netTradeValue = 0;
      city.availableTradeBudget = Math.max(city.gdp * 0.25, city.savings * 0.2, city.population * 4);
    }
    const allShipments = RESOURCE_KEYS.flatMap((key) => this.trade(key, prices));
    for (const link of this.world.links) {
      link.congestion = clamp(link.used / Math.max(1, link.capacity), 0, 1.5);
      link.annualVolume = link.used;
    }
    return allShipments;
  }
}

export class EnergySystem {
  update(city) {
    const unmet = city.unmetResources?.energy ?? 0;
    if (unmet > 0.035) {
      city.powerCoverage = clamp(1 - unmet * 1.22, 0.15, 1);
      city.happiness -= unmet * 8;
      city.energyCapacity = Math.min(city.population * 0.98, city.energyCapacity + city.population * 0.006);
    } else city.powerCoverage = clamp(city.resources.energy / Math.max(1, city.resourceUse.energy), 0.52, 1.12);
    const efficiency = clamp(city.powerCoverage, 0.18, 1);
    city.energyCapacity = Math.max(city.population * 0.15, city.energyCapacity * (0.998 + city.renewableShare * 0.003));
    return efficiency;
  }
}

export class EnvironmentSystem {
  step(city) {
    const dirtyOutput = city.industry.mining * 0.28 + city.industry.manufacturing * 0.19 + city.industryLevel * 0.055;
    const cleanCapacity = city.renewableShare * 0.16 + city.industry.technology * 0.045 + (city.policy === 'green' ? 0.035 : 0);
    const unmetWater = city.unmetResources?.water ?? 0;
    city.pollution = clamp(city.pollution + dirtyOutput * city.powerCoverage - cleanCapacity - city.environment * 0.045 + unmetWater * 0.025, 0.01, 0.96);
    const restoration = city.policy === 'green' ? 0.018 : city.policy === 'transition' ? 0.01 : 0.0035;
    city.environment = clamp(city.environment + restoration + city.climate * 0.004 - city.pollution * 0.014 - dirtyOutput * 0.018 - unmetWater * 0.012, 0.1, 0.99);
    const nonRenewablePressure = (1 - city.renewableShare) * 0.0042 * city.industryLevel;
    city.renewableShare = clamp(city.renewableShare + (city.policy === 'green' ? 0.013 : 0.004) + city.industry.technology * 0.002 - nonRenewablePressure, 0.04, 0.94);
    return city;
  }
}

export class EconomySystem {
  constructor(world, random) { this.world = world; this.random = random; }
  updatePrices(shipments) {
    const tradePerGood = {};
    for (const key of RESOURCE_KEYS) {
      const supply = this.world.cities.reduce((total, city) => total + city.production[key] + city.resources[key] * 0.17, 0);
      const demand = this.world.cities.reduce((total, city) => total + city.resourceUse[key], 0);
      const trade = shipments.filter((item) => item.key === key).reduce((total, item) => total + item.amount, 0);
      const stock = this.world.cities.reduce((total, city) => total + city.resources[key], 0);
      const imbalance = clamp((demand - supply) / Math.max(1, demand), -0.48, 0.78);
      const cover = stock / Math.max(1, demand);
      const target = RESOURCE_META[key].price * (1 + imbalance * 0.82 + clamp((0.18 - cover) * 0.58, -0.26, 0.25));
      const nudged = target * (1 + clamp((this.random.next() - 0.5) * 0.026, -0.013, 0.013));
      this.world.prices[key] = round(clamp(this.world.prices[key] * 0.68 + nudged * 0.32, RESOURCE_META[key].price * 0.36, RESOURCE_META[key].price * 3.8), 2);
      tradePerGood[key] = trade;
    }
    return tradePerGood;
  }
  updateCity(city, priceChange, energySystem, environmentSystem) {
    const energy = energySystem.update(city);
    const missingFood = city.unmetResources.food ?? 0;
    const missingWater = city.unmetResources.water ?? 0;
    const materialGap = city.unmetResources.materials ?? 0;
    const unmetEssentials = missingFood * 0.58 + missingWater * 0.42;
    const employmentTarget = clamp(city.jobs / Math.max(1, city.population * 0.52), 0.54, 0.985);
    city.employment = clamp(city.employment + clamp(employmentTarget - city.employment, -0.085, 0.075), 0.39, 0.985);
    city.wages = clamp(city.wages * (1 + (city.employment - 0.84) * 0.026 + (city.industry.technology - 0.18) * 0.006), 0.32, 3.2);
    city.housingQuality = clamp(city.housingQuality + (city.infrastructure > 0.68 ? 0.004 : 0.001) - Math.max(0, city.population / Math.max(1, city.housing) - 0.96) * 0.055, 0.2, 0.99);
    const affordability = clamp(city.housing / Math.max(1, city.population), 0.45, 1.08);
    const access = clamp(city.transportAccess, 0.24, 1);
    const living = clamp((0.08 + city.employment * 0.22 + city.environment * 0.25 + affordability * 0.16 + energy * 0.12 + city.housingQuality * 0.12 + city.wealth * 0.1 - city.pollution * 0.16 - unmetEssentials * 0.48) * 100, 8, 96);
    city.happiness = clamp(city.happiness * 0.57 + living * 0.43 - materialGap * 1.5, 7, 95);
    city.attractiveness = clamp(city.happiness * 0.48 + city.environment * 18 + city.employment * 15 + affordability * 9 + access * 6 - city.pollution * 17, 0, 100);
    const technologyGain = Math.max(-0.009, city.industry.technology * 0.025 + (city.policy === 'innovation' ? 0.005 : 0) - unmetEssentials * 0.009);
    const tradeEfficiency = clamp(city.netTradeValue / Math.max(city.gdp * 0.6, 1) * 0.012, -0.012, 0.015);
    const shortages = (city.unmetResources.energy ?? 0) * 0.012 + unmetEssentials * 0.012 + materialGap * 0.0022;
    const pollutionDrag = Math.max(0, 0.54 - city.environment) * 0.004 + Math.max(0, city.pollution - 0.45) * 0.0025;
    const congestionDrag = Math.max(0, (1 - access) * 0.0018);
    const wealthDrag = Math.max(0, city.wealth - 0.82) * 0.003;
    const growth = clamp(0.0036 + technologyGain * 0.16 + city.industry.manufacturing * 0.0011 + city.infrastructure * 0.00038 + city.investment * 0.0006 - 0.00035 + tradeEfficiency - shortages - pollutionDrag - congestionDrag - wealthDrag, -0.035, 0.011);
    city.previousGdp = city.gdp;
    city.gdp = clamp(city.gdp * (1 + growth), Math.max(city.population * 3, 12), Math.max(240, city.population * 190));
    const pricesCost = Object.entries(city.imports).reduce((total, [key, value]) => total + value * priceChange[key], 0);
    const taxes = city.gdp * clamp(0.093 + city.fiscalHealth * 0.016, 0.09, 0.115);
    city.budget = clamp(city.budget * 0.32 + taxes - city.population * (1.25 + unmetEssentials * 3) - city.infrastructure * city.population * 0.24 - city.renewableShare * city.population * 0.17 + Math.max(-city.gdp * 0.03, city.netTradeValue * 0.008), city.population * 0.3, city.gdp * 0.25);
    city.fiscalHealth = clamp(city.fiscalHealth + (city.budget / Math.max(1, city.gdp) - 0.07) * 0.48 - unmetEssentials * 0.02, 0.12, 0.94);
    city.savings = clamp(city.savings * 0.95 + Math.max(0, city.budget - city.population * 1.8) + Math.max(-city.savings * 0.15, -pricesCost * 0.035), city.population * 1.5, city.gdp * 2.4);
    city.wealth = clamp(city.wealth + growth * 0.62 + (city.employment - 0.82) * 0.006 - unmetEssentials * 0.005, 0.18, 0.98);
    city.ageStructure.young = clamp(city.ageStructure.young + 0.009 - city.wealth * 0.004, 0.48, 0.98);
    city.ageStructure.working = clamp(city.ageStructure.working + (city.employment > 0.85 ? 0.014 : 0.006) - 0.006, 2.2, 4.5);
    city.ageStructure.old = clamp(city.ageStructure.old + 0.012 + city.wealth * 0.003, 0.3, 1.82);
    const naturalGrowth = clamp(0.007 + city.ageStructure.young * 0.004 - city.ageStructure.old * 0.007 + (living > 61 ? 0.002 : -0.002) - unmetEssentials * 0.013 - Math.max(0, 0.59 - city.environment) * 0.009, -0.024, 0.019);
    city.population = clamp(city.population * (1 + naturalGrowth), 120, 6000);
    city.growth = round(growth * 100, 2);
    city.livingQuality = round(living, 1);
    city.lastPrices = { ...priceChange };
    city.migration = 0;
    environmentSystem.step(city);
    return city;
  }
  movePopulation() {
    const cities = this.world.cities;
    const totalPopulation = cities.reduce((total, city) => total + city.population, 0);
    const pressure = this.world.scenario === 'migration' ? 0.034 : this.world.scenario === 'energy' ? 0.012 : this.world.scenario === 'scarcity' ? 0.005 : 0.004;
    const pool = totalPopulation * pressure / 12;
    const weights = cities.map((city) => Math.exp(clamp((city.attractiveness + city.migrationImpulse + (city.scenarioMigration > 0 ? 30 : 0) - 67) / 19, -2.8, 2.8)) * clamp(city.housing / Math.max(1, city.population), 0.25, 1.14));
    const totalWeight = sum(weights);
    const moveByCity = weights.map((weight, index) => {
      const city = cities[index];
      const desired = pool * (weight / totalWeight - city.population / totalPopulation);
      return clamp(desired, -city.population * 0.034, city.population * 0.034);
    });
    const imbalance = moveByCity.reduce((total, amount) => total + amount, 0);
    if (imbalance > 0) {
      let left = imbalance;
      for (let i = 0; i < moveByCity.length && left > 0.001; i++) if (moveByCity[i] < 0) {
        const reclaim = Math.min(-moveByCity[i], left);
        moveByCity[i] += reclaim;
        left -= reclaim;
      }
    } else if (imbalance < 0) {
      let left = -imbalance;
      for (let i = 0; i < moveByCity.length && left > 0.001; i++) if (moveByCity[i] > 0) {
        const supplement = Math.min(moveByCity[i] * 0.6, left);
        moveByCity[i] -= supplement;
        left -= supplement;
      }
    }
    for (let id = 0; id < cities.length; id++) {
      const city = cities[id];
      const shock = city.scenarioMigration > 0 ? city.scenarioMigration * city.originalPopulation / 12 : 0;
      const finalMigration = moveByCity[id] + shock;
      city.migration = round(finalMigration, 1);
      city.population = clamp(city.population + finalMigration, 120, 6000);
      city.housing = Math.max(30, city.housing * (1 + Math.max(0, city.population / Math.max(1, city.housing) - 0.91) * 0.018));
    }
  }
  history() {
    const cities = this.world.cities;
    const record = {
      year: this.world.year,
      gdp: round(cities.reduce((total, city) => total + city.gdp, 0)),
      population: round(cities.reduce((total, city) => total + city.population, 0), 1),
      happiness: round(cities.reduce((total, city) => total + city.happiness * city.population, 0) / cities.reduce((total, city) => total + city.population, 0), 1),
      environment: round(cities.reduce((total, city) => total + city.environment, 0) / cities.length, 3),
      employment: round(cities.reduce((total, city) => total + city.employment, 0) / cities.length, 3),
      trade: round(this.world.annualTradeValue ?? 0),
      tradeVolume: round(this.world.annualTrade ?? 0),
      stocks: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, round(cities.reduce((total, city) => total + city.resources[key], 0), 1)])),
      prices: { ...this.world.prices },
      cities: Object.fromEntries(cities.map((city) => [city.id, { gdp: round(city.gdp), population: round(city.population, 1), happiness: round(city.happiness, 1), environment: round(city.environment, 3), employment: round(city.employment, 3) }])),
    };
    this.world.history.push(record);
    if (this.world.history.length > 180) this.world.history.shift();
    this.world.priceHistory.push({ year: record.year, ...record.prices });
    if (this.world.priceHistory.length > 60) this.world.priceHistory.shift();
    for (const city of cities) {
      city.history.push(record.cities[city.id]);
      if (city.history.length > 90) city.history.shift();
    }
    return record;
  }
}

export class PolicySystem {
  constructor(world, random) { this.world = world; this.random = random; }
  setWorldPolicy(policy) {
    for (const city of this.world.cities) {
      if (policy === 'green') {
        city.policy = 'green';
        city.plan = policy;
        city.commitmentYears = 8;
        city.renewableShare = clamp(city.renewableShare + 0.035, 0.04, 0.94);
      } else if (policy === 'innovation') {
        city.policy = 'innovation';
        city.plan = policy;
        city.commitmentYears = 8;
        city.industry.technology = clamp(city.industry.technology + 0.025, 0.04, 0.66);
      } else if (policy === 'resilience') {
        city.policy = 'resilience';
        city.plan = policy;
        city.commitmentYears = 8;
        city.energyCapacity = Math.min(city.population * 0.98, city.energyCapacity + city.population * 0.045);
        city.housing = Math.max(city.housing, city.population * 1.04);
      }
    }
    this.worldManager?.addEvent('policy', '联盟通过协调发展方案', policy === 'green' ? '各城增加清洁能源与生态修复投入。' : policy === 'innovation' ? '各城加大研发投入并推进技术扩散。' : '各城扩建电网、储能与民生基础设施。', null, 'positive');
  }
}

export class PopulationSystem {
  constructor(economy) { this.economy = economy; }
  migrate() { this.economy.movePopulation(); }
}

export class IndustrySystem {
  update(city) {
    const production = city.production;
    const vacancies = Math.max(0, city.jobs - city.population * city.employment * 0.52);
    if (vacancies > city.population * 0.075 && city.fiscalHealth > 0.55 && city.resources.materials > city.resourceUse.materials * 0.28) {
      city.industryLevel = clamp(city.industryLevel + 0.012, 0.42, 2.1);
      city.industry.manufacturing = clamp(city.industry.manufacturing + 0.003, 0.04, 0.65);
    } else if (city.unmetResources.energy > 0.24 || city.mineralReserves < city.originalPopulation * 0.48) {
      city.industryLevel = clamp(city.industryLevel - 0.008, 0.42, 2.1);
    } else if (city.industry.technology > 0.24) city.industryLevel = clamp(city.industryLevel + 0.0035, 0.42, 2.1);
    city.output = production;
    for (const [sector, data] of Object.entries(SECTORS)) {
      if (city.industry[sector] > 0.34 && city.jobs < city.population * 0.47 * data.jobs) city.employment = clamp(city.employment - 0.002, 0.39, 0.985);
    }
  }
}

export class EventSystem {
  constructor(manager) { this.manager = manager; }
  step() { this.manager.naturalEvents(); }
  trigger(type, cityId = 0) {
    const city = this.manager.world.cities[cityId];
    if (type === 'scarcity') {
      for (const key of RESOURCE_KEYS) city.resources[key] *= 0.55;
      city.happiness -= 5;
      this.manager.addEvent('crisis', '战略库存遭遇冲击', `${city.name} 的战略储备下降 45%，跨城采购开始承压。`, city, 'danger');
    } else if (type === 'migration') {
      city.attractiveness = clamp(city.attractiveness + 24, 0, 100);
      city.housing *= 0.88;
      city.migrationImpulse = 30;
      city.migrationYears = 12;
      this.manager.addEvent('migration', '区域安置网络启动', `${city.name} 开放了临时居住与就业安置名额。`, city, 'warning');
    } else if (type === 'disaster') {
      city.climate = clamp(city.climate - 0.19, 0.1, 0.98);
      city.environment = clamp(city.environment - 0.13, 0.1, 0.99);
      city.resources.food *= 0.72;
      city.resources.water *= 0.68;
      city.happiness -= 9;
      this.manager.addEvent('disaster', '强风暴潮冲击沿岸设施', `${city.name} 的港区库存与生态环境遭受冲击。`, city, 'danger');
    } else if (type === 'breakthrough') {
      city.industry.technology = clamp(city.industry.technology + 0.14, 0.04, 0.66);
      city.renewableShare = clamp(city.renewableShare + 0.1, 0.04, 0.94);
      this.manager.addEvent('breakthrough', '清洁技术突破', `${city.name} 将突破成果投入可再生发电和产业效率。`, city, 'positive');
    }
  }
}

export class SimulationEngine {
  constructor(world) {
    this.world = world;
    this.worldManager = new WorldManager(world);
    this.citySystem = new CitySystem();
    this.resourceSystem = new ResourceSystem();
    this.transportSystem = new TransportSystem(world);
    this.energySystem = new EnergySystem();
    this.environmentSystem = new EnvironmentSystem();
    this.random = new Random(world.seed ^ 0x5a1793e3);
    this.economySystem = new EconomySystem(world, this.random);
    this.populationSystem = new PopulationSystem(this.economySystem);
    this.industrySystem = new IndustrySystem();
    this.policySystem = new PolicySystem(world, this.random);
    this.policySystem.worldManager = this.worldManager;
    this.eventSystem = new EventSystem(this.worldManager);
  }
  capture() {
    if (this.world.history.some((record) => record.year === this.world.year)) return this.world.history.at(-1);
    return this.economySystem.history();
  }
  step(count = 1) {
    const years = Math.max(1, Math.min(1000, Math.floor(count)));
    for (let year = 0; year < years; year++) {
      this.world.year++;
      this.world.tick++;
      this.eventSystem.step();
      for (const city of this.world.cities) {
        this.citySystem.decide(city);
        this.resourceSystem.calculate(city);
      }
      const tradePrices = { ...this.world.prices };
      const shipments = this.transportSystem.step(tradePrices);
      for (const city of this.world.cities) {
        this.industrySystem.update(city);
        this.economySystem.updateCity(city, this.world.prices, this.energySystem, this.environmentSystem);
      }
      const tradeByResource = this.economySystem.updatePrices(shipments);
      this.world.annualTrade = sum(Object.values(tradeByResource));
      this.world.annualTradeVolume = this.world.links.reduce((total, link) => total + (link.annualVolume ?? 0), 0);
      this.world.annualTradeValue = RESOURCE_KEYS.reduce((total, key) => total + tradeByResource[key] * tradePrices[key], 0);
      for (const city of this.world.cities) {
        city.annualTradeVolume = RESOURCE_KEYS.reduce((total, key) => total + city.imports[key] + city.exports[key], 0) / 2;
        city.annualTrade = RESOURCE_KEYS.reduce((total, key) => total + (city.imports[key] + city.exports[key]) * tradePrices[key], 0) / 2;
      }
      this.populationSystem.migrate();
      this.economySystem.history();
      if (this.world.year % 5 === 0) for (const link of this.world.links) link.capacity = clamp(link.capacity * 0.985 + 6, 10, 110);
    }
    return this.world;
  }
  setPolicy(policy) { this.policySystem.setWorldPolicy(policy); }
  trigger(type, cityId = 0) { this.eventSystem.trigger(type, cityId); }
}

export const ENGINE_COMPONENTS = ['WorldManager', 'SimulationEngine', 'CitySystem', 'PopulationSystem', 'EconomySystem', 'ResourceSystem', 'IndustrySystem', 'TransportSystem', 'EnergySystem', 'EnvironmentSystem', 'EventSystem', 'PolicySystem'];
