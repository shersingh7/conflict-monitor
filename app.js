/*
  Conflict Monitor Dashboard
  Reads ./data.json and renders situational awareness
*/

const $ = (id) => document.getElementById(id);

let charts = { casualties: null, missiles: null, cost: null, losses: null };
let map = null;
let mapLayerGroup = null;
let industryChart = null;
let isDarkMode = true;

const CITY_COORDS = {
  Tehran: [35.6892, 51.3890], Qom: [34.6399, 50.8759], Kermanshah: [34.3142, 47.0650],
  Isfahan: [32.6546, 51.6680], Karaj: [35.8400, 50.9391], Urmia: [37.5527, 45.0761],
  "Bandar Abbas": [27.1832, 56.2666], Bushehr: [28.9220, 50.8330], Tabriz: [38.0962, 46.2738],
  Shiraz: [29.5918, 52.5837], Sanandaj: [35.3140, 46.9988], Beirut: [33.8938, 35.5018],
  "Tel Aviv": [32.0853, 34.7818], "West Jerusalem": [31.7683, 35.2137], Jerusalem: [31.7683, 35.2137],
  Haifa: [32.7940, 34.9896], Doha: [25.2854, 51.5310], Manama: [26.2235, 50.5876],
  Dubai: [25.2048, 55.2708], "Abu Dhabi": [24.4539, 54.3773], Kuwait: [29.3759, 47.9774],
  Baghdad: [33.3152, 44.3661], Minab: [27.1467, 57.0817], "Beit Shemesh": [31.7463, 34.9888],
};

const COLORS = {
  killed: 'rgba(234, 67, 53, 0.8)', injured: 'rgba(138, 180, 248, 0.8)', missing: 'rgba(251, 188, 4, 0.8)',
  iran: 'rgba(197, 138, 249, 0.8)', coalition: 'rgba(129, 201, 149, 0.8)',
  grid: 'rgba(42, 49, 66, 0.5)', text: '#9aa0a6',
};

function formatIso(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function escapeHtml(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

async function loadData() {
  const res = await fetch('./data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
  return res.json();
}

function initIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }

function initTheme() {
  const toggle = $('themeToggle'), iconMoon = $('themeIconMoon'), iconSun = $('themeIconSun');
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    if (iconMoon) iconMoon.classList.add('hidden');
    if (iconSun) iconSun.classList.remove('hidden');
    isDarkMode = false;
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      isDarkMode = !isDarkMode;
      document.body.classList.toggle('light-mode', !isDarkMode);
      if (iconMoon) iconMoon.classList.toggle('hidden', !isDarkMode);
      if (iconSun) iconSun.classList.toggle('hidden', isDarkMode);
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    });
  }
}

function updateClock() {
  const el = $('currentTime');
  if (!el) return;
  const update = () => { el.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  update();
  setInterval(update, 1000);
}

function setHeader(data) {
  const lastEl = $('lastUpdated');
  if (lastEl) lastEl.textContent = data.lastUpdated ? formatIso(data.lastUpdated) : '—';

  const dq = data.dataQuality;
  const unverified = dq && (dq.verified === false || String(dq.confidence || '').toLowerCase() === 'low');
  if (unverified) {
    const badge = $('qualityBadge'), callout = $('qualityCallout'), notes = $('qualityNotes'), list = $('sourcesList');
    if (badge) badge.classList.remove('hidden');
    if (callout) callout.classList.remove('hidden');
    if (notes) notes.textContent = dq.notes || '—';
    if (list) {
      list.innerHTML = '';
      (data.sources || []).slice(0, 6).forEach(s => {
        const name = typeof s === 'string' ? s : (s.name || s.title || 'Source');
        const url = typeof s === 'object' && s?.url ? String(s.url) : '';
        const li = document.createElement('li');
        li.innerHTML = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>` : escapeHtml(name);
        list.appendChild(li);
      });
    }
  }
}

function renderHeroStats(data) {
  const container = $('heroStats');
  if (!container) return;
  container.innerHTML = '';

  const cas = data.casualties || {};
  const iranKilled = cas.iran?.totalKilled ?? (safeNum(cas.iran?.military?.killed) + safeNum(cas.iran?.civilian?.killed));
  const israelKilled = safeNum(cas.israel?.killed);
  const usKilled = safeNum(cas.us?.killed);
  const totalKilled = iranKilled + israelKilled + usKilled;

  const stats = [
    { label: 'Total Killed', value: totalKilled.toLocaleString(), color: '#f28b82' },
    { label: 'Iran Casualties', value: iranKilled.toLocaleString(), color: '#c58af9' },
    { label: 'Israel Casualties', value: israelKilled.toLocaleString(), color: '#8ab4f8' },
    { label: 'US Casualties', value: usKilled.toLocaleString(), color: '#81c995' },
  ];

  stats.forEach(stat => {
    const div = document.createElement('div');
    div.className = 'card p-3';
    div.innerHTML = `<div class="metric-value" style="color: ${stat.color};">${stat.value}</div><div class="metric-label">${stat.label}</div>`;
    container.appendChild(div);
  });
}

function renderCasualtyCards(data) {
  const root = $('casualtyCards');
  if (!root) return;
  root.innerHTML = '';
  const cas = data.casualties || {};

  const addCard = (title, items) => {
    const div = document.createElement('div');
    div.className = 'p-2 rounded';
    div.style.background = 'var(--bg-secondary)';
    div.innerHTML = `
      <div class="text-xs font-medium mb-1" style="color: var(--text-muted);">${title}</div>
      ${items.map(i => `<div class="flex justify-between text-xs py-0.5"><span style="color: var(--text-secondary);">${i.label}</span><span class="font-mono">${i.value || '—'}</span></div>`).join('')}
    `;
    return div;
  };

  root.appendChild(addCard('Iran', [
    { label: 'Killed', value: cas.iran?.totalKilled ?? (safeNum(cas.iran?.military?.killed) + safeNum(cas.iran?.civilian?.killed)) },
    { label: 'Civilian', value: cas.iran?.civilian?.killed },
    { label: 'Military', value: cas.iran?.military?.killed },
  ]));
  root.appendChild(addCard('Israel', [
    { label: 'Killed', value: cas.israel?.killed },
    { label: 'Injured', value: cas.israel?.injured },
    { label: 'Missing', value: cas.israel?.details?.beitShemesh?.missing },
  ]));
  root.appendChild(addCard('United States', [
    { label: 'Killed', value: cas.us?.killed },
    { label: 'Injured', value: cas.us?.injured },
  ]));
  root.appendChild(addCard('Gulf Region', [
    { label: 'Kuwait K', value: cas.gulf?.kuwait?.killed },
    { label: 'UAE K', value: cas.gulf?.uae?.killed },
    { label: 'Oman I', value: cas.gulf?.oman?.injured },
  ]));
}

function upsertCharts(data, focus = 'all') {
  const cas = data.casualties || {};
  const series = {
    iran: { killed: safeNum(cas.iran?.totalKilled ?? safeNum(cas.iran?.military?.killed) + safeNum(cas.iran?.civilian?.killed)), injured: 0, missing: 0 },
    israel: { killed: safeNum(cas.israel?.killed), injured: safeNum(cas.israel?.injured), missing: safeNum(cas.israel?.details?.beitShemesh?.missing) },
    us: { killed: safeNum(cas.us?.killed), injured: safeNum(cas.us?.injured), missing: 0 },
    lebanon: { killed: safeNum(cas.lebanon?.pmf?.killed), injured: safeNum(cas.lebanon?.pmf?.injured), missing: 0 },
    gulf: { killed: safeNum(cas.gulf?.kuwait?.killed) + safeNum(cas.gulf?.uae?.killed), injured: safeNum(cas.gulf?.kuwait?.injured) + safeNum(cas.gulf?.uae?.injured) + safeNum(cas.gulf?.oman?.injured), missing: 0 },
  };

  const focusKeys = focus === 'all' ? Object.keys(series) : [focus];
  const labels = focusKeys.map(k => k.toUpperCase());

  const ctx1 = $('casualtiesChart')?.getContext('2d');
  if (!ctx1) return;
  if (charts.casualties) charts.casualties.destroy();
  charts.casualties = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Killed', data: focusKeys.map(k => series[k].killed), backgroundColor: COLORS.killed },
        { label: 'Injured', data: focusKeys.map(k => series[k].injured), backgroundColor: COLORS.injured },
        { label: 'Missing', data: focusKeys.map(k => series[k].missing), backgroundColor: COLORS.missing },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: COLORS.text, boxWidth: 10, font: { size: 10 } } } },
      scales: { x: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } }, y: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } } }
    }
  });

  const m = data.missiles || {};
  const ctx2 = $('missilesChart')?.getContext('2d');
  if (!ctx2) return;
  if (charts.missiles) charts.missiles.destroy();
  const cm = safeNum(m.coalition?.estimated), im = safeNum(m.iran?.estimated);
  const hasMissiles = cm + im > 0;
  charts.missiles = new Chart(ctx2, {
    type: hasMissiles ? 'doughnut' : 'bar',
    data: hasMissiles ? { labels: ['Coalition', 'Iran'], datasets: [{ data: [cm, im], backgroundColor: [COLORS.coalition, COLORS.iran] }] } : { labels: ['No data'], datasets: [{ data: [0], backgroundColor: 'rgba(90,95,100,0.5)' }] },
    options: { responsive: true, plugins: { legend: { labels: { color: COLORS.text, font: { size: 10 } } } } }
  });
}

function renderTimeline(data, query) {
  const needle = (query || '').trim().toLowerCase();
  const items = Array.isArray(data.timeline) ? data.timeline : [];
  const root = $('timeline');
  if (!root) return;
  root.innerHTML = '';

  const filtered = items.map(d => ({ date: d.date, events: (d.events || []).map(e => typeof e === 'string' ? { text: e } : e) }))
    .filter(row => !needle || [row.date, ...row.events.map(e => e.text)].join(' ').toLowerCase().includes(needle));

  if (!filtered.length) { root.innerHTML = '<div class="text-xs" style="color: var(--text-muted);">No events match your filter.</div>'; return; }

  filtered.forEach(row => {
    const div = document.createElement('div');
    div.className = 'timeline-item';
    const categoryTag = (text) => {
      const t = text.toLowerCase();
      if (t.includes('strike') || t.includes('hit') || t.includes('attack')) return 'badge-strike';
      if (t.includes('missile') || t.includes('rocket')) return 'badge-missile';
      if (t.includes('casualt') || t.includes('killed') || t.includes('injured')) return 'badge-casualty';
      if (t.includes('negotiat') || t.includes('statement')) return 'badge-political';
      return 'badge-other';
    };
    const events = row.events.slice(0, 10).map(e => {
      const tag = categoryTag(e.text);
      return `<li class="text-xs mb-1.5"><span class="badge ${tag} mr-1">${tag.split('-')[1]}</span>${escapeHtml(e.text)}</li>`;
    }).join('');
    div.innerHTML = `<div class="timeline-dot"></div><div class="font-mono text-xs mb-1" style="color: var(--accent-blue);">${escapeHtml(row.date)}</div><ul class="list-none ml-0">${events}</ul>`;
    root.appendChild(div);
  });
}

function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([31.5, 45.0], 4);
  mapLayerGroup = L.layerGroup().addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 10, attribution: '© OpenStreetMap © CARTO' }).addTo(map);
}

function renderMapMarkers(data) {
  initMap();
  mapLayerGroup.clearLayers();
  const cities = new Set();
  (data?.strikes?.iran?.cities || []).forEach(c => cities.add(String(c)));
  (data?.strikes?.israel?.targets || []).forEach(c => cities.add(String(c)));
  if (data?.strikes?.gulf) Object.keys(data.strikes.gulf).forEach(c => cities.add(String(c)));
  const markers = [];
  cities.forEach(city => {
    const coords = CITY_COORDS[city];
    if (!coords) return;
    const icon = L.divIcon({ className: '', html: '<div class="map-marker"></div>', iconSize: [10, 10], iconAnchor: [5, 5] });
    const marker = L.marker(coords, { icon }).bindPopup(`<div style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(city)}</div>`);
    marker.addTo(mapLayerGroup);
    markers.push(coords);
  });
  if (markers.length) map.fitBounds(L.latLngBounds(markers).pad(0.3));
}

function renderShipsAndChokepoints(data) {
  const shipsEl = $('shipsTotal'), chokeEl = $('chokepoints');
  if (shipsEl) shipsEl.textContent = String((data?.ships?.attacks || []).length || 0);
  const geo = data?.geopolitical || {};
  const lines = [geo.straitOfHormuz ? `Strait of Hormuz: ${geo.straitOfHormuz}` : null, geo.babElMandeb ? `Bab-el-Mandeb: ${geo.babElMandeb}` : null].filter(Boolean);
  if (chokeEl) chokeEl.textContent = lines.length ? lines.join(' • ') : 'No major incidents reported';
}

function formatMoney(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: n >= 1e9 ? 1 : 0 }).format(n); }
  catch { return (currency === 'CAD' ? 'C$' : '$') + Math.round(n).toLocaleString(); }
}

function renderCosts(data) {
  const costs = data?.costs || {};
  const currency = $('costCurrency')?.value || 'USD';
  const fx = currency === 'CAD' ? Number(costs?.fx?.USD_CAD || 1.35) : 1;
  const actors = costs.actors && typeof costs.actors === 'object' ? costs.actors : {};
  const actorNames = Object.keys(actors);
  const categories = [...new Set(actorNames.flatMap(a => Object.keys(actors[a] || {})))];
  const colorPalette = ['rgba(138,180,248,0.8)', 'rgba(197,138,249,0.8)', 'rgba(129,201,149,0.8)', 'rgba(242,139,130,0.8)', 'rgba(253,214,99,0.8)'];
  const datasets = categories.map((cat, i) => ({ label: cat.replace(/_/g, ' '), data: actorNames.map(a => safeNum(actors[a]?.[cat]) * fx), backgroundColor: colorPalette[i % colorPalette.length] }));
  const total = datasets.reduce((s, ds) => s + ds.data.reduce((a, v) => a + safeNum(v), 0), 0);

  const totalEl = $('costTotal');
  if (totalEl) totalEl.textContent = total > 0 ? formatMoney(total, currency) : 'No data';

  const ctx = $('costChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.cost) charts.cost.destroy();
  charts.cost = new Chart(ctx, {
    type: 'bar',
    data: { labels: actorNames.length ? actorNames : ['No data'], datasets: datasets.length ? datasets : [{ data: [0], backgroundColor: 'rgba(90,95,100,0.5)' }] },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: COLORS.text, boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw, currency)}` } } },
      scales: { x: { stacked: true, ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } }, y: { stacked: true, ticks: { color: COLORS.text, font: { size: 10 }, callback: v => v >= 1e9 ? `${Math.round(v/1e9)}B` : v >= 1e6 ? `${Math.round(v/1e6)}M` : v }, grid: { color: COLORS.grid } } }
    }
  });

  const confEl = $('costConfidence');
  if (confEl) confEl.textContent = `${costs.confidence || 'unknown'} confidence • ${costs.currency || 'USD'}`;
}

function renderLosses(data) {
  const losses = data?.losses || {};
  const aircraft = losses.aircraft || [];
  const ships = losses.ships || data?.ships?.attacks || [];
  const launchers = losses.launchers || [];
  const infra = losses.infrastructure || [];

  const ctx = $('lossesChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.losses) charts.losses.destroy();
  charts.losses = new Chart(ctx, {
    type: 'bar',
    data: { labels: ['Aircraft', 'Ships', 'Launchers', 'Infrastructure'], datasets: [{ data: [aircraft.length, ships.length, launchers.length, infra.length], backgroundColor: ['rgba(242,139,130,0.8)', 'rgba(138,180,248,0.8)', 'rgba(253,214,99,0.8)', 'rgba(154,160,166,0.8)'] }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } }, y: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } } } }
  });

  const airTbody = $('aircraftLossTable');
  if (airTbody) {
    airTbody.innerHTML = '';
    aircraft.slice(0, 5).forEach(r => { airTbody.innerHTML += `<tr><td>${r.date || '—'}</td><td>${r.actor || '—'}</td><td>${r.platform || r.type || '—'}</td><td>${r.status || '—'}</td></tr>`; });
    if (!aircraft.length) airTbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);">No data</td></tr>';
  }

  const shipTbody = $('shipLossTable');
  if (shipTbody) {
    shipTbody.innerHTML = '';
    ships.slice(0, 5).forEach(r => { shipTbody.innerHTML += `<tr><td>${r.date || '—'}</td><td>${r.name || '—'}</td><td>${r.type || '—'}</td><td>${r.status || '—'}</td></tr>`; });
    if (!ships.length) shipTbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);">No data</td></tr>';
  }
}

function renderIndustry(data) {
  const usage = data?.defenseIndustry?.usage || [];
  const metric = $('industryMetric')?.value || 'count';
  const byCompany = new Map();
  usage.forEach(r => {
    const c = r.company || 'Unknown';
    const prev = byCompany.get(c) || { count: 0, spend: 0 };
    prev.count += safeNum(r.count);
    prev.spend += safeNum(r.spendUsd);
    byCompany.set(c, prev);
  });
  const sorted = [...byCompany.entries()].map(([company, v]) => ({ company, ...v })).sort((a, b) => b[metric] - a[metric]).slice(0, 6);

  const ctx = $('industryChart')?.getContext('2d');
  if (!ctx) return;
  if (industryChart) industryChart.destroy();
  industryChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted.map(x => x.company), datasets: [{ label: metric === 'spend' ? 'Spend' : 'Count', data: sorted.map(x => metric === 'spend' ? x.spend : x.count), backgroundColor: 'rgba(197,138,249,0.8)' }] },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { labels: { color: COLORS.text, font: { size: 10 } } } }, scales: { x: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } }, y: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid } } } }
  });

  const tbody = $('industryTable');
  if (tbody) {
    tbody.innerHTML = '';
    usage.sort((a, b) => b.count - a.count).slice(0, 8).forEach(r => { tbody.innerHTML += `<tr><td>${r.system || r.product || '—'}</td><td>${r.company || '—'}</td><td class="text-right font-mono">${r.count?.toLocaleString() || '—'}</td></tr>`; });
    if (!usage.length) tbody.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted);">No data</td></tr>';
  }
}

async function boot() {
  initIcons();
  initTheme();
  updateClock();

  const data = await loadData();
  setHeader(data);
  renderHeroStats(data);
  renderCasualtyCards(data);
  upsertCharts(data, $('focusSide')?.value || 'all');
  renderTimeline(data, '');
  renderMapMarkers(data);
  renderShipsAndChokepoints(data);
  renderCosts(data);
  renderLosses(data);
  renderIndustry(data);

  $('focusSide')?.addEventListener('change', async () => upsertCharts(await loadData(), $('focusSide').value));
  $('costCurrency')?.addEventListener('change', async () => renderCosts(await loadData()));
  $('industryMetric')?.addEventListener('change', async () => renderIndustry(await loadData()));
  $('timelineQuery')?.addEventListener('input', async e => renderTimeline(await loadData(), e.target.value));
}

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:24px;font-family:var(--font-sans);color:var(--text-primary);"><h1 style="font-size:18px;margin-bottom:8px;">Failed to load</h1><pre style="white-space:pre-wrap;background:var(--bg-card);padding:12px;border-radius:6px;font-family:var(--font-mono);font-size:11px;">${escapeHtml(err.stack || err)}</pre><p style="opacity:0.7;margin-top:12px;font-size:12px;">Ensure you're serving this over HTTP (not file://).</p></div>`;
});