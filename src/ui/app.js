import { createWorld, RESOURCE_KEYS, RESOURCE_META, SECTORS } from '../core/model.js';
import { SimulationEngine, ENGINE_COMPONENTS } from '../core/systems.js';

const svgNS = 'http://www.w3.org/2000/svg';
const byId = (id) => document.getElementById(id);
const fmt = (number, digits = 0) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeId = (value) => Math.floor(Math.abs(Number(value) || 0));

let seed = 2026;
let scenario = 'balanced';
let world = createWorld({ seed, scenario });
let engine = new SimulationEngine(world);
let selectedId = 0;
let layer = 'economy';
let series = 'gdp';
let toastTimer;
let timer;
let speed = 1;
let mapMotion = false;
let scrollTarget = null;
engine.capture();

const icons = { founding: '◈', drought: '◌', breakthrough: '✳', energy: 'ϟ', pollution: '≋', expansion: '↗', disaster: '⌁', policy: '▧', crisis: '◉', migration: '⇢' };
const palette = { gdp: { stroke: '#698f67', fill: '#8bac79', unit: '万亿', title: '世界生产总值' }, population: { stroke: '#6b91a2', fill: '#84adb8', unit: '万人', title: '世界共同人口' }, happiness: { stroke: '#b58e57', fill: '#d0b27a', unit: '/ 100', title: '城市加权幸福指数' }, environment: { stroke: '#688b73', fill: '#99b994', unit: '/ 100', title: '行星生态评分' } };

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function deltaString(current, previous, digits = 1) {
  if (!Number.isFinite(previous) || previous <= 0) return '初年';
  const change = (current - previous) / previous * 100;
  return `${change > 0.049 ? '↑' : change < -0.049 ? '↓' : '→'} ${Math.abs(change).toFixed(digits)}%`;
}

function initMap(svg = byId('world-map')) {
  const land = document.createElementNS(svgNS, 'g');
  land.innerHTML = `
    <rect width="1000" height="440" class="map-water"/>
    <g class="map-grid">
      <path d="M35 95H955M30 170H960M25 245H965M25 320H965M30 390H960"/>
      <path d="M140 22V423M300 17V424M460 16V425M620 18V424M780 20V420M925 26V416"/>
      <path d="M60 412C208 286 352 279 477 212S755 149 944 60"/>
      <path d="M52 338C220 218 352 212 495 149S770 104 947 33"/>
      <path d="M43 260C223 159 377 147 524 100S800 59 956 28"/>
    </g>
    <path class="map-land" d="M91 115l51-47 69 12 24-25 93-7 36 27 66-11 34 35 49-14 45 29 56-17 41 28 67-6 26 35 57 4 18 29 67 1 18 37-18 35 17 33-31 21-13 48-41 12-25 38-63 1-28-23-43 18-28-15-61 31-48-14-40 17-43-17-37 16-34-19-68 15-50-22-69 11-35-18-56 17-49-27-50 7-22-32-49-4-13-32-41-24 12-38-20-34 18-31-15-34z"/>
    <path d="M97 273c58-24 82-53 121-47 38 5 40 48 81 41 42-7 52-48 91-34 39 14 39 44 76 32 46-15 52-56 100-41 44 13 46 52 88 30 42-22 74-27 135-8" class="map-river"/>
    <path d="M229 146c28 31 29 51 8 75-20 23-40 38-41 68m248-157c-32 26-40 56-28 76 13 18 35 22 33 57m275-83c28 19 40 41 33 64-6 23-29 36-51 39m-456 24c37-20 60-12 75 9 13 20 6 38-19 56m340-13c35-19 56-14 75 4 15 18 16 40 2 65" class="map-river-secondary"/>
    <path d="M170 107c34 47 59 69 91 80m91-123c-22 41-14 68 19 88m186-51c-20 30-13 61 23 78m109 89c30 34 35 54 25 77m-319-72c-16 37-39 54-74 49m304-217c34 11 55 28 66 52" class="map-terrain"/>
    <path d="M250 205c30-30 57-38 86-24 25 14 38 35 35 62m136-99c33-25 64-24 88 0 19 23 26 46 15 70m186-3c25-8 47 1 57 24m-498 85c28-14 56-10 76 12m-108 14c32-15 66-11 87 13" class="map-terrain-deep"/>
    <g class="map-region-label"><text x="310" y="120">九 江 平 原</text><text x="516" y="188">岚 岸 连 山</text><text x="737" y="352">南 境 湿 地</text></g>
    <g class="route-layer" id="route-layer"></g>
    <g class="city-layer" id="city-layer"></g>`;
  svg.replaceChildren(land);
}

function location(city) {
  const bearing = ['西北', '西南', '东北', '东南'][(city.id + Math.round(city.x)) % 4];
  return `${bearing}分区 · ${fmt(city.x * 0.12, 0)}°E / ${fmt(city.y * 0.08 + 14, 0)}°N`;
}

function showAmount(type, city, record) {
  if (type === 'gdp') return record ? record.gdp / 1000000 : world.history.at(-1).gdp / 1000000;
  if (type === 'population') return record ? record.population / 10 : world.history.at(-1).population / 10;
  return type === 'happiness' ? record?.happiness ?? world.history.at(-1).happiness : (record?.environment ?? world.history.at(-1).environment) * 100;
}

function mapNodeSize(city) { return clamp(3.3 + Math.sqrt(city.population / 310) * 1.15, 4.2, 9.4); }

function nodeColor(intensity, layerName) {
  const paletteByLayer = { economy: ['#d3a08f', '#53916c'], population: ['#d4c091', '#568391'], environment: ['#bd8975', '#568965'], resources: ['#c9917f', '#639280'] };
  const [low, high] = paletteByLayer[layerName] ?? paletteByLayer.economy;
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const start = parse(low); const end = parse(high); const t = clamp(intensity, 0, 1);
  return '#' + start.map((value, i) => Math.round(value + (end[i] - value) * t).toString(16).padStart(2, '0')).join('');
}

function renderMap() {
  const svg = byId('world-map');
  if (!svg.querySelector('#city-layer')) initMap(svg);
  const routeLayer = svg.querySelector('#route-layer');
  const cityLayer = svg.querySelector('#city-layer');
  byId('metric-cities').textContent = `${world.cities.length} 座城市`;
  document.querySelector('.city-count-badge').innerHTML = `${world.cities.length} NODES <span>·</span> ${world.links.length} LINKS`;
  const flow = world.links.map((link) => ({ ...link, volume: link.annualVolume ?? 0 }));
  routeLayer.innerHTML = world.links.map((link, i) => {
    const a = world.cities[link.a];
    const b = world.cities[link.b];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const side = (link.a + link.b) % 2 ? 1 : -1;
    const bend = Math.hypot(a.x - b.x, a.y - b.y) * 0.085 * side;
    const cx = midX - (b.y - a.y) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) * bend;
    const cy = midY + (b.x - a.x) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) * bend;
    const path = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    const units = flow[i]?.volume ?? 0;
    const selected = a.id === selectedId || b.id === selectedId;
    const show = layer === 'economy' || selected;
    return `<g opacity="${show ? 1 : .35}"><path d="${path}" class="map-route-under"/><path d="${path}" class="map-route ${selected ? 'selected' : ''} ${units > 55 ? 'busy' : ''}" data-link="${i}" style="stroke-width:${(0.85 + clamp(units / 95, 0, 1.7)).toFixed(2)}px;opacity:${(0.36 + clamp(units / 115, 0, 0.59)).toFixed(2)}"><title>${esc(a.name)}—${esc(b.name)}：实际年运量 ${fmt(Math.max(0, units), 1)} 资源单位 · 路线容量 ${fmt(link.capacity, 0)}</title></path></g>`;
  }).join('');
  cityLayer.innerHTML = world.cities.map((city) => {
    const chosen = city.id === selectedId;
    const r = mapNodeSize(city);
    const resourceAvailability = RESOURCE_KEYS.reduce((total, key) => total + city.resources[key] / Math.max(1, city.resourceCaps[key]), 0) / RESOURCE_KEYS.length;
    const heat = layer === 'environment' ? city.environment : layer === 'population' ? clamp(Math.sqrt(city.population / 6000), .1, 1) : layer === 'resources' ? resourceAvailability : clamp(city.gdp / 65000, .1, 1);
    const trendColor = nodeColor(heat, layer);
    const labelDirection = city.x > 780 ? 'end' : city.x < 130 ? 'start' : 'middle';
    const labelOffset = labelDirection === 'end' ? -11 : labelDirection === 'start' ? 11 : 0;
    const keyMetric = layer === 'economy' ? `${fmt(city.gdp / 1000)} B` : layer === 'population' ? `${fmt(city.population)} K` : layer === 'resources' ? `${fmt(resourceAvailability * 100)}% stock` : `${fmt(city.environment * 100)} eco`;
    const mark = world.links.some((link) => (link.a === city.id || link.b === city.id) && link.congestion > 0.8);
    return `<g class="map-city-group ${chosen ? 'selected' : ''}" tabindex="0" role="button" aria-label="查看${esc(city.name)}：人口 ${fmt(city.population, 0)} 千" data-city="${city.id}" style="--node-accent:${trendColor}">
      <title>${esc(city.name)} · ${esc(city.identity)} · ${keyMetric} · 就业 ${fmt(city.employment * 100, 0)}%</title>
      <circle class="map-city-touch" cx="${city.x}" cy="${city.y}" r="${window.matchMedia('(max-width: 700px)').matches ? 27 : 15}"/>
      <circle class="map-city-halo ${chosen ? 'pulse' : ''}" cx="${city.x}" cy="${city.y}" r="${chosen ? r + 6 : r + 4}" style="fill:${trendColor};opacity:${0.18 + heat * 0.52}"/>
      <circle class="map-city-core" cx="${city.x}" cy="${city.y}" r="${r}" style="fill:${trendColor}"/>
      ${mark ? `<circle class="map-trade-indicator" cx="${city.x + r + 2}" cy="${city.y - r - 2}" r="2.3"><title>交通通路拥堵，可能限制供应</title></circle>` : ''}
      <text class="map-city-name" x="${city.x + labelOffset}" y="${city.y - 13}" text-anchor="${labelDirection}">${esc(city.name)}</text>
      <text class="map-city-subtitle" x="${city.x + labelOffset}" y="${city.y - 1}" text-anchor="${labelDirection}">${keyMetric}</text>
    </g>`;
  }).join('');
  svg.querySelectorAll('.map-city-group').forEach((group) => {
    group.addEventListener('click', () => selectCity(safeId(group.dataset.city)));
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCity(safeId(group.dataset.city)); } });
  });
}

function renderKpis() {
  const latest = world.history.at(-1);
  const previous = world.history.at(-2);
  const totalGdp = world.cities.reduce((total, city) => total + city.gdp, 0);
  const totalPopulation = world.cities.reduce((total, city) => total + city.population, 0);
  const totalTrade = world.annualTradeValue ?? 0;
  const environment = world.cities.reduce((total, city) => total + city.environment, 0) / world.cities.length * 100;
  const gdpValue = totalGdp / 1_000_000;
  const popValue = totalPopulation / 10;
  const tradeValue = totalTrade / 100;
  byId('metric-gdp').innerHTML = `${fmt(gdpValue, 2)}<span class="metric-unit">万亿</span>`;
  byId('metric-population').innerHTML = `${fmt(popValue, 1)}<span class="metric-unit">万人</span>`;
  byId('metric-trade').innerHTML = world.tick === 0 ? `—<span class="metric-unit">模拟启航后结算</span>` : `${fmt(tradeValue, 1)}<span class="metric-unit">亿 / 年</span>`;
  byId('metric-eco').innerHTML = `${fmt(environment, 0)}<span class="metric-unit">/ 100</span>`;
  const prevGdp = previous ? previous.gdp / 1_000_000 : 0;
  const prevPopulation = previous ? previous.population / 10 : 0;
  const prevEco = previous ? previous.environment * 100 : 0;
  byId('metric-gdp-delta').textContent = deltaString(gdpValue, prevGdp);
  byId('metric-population-delta').textContent = deltaString(popValue, prevPopulation);
  byId('metric-eco-delta').textContent = environment - prevEco > .06 ? `↑ ${fmt(environment - prevEco, 1)}` : environment - prevEco < -.06 ? `↓ ${fmt(Math.abs(environment - prevEco), 1)}` : '维持稳定';
  for (const item of ['metric-gdp-delta', 'metric-population-delta', 'metric-eco-delta']) byId(item).classList.toggle('delta-negative', byId(item).textContent.includes('↓'));
  byId('eco-meter-fill').style.width = `${clamp(environment, 3, 100)}%`;
  byId('metric-cities').textContent = `${world.cities.length} 座城市`;
  byId('metric-trade-route').textContent = world.tick === 0 ? '等候首个结算年份' : world.cities.filter((city) => city.annualTradeVolume > 0.1).length > 7 ? '多中心互联' : '部分货运受限';
  byId('metric-active-routes').textContent = `${world.links.filter((link) => (link.annualVolume ?? 0) > 0.1).length} 条活跃通路`;
  const history = world.history.slice(-12);
  if (history.length) {
    const values = history.map((item) => item.gdp);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const points = history.map((record, index) => `${(2 + index / Math.max(1, history.length - 1) * 72).toFixed(1)},${(20 - (record.gdp - minimum + (maximum === minimum ? 1 : 0)) / Math.max(1, maximum - minimum) * 16).toFixed(1)}`);
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
    const endX = points.at(-1).split(',')[0];
    byId('gdp-spark').innerHTML = `<path d="${path}" fill="none" stroke="#719b74" stroke-width="1.7"/><path d="${path} L${endX} 23 L2 23 Z" fill="#719b74" opacity=".12"/>`;
  }
}

function renderCity() {
  const city = world.cities[selectedId];
  const sector = SECTORS[city.primarySector];
  const previous = city.history.at(-2);
  const employment = clamp(city.employment * 100, 0, 100);
  const sectors = Object.entries(SECTORS).map(([key, detail]) => ({ key, ...detail, share: city.industry[key] })).sort((a, b) => b.share - a.share);
  byId('city-detail').innerHTML = `
    <article class="city-profile" style="--city-accent:${sector.color}">
      <div class="city-title-row"><div class="city-title-group"><span class="city-avatar" style="background:${esc(sector.color)}18;color:${esc(sector.color)}">${esc(city.name.slice(0, 1))}</span><span><h2 class="city-title">${esc(city.name)}</h2><span class="city-subtitle">${esc(city.identity)}</span></span></div><span class="city-sector-badge" style="color:${esc(sector.color)}">${sector.name}核心</span></div>
      <div class="city-location"><svg viewBox="0 0 16 16" fill="none"><path d="M13 6.6c0 3.4-5 7.4-5 7.4S3 10 3 6.6A5 5 0 1 1 13 6.6Z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="6.5" r="1.7" stroke="currentColor" stroke-width="1.2"/></svg>${location(city)}</div>
      <div class="city-kpis"><div class="city-kpi"><span class="city-kpi-label">城市生产总值</span><span class="city-kpi-value">${fmt(city.gdp / 1000, 1)}<small>十亿</small><span class="city-kpi-change ${city.growth < 0 ? 'negative' : ''}">${city.growth >= 0 ? '↑' : '↓'} ${fmt(Math.abs(city.growth), 1)}%</span></span></div><div class="city-kpi"><span class="city-kpi-label">常住人口</span><span class="city-kpi-value">${fmt(city.population, 0)}<small>千人</small><span class="city-kpi-change ${city.migration < -1 ? 'negative' : ''}">${city.migration >= 0 ? '+' : ''}${fmt(city.migration, 0)}</span></span></div></div>
      <div class="city-profile-rule"></div><div class="progress-label"><span>就业率</span><strong>${fmt(employment, 1)}%</strong><span>营商吸引力&nbsp; ${fmt(city.attractiveness, 0)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${employment}%"></div></div><div class="quality-caption"><span class="quality-dot"></span>生活质量指数&nbsp; ${fmt(city.livingQuality ?? city.happiness, 0)} / 100 <span style="margin-left:auto">生态健康&nbsp; ${fmt(city.environment * 100, 0)}</span></div>
      <div class="industry-heading"><strong>五大产业结构</strong><span>产业规模 × 效率 ${fmt(city.industryLevel, 2)}</span></div>
      ${sectors.map((item) => `<div class="industry-row"><span class="industry-name">${item.name}</span><span class="industry-bar"><span class="industry-fill" style="display:block;width:${fmt(item.share * 100, 1)}%;background:${esc(item.color)}"></span></span><span class="industry-pct">${fmt(item.share * 100, 0)}%</span></div>`).join('')}
      <div class="city-action"><span class="action-icon">↗</span><span style="flex:1"><span class="action-label">城市自主决策</span><span class="action-text">${esc(city.action)}</span></span><span class="city-action-fee">能源覆盖 ${fmt(city.powerCoverage * 100, 0)}%</span></div>
    </article>`;
}

function renderResources() {
  const keys = RESOURCE_KEYS;
  const currentCity = world.cities[selectedId];
  byId('resource-grid').innerHTML = keys.map((key) => {
    const meta = RESOURCE_META[key];
    const total = world.cities.reduce((sum, city) => sum + city.resources[key], 0);
    const cap = world.cities.reduce((sum, city) => sum + city.resourceCaps[key], 0);
    const available = currentCity.resources[key];
    const capacity = currentCity.resourceCaps[key];
    const ratio = clamp(available / Math.max(capacity, 1), 0, 1);
    const unmet = (currentCity.unmetResources?.[key] ?? 0) > .06;
    return `<article class="resource-item"><div class="resource-item-top"><span class="resource-icon" style="color:${esc(meta.color)}">${meta.icon}</span><span class="resource-change ${unmet ? 'negative' : 'positive'}">${unmet ? '供应偏紧' : '库存稳定'}</span></div><div class="resource-name">${meta.name} <span style="color:#a0a094">· 城市 / 世界</span></div><div class="resource-quantity">${fmt(available, 0)}<span class="resource-unit">${meta.unit}</span></div><div class="resource-price">世界储量 ${fmt(total / 1000, 1)} k&nbsp; · &nbsp;${fmt(world.prices[key], 0)} index</div><div class="resource-bar"><span style="width:${fmt(ratio * 100, 0)}%;background:${esc(meta.color)};${unmet ? 'opacity:.6' : ''}"></span></div></article>`;
  }).join('');
}

function chartData() {
  const all = world.history.slice(-30);
  const config = palette[series];
  return all.map((item) => ({ year: item.year, value: series === 'gdp' ? item.gdp / 1_000_000 : series === 'population' ? item.population / 10 : series === 'happiness' ? item.happiness : item.environment * 100, config }));
}

function renderChart() {
  const config = palette[series];
  const data = chartData();
  const svg = byId('trend-chart');
  const width = 660;
  const height = 204;
  const pad = { left: 42, right: 10, top: 12, bottom: 25 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  let minimum = Math.min(...data.map((point) => point.value));
  let maximum = Math.max(...data.map((point) => point.value));
  if (!Number.isFinite(minimum)) minimum = 0;
  if (!Number.isFinite(maximum)) maximum = 100;
  if (series === 'happiness' || series === 'environment') { minimum = Math.min(minimum - 3, 40); maximum = Math.max(maximum + 3, 80); }
  else { const padValue = Math.max(1, (maximum - minimum) * .25); minimum = Math.max(0, minimum - padValue); maximum += padValue; }
  const scale = (value) => pad.top + innerHeight * (1 - (value - minimum) / Math.max(0.0001, maximum - minimum));
  const points = data.map((item, i) => ({ x: pad.left + (data.length < 2 ? innerWidth / 2 : innerWidth * i / (data.length - 1)), y: scale(item.value), year: item.year, value: item.value }));
  const path = points.length < 2 ? '' : points.map((point, i) => `${i ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = points.length < 2 ? '' : `${path} L${points.at(-1).x},${pad.top + innerHeight} L${points[0].x},${pad.top + innerHeight} Z`;
  const tickCount = 4;
  const grid = Array.from({ length: tickCount }, (_, i) => {
    const value = maximum - (maximum - minimum) * i / (tickCount - 1);
    const y = scale(value);
    const label = series === 'gdp' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : value.toFixed(0);
    return `<line class="chart-grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${pad.left - 6}" y="${y + 3}" text-anchor="end">${label}</text>`;
  }).join('');
  svg.innerHTML = `${grid}<path class="chart-fill" d="${area}" fill="${config.fill}"/><path class="chart-path" d="${path}" stroke="${config.stroke}"/>${points.length ? `<circle class="chart-endpoint" cx="${points.at(-1).x}" cy="${points.at(-1).y}" r="4" fill="${config.stroke}"/><circle cx="${points.at(-1).x}" cy="${points.at(-1).y}" r="7" fill="${config.stroke}" opacity=".14"/>` : ''}<defs><clipPath id="chart-clip"><rect x="${pad.left}" y="${pad.top}" width="${innerWidth}" height="${innerHeight}"/></clipPath></defs>`;
  const latest = data.at(-1);
  const previous = data.at(-2);
  byId('chart-current').textContent = latest ? fmt(latest.value, series === 'gdp' ? 3 : 1) : '0';
  byId('chart-unit').textContent = config.unit;
  byId('chart-delta').textContent = latest && previous ? deltaString(latest.value, previous.value, 1) : '初年';
  byId('chart-span').textContent = `${data.length} 年数据`;
  const labels = [data[0]?.year, data[Math.floor((data.length - 1) / 3)]?.year, data[Math.floor((data.length - 1) * 2 / 3)]?.year, data.at(-1)?.year].filter(Boolean);
  byId('chart-x-axis').innerHTML = labels.map((year) => `<span>${year}</span>`).join('');
}

function renderEvents() {
  const events = world.events.slice(0, 9);
  byId('event-count').textContent = String(world.events.length).padStart(2, '0');
  byId('event-list').innerHTML = events.map((event) => {
    const city = event.cityId == null ? null : world.cities[event.cityId];
    const name = city ? `${city.name} · ${event.title}` : event.title;
    const tags = { positive: '发展', warning: '预警', danger: '危机', info: '档案' };
    return `<article class="event-item"><span class="event-marker ${esc(event.severity)}">${icons[event.type] ?? '◈'}</span><div><div class="event-meta"><span class="event-year">${event.year} · ${String(event.year - 2040 + 1).padStart(2, '0')} / YR</span><span class="event-tag ${esc(event.severity)}">${tags[event.severity] ?? '档案'}</span></div><h4>${esc(name)}</h4><p>${esc(event.description)}</p></div></article>`;
  }).join('');
}

function updateYear() {
  byId('year-display').textContent = world.year;
  byId('controls-year').textContent = `YEAR ${world.year}`;
}

function render() {
  updateYear();
  renderKpis();
  renderMap();
  renderCity();
  renderResources();
  renderChart();
  renderEvents();
  if (scrollTarget) {
    document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    scrollTarget = null;
  }
}

function selectCity(id) {
  if (!world.cities[id]) return;
  selectedId = id;
  byId('map-selected').textContent = `${world.cities[id].name} · ${location(world.cities[id])}`;
  byId('map-hint').innerHTML = `<span class="hint-dot"></span> 已选中 ${esc(world.cities[id].name)} · 查看实时产业、就业与战略储备`;
  render();
}

function pause() { clearInterval(timer); timer = undefined; world.running = false; byId('play-glyph').textContent = '▶'; byId('play-label').textContent = '开始演进'; byId('play-button').setAttribute('aria-label', '开始自动推进'); byId('world-indicator').textContent = '●'; }

function tick() {
  if (!timer) return;
  engine.step(Math.max(1, Math.round(speed / 20)));
  render();
  if (speed === 20) { const tickId = timer; clearInterval(tickId); timer = setInterval(tick, 50); }
  else if (speed === 5) { const tickId = timer; clearInterval(tickId); timer = setInterval(tick, 200); }
}

function play() {
  if (timer) { pause(); return; }
  world.running = true;
  byId('play-glyph').textContent = 'Ⅱ';
  byId('play-label').textContent = '暂停模拟';
  byId('play-button').setAttribute('aria-label', '暂停模拟');
  byId('world-indicator').textContent = '◌';
  const interval = 1000 / speed;
  timer = setInterval(tick, interval);
}

function validSeed(input) {
  const numeric = Number.parseInt(String(input).trim(), 10);
  return Number.isFinite(numeric) ? clamp(numeric >>> 0, 1, 2_147_483_647) : 2026;
}

function replaceWorld(options, startYear = 2040) {
  pause();
  world = createWorld(options);
  engine = new SimulationEngine(world);
  selectedId = 0;
  engine.capture();
  if (startYear > world.year) engine.step(startYear - world.year);
  byId('map-selected').textContent = '当前视野：世界全貌';
  byId('map-hint').innerHTML = '<span class="hint-dot"></span> 点击城市，查看人口与发展详情';
  byId('status-message').textContent = startYear === 2040 ? '系统就绪 · 初始条件可复现' : `时间倒带完成 · 已重放 ${startYear - 2040} 个完整年度`;
  render();
}

function downloadSave() {
  const data = {
    version: '1.0.0', seed, scenario, year: world.year,
    world: { prices: world.prices, cities: world.cities, links: world.links, history: world.history, events: world.events },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `栖年-世界-${seed}-${world.year}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast(`已下载可复现的世界存档：${world.year} 年，种子 ${seed}`);
}

function openMapModal() {
  const modal = byId('map-modal');
  const clone = byId('world-map').cloneNode(true);
  clone.id = 'expanded-world-map';
  const container = byId('modal-map-container');
  container.replaceChildren(clone);
  clone.querySelectorAll('.map-city-group').forEach((group) => {
    group.addEventListener('click', () => { selectCity(safeId(group.dataset.city)); closeMapModal(); });
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { selectCity(safeId(group.dataset.city)); closeMapModal(); } });
  });
  modal.hidden = false;
  byId('modal-close').focus();
}

function closeMapModal() { byId('map-modal').hidden = true; byId('fullscreen-map').focus(); }

function handleEvent(type) {
  const city = world.cities[selectedId];
  engine.trigger(type, selectedId);
  if (type === 'scarcity') showToast(`${city.name} 战略储备下降 · 运输网络开始重新平衡资源。`);
  else if (type === 'migration') showToast(`${city.name} 设立安置区 · 人口分布依据城市吸引力更新。`);
  else if (type === 'disaster') showToast(`${city.name} 遭受风暴潮 · 收成与环境开始承受压力。`);
  else showToast(`${city.name} 清洁技术突破 · 产业效率和绿色能源同步提升。`);
  render();
}

function setScenario(value) {
  scenario = value;
  replaceWorld({ seed, scenario });
  showToast(`已创建「${{ balanced: '平衡演进', energy: '能源危机', migration: '迁徙潮', ecological: '生态治理', scarcity: '资源短缺', extreme: '极端环境' }[scenario]}」世界 · 种子 ${seed}`);
}

byId('scenario-select').addEventListener('change', (event) => setScenario(event.target.value));
byId('seed-input').addEventListener('change', (event) => { seed = validSeed(event.target.value); event.target.value = String(seed); });
byId('seed-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') byId('create-world-button').click(); });
byId('reroll-button').addEventListener('click', () => { seed = Math.floor(Math.random() * 2_147_483_646) + 1; byId('seed-input').value = String(seed); showToast(`世界种子更新为 ${seed} · 创建新世界以启用`); });
byId('create-world-button').addEventListener('click', () => { replaceWorld({ seed, scenario }); showToast(`新世界已生成 · ${world.cities.length} 座城市 · 种子 ${seed}`); });
byId('play-button').addEventListener('click', play);
byId('step-forward').addEventListener('click', () => { pause(); engine.step(1); render(); byId('status-message').textContent = `推演完成 · ${world.year} 年`; });
byId('step-back').addEventListener('click', () => { const targetYear = Math.max(2040, world.year - 10); replaceWorld({ seed, scenario }, targetYear); });
byId('speed-select').addEventListener('click', (event) => {
  const selected = event.target.closest('[data-speed]');
  if (!selected) return;
  speed = Number(selected.dataset.speed);
  document.querySelectorAll('.speed-button').forEach((button) => button.classList.toggle('active', button === selected));
  if (timer) { pause(); play(); }
});
byId('world-map').addEventListener('click', (event) => { if (event.target === byId('world-map')) selectCity(selectedId); });
document.querySelectorAll('.map-layer').forEach((button) => button.addEventListener('click', () => {
  layer = button.dataset.layer;
  document.querySelectorAll('.map-layer').forEach((item) => item.classList.toggle('active', item === button));
  renderMap();
}));
document.querySelectorAll('.chart-tab').forEach((button) => button.addEventListener('click', () => {
  series = button.dataset.series;
  document.querySelectorAll('.chart-tab').forEach((item) => item.classList.toggle('active', item === button));
  renderChart();
}));
document.querySelectorAll('.policy-button').forEach((button) => button.addEventListener('click', () => {
  engine.setPolicy(button.dataset.policy);
  render();
  const name = button.querySelector('strong').textContent;
  showToast(`协调方案「${name}」已落地 · 12 座城市根据承载能力逐步响应`);
}));
document.querySelectorAll('[data-event]').forEach((button) => button.addEventListener('click', () => handleEvent(button.dataset.event)));
byId('show-all-cities').addEventListener('click', () => { byId('map-hint').innerHTML = `<span class="hint-dot"></span> 十二座城市正在形成独特的产业与人口结构`; renderMap(); showToast('点击地图上任一城市，切换城市档案'); });
byId('export-button').addEventListener('click', downloadSave);
byId('fullscreen-map').addEventListener('click', openMapModal);
byId('modal-close').addEventListener('click', closeMapModal);
byId('map-modal').addEventListener('click', (event) => { if (event.target.id === 'map-modal') closeMapModal(); });
byId('map-reset').addEventListener('click', () => { layer = 'economy'; document.querySelectorAll('.map-layer').forEach((button) => button.classList.toggle('active', button.dataset.layer === layer)); selectedId = 0; byId('map-selected').textContent = '当前视野：世界全貌'; renderMap(); showToast('已重置世界地图视角'); });
document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-nav]').forEach((item) => item.classList.toggle('active', item === button));
  const section = button.dataset.nav;
  if (section === 'cities') { scrollTarget = 'city-detail'; byId('map-hint').innerHTML = '<span class="hint-dot"></span> 点击地图节点，即可浏览 12 城详细档案'; if (window.innerWidth <= 1020) document.querySelector('.detail-sidebar').scrollIntoView({ behavior: 'smooth', block: 'start' }); else byId('city-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (section === 'trade') { scrollTarget = 'world-map'; byId('map-hint').innerHTML = '<span class="hint-dot"></span> 每条航线的运力、距离与拥堵参与资源撮合'; byId('explorer-card'); document.querySelector('.explorer-card').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (section === 'history') byId('history').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !byId('map-modal').hidden) closeMapModal();
  if (event.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) { event.preventDefault(); play(); }
  if (event.key === 'ArrowRight' && event.altKey) { event.preventDefault(); pause(); engine.step(1); render(); }
});
window.addEventListener('pagehide', pause, { once: true });

const appState = Object.freeze({ get world() { return world; }, get engine() { return engine; }, selectCity, render, handleEvent, get ENGINE_COMPONENTS() { return ENGINE_COMPONENTS; } });
window.__LIVING_WORLD__ = appState;

initMap();
render();
