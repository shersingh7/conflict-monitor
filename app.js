/*
  War Dashboard — single-file client script
  Reads ./data.json and renders:
  - headline cards
  - 2 charts (casualties + missiles)
  - timeline with filter
  - leaflet map with approximate city markers
*/

const $ = (id) => document.getElementById(id);

let charts = { casualties: null, missiles: null, cost: null, losses: null };
let map = null;
let mapLayerGroup = null;
let industryChart = null;

const CITY_COORDS = {
  Tehran: [35.6892, 51.3890],
  Qom: [34.6399, 50.8759],
  Kermanshah: [34.3142, 47.0650],
  Isfahan: [32.6546, 51.6680],
  Karaj: [35.8400, 50.9391],
  Urmia: [37.5527, 45.0761],
  "Bandar Abbas": [27.1832, 56.2666],
  Bushehr: [28.9220, 50.8330],
  Tabriz: [38.0962, 46.2738],
  Shiraz: [29.5918, 52.5837],
  Sanandaj: [35.3140, 46.9988],
  Beirut: [33.8938, 35.5018],
  "Tel Aviv": [32.0853, 34.7818],
  "West Jerusalem": [31.7683, 35.2137],
  Jerusalem: [31.7683, 35.2137],
  Haifa: [32.7940, 34.9896],
  Doha: [25.2854, 51.5310],
  Manama: [26.2235, 50.5876],
  Dubai: [25.2048, 55.2708],
  "Abu Dhabi": [24.4539, 54.3773],
  Kuwait: [29.3759, 47.9774],
  Baghdad: [33.3152, 44.3661],
  Minab: [27.1467, 57.0817],
  "Beit Shemesh": [31.7463, 34.9888],
};

function formatIso(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadData() {
  const res = await fetch('./data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
  return await res.json();
}

function setHeader(data) {
  $('lastUpdated').textContent = data.lastUpdated ? formatIso(data.lastUpdated) : '—';
  const c = data.conflict || {};
  const dayCount = c.dayCount != null ? `Day ${c.dayCount}` : '';
  const start = c.startDate ? `since ${c.startDate}` : '';
  const status = c.status ? `· ${c.status}` : '';
  $('conflictMeta').textContent = [c.name, dayCount, start].filter(Boolean).join(' ') + ` ${status}`;

  // Data quality banner
  const dq = data.dataQuality || null;
  const unverified = dq && (dq.verified === false || String(dq.confidence || '').toLowerCase() === 'low');
  const dot = $('qualityDot');
  const badge = $('qualityBadge');
  const callout = $('qualityCallout');
  if (unverified) {
    dot.classList.remove('bg-emerald-400');
    dot.classList.add('bg-amber-400');
    badge.classList.remove('hidden');
    callout.classList.remove('hidden');
    $('qualityNotes').textContent = dq.notes || '—';
  } else {
    dot.classList.remove('bg-amber-400');
    dot.classList.add('bg-emerald-400');
    badge.classList.add('hidden');
    callout.classList.add('hidden');
  }

  // Render sources list (if present)
  const list = $('sourcesList');
  if (list) {
    list.innerHTML = '';
    const sources = Array.isArray(data.sources) ? data.sources : [];
    for (const s of sources.slice(0, 12)) {
      const name = typeof s === 'string' ? s : (s.name || s.title || 'Source');
      const url = typeof s === 'object' && s && s.url ? String(s.url) : '';
      const li = document.createElement('li');
      li.innerHTML = url
        ? `<a class="underline decoration-slate-500 hover:decoration-slate-200" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`
        : escapeHtml(name);
      list.appendChild(li);
    }
  }
}

function renderCasualtyCards(data) {
  const root = $('casualtyCards');
  root.innerHTML = '';
  const cas = data.casualties || {};

  const card = (title, lines) => {
    const div = document.createElement('div');
    div.className = 'glass rounded-xl p-3';
    div.innerHTML = `
      <div class="text-xs text-slate-400">${title}</div>
      <div class="mt-2 space-y-1">
        ${lines.map(l => `<div class="flex items-baseline justify-between gap-3"><div class="text-slate-300 text-xs">${l.label}</div><div class="mono text-slate-100 text-sm">${l.value}</div></div>`).join('')}
      </div>
    `;
    return div;
  };

  const iranTotalKilled = cas.iran?.totalKilled ?? (safeNum(cas.iran?.military?.killed) + safeNum(cas.iran?.civilian?.killed));
  const israelKilled = safeNum(cas.israel?.killed);
  const israelInj = safeNum(cas.israel?.injured);
  const beitMissing = safeNum(cas.israel?.details?.beitShemesh?.missing);

  root.appendChild(card('Iran', [
    { label: 'Killed (total)', value: iranTotalKilled || '—' },
    { label: 'Civilian killed', value: cas.iran?.civilian?.killed ?? '—' },
    { label: 'Military killed', value: cas.iran?.military?.killed ?? '—' },
  ]));

  root.appendChild(card('Israel', [
    { label: 'Killed', value: israelKilled || '—' },
    { label: 'Injured', value: israelInj || '—' },
    { label: 'Missing', value: beitMissing || '—' },
  ]));

  root.appendChild(card('United States', [
    { label: 'Killed', value: cas.us?.killed ?? '—' },
    { label: 'Injured', value: cas.us?.injured ?? '—' },
    { label: 'Notes', value: '—' },
  ]));

  const gulf = cas.gulf || {};
  root.appendChild(card('Gulf region (partial)', [
    { label: 'Kuwait killed', value: gulf.kuwait?.killed ?? '—' },
    { label: 'Kuwait injured', value: gulf.kuwait?.injured ?? '—' },
    { label: 'UAE killed', value: gulf.uae?.killed ?? '—' },
  ]));
}

function upsertCharts(data, focus = 'all') {
  const cas = data.casualties || {};

  const series = {
    iran: {
      killed: safeNum(cas.iran?.totalKilled ?? (safeNum(cas.iran?.military?.killed) + safeNum(cas.iran?.civilian?.killed))),
      injured: 0,
      missing: 0,
    },
    israel: {
      killed: safeNum(cas.israel?.killed),
      injured: safeNum(cas.israel?.injured),
      missing: safeNum(cas.israel?.details?.beitShemesh?.missing),
    },
    us: {
      killed: safeNum(cas.us?.killed),
      injured: safeNum(cas.us?.injured),
      missing: 0,
    },
    lebanon: {
      killed: safeNum(cas.lebanon?.pmf?.killed),
      injured: safeNum(cas.lebanon?.pmf?.injured),
      missing: 0,
    },
    gulf: {
      killed: safeNum(cas.gulf?.kuwait?.killed) + safeNum(cas.gulf?.uae?.killed),
      injured: safeNum(cas.gulf?.kuwait?.injured) + safeNum(cas.gulf?.uae?.injured) + safeNum(cas.gulf?.oman?.injured),
      missing: 0,
    },
  };

  const focusKeys = focus === 'all' ? Object.keys(series) : [focus];
  const labels = focusKeys.map(k => k.toUpperCase());
  const killed = focusKeys.map(k => series[k].killed);
  const injured = focusKeys.map(k => series[k].injured);
  const missing = focusKeys.map(k => series[k].missing);

  const ctx1 = $('casualtiesChart').getContext('2d');
  if (charts.casualties) charts.casualties.destroy();
  charts.casualties = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Killed', data: killed, backgroundColor: 'rgba(239, 68, 68, .75)' },
        { label: 'Injured', data: injured, backgroundColor: 'rgba(59, 130, 246, .75)' },
        { label: 'Missing', data: missing, backgroundColor: 'rgba(234, 179, 8, .75)' },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#cbd5e1' } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
      },
    }
  });

  // Missiles chart (only if we actually have sourced counts)
  const m = data.missiles || {};
  const cm = safeNum(m.coalition?.estimated);
  const im = safeNum(m.iran?.estimated);
  const ctx2 = $('missilesChart').getContext('2d');
  if (charts.missiles) charts.missiles.destroy();
  const hasMissiles = (cm + im) > 0;

  charts.missiles = new Chart(ctx2, {
    type: hasMissiles ? 'doughnut' : 'bar',
    data: hasMissiles
      ? {
          labels: ['Coalition (reported)', 'Iran (reported)'],
          datasets: [
            {
              data: [cm, im],
              backgroundColor: ['rgba(168,85,247,.8)', 'rgba(34,197,94,.75)'],
              borderColor: 'rgba(2,6,23,.8)',
              borderWidth: 2,
            }
          ]
        }
      : {
          labels: ['No data'],
          datasets: [{ label: 'No missile counts yet', data: [0], backgroundColor: 'rgba(148,163,184,.35)' }]
        },
    options: {
      plugins: {
        legend: { labels: { color: '#cbd5e1' } },
      }
    }
  });
}

function renderTimeline(data, query) {
  const needle = (query || '').trim().toLowerCase();
  const items = Array.isArray(data.timeline) ? data.timeline : [];
  const root = $('timeline');
  root.innerHTML = '';

  const normEvent = (ev) => {
    if (typeof ev === 'string') return { text: ev, confidence: null, sources: [] };
    if (ev && typeof ev === 'object') {
      return {
        text: String(ev.text || ev.event || ''),
        confidence: ev.confidence ? String(ev.confidence) : null,
        sources: Array.isArray(ev.sources) ? ev.sources : [],
      };
    }
    return { text: String(ev), confidence: null, sources: [] };
  };

  const filtered = items
    .map(d => ({ date: d.date, events: (d.events || []).map(normEvent) }))
    .filter(row => {
      if (!needle) return true;
      const hay = [row.date, ...row.events.map(e => e.text)].join(' ').toLowerCase();
      return hay.includes(needle);
    });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-slate-400';
    empty.textContent = 'No timeline events match your filter.';
    root.appendChild(empty);
    return;
  }

  for (const row of filtered) {
    const box = document.createElement('div');
    box.className = 'glass rounded-xl p-3';

    const bullets = row.events
      .filter(ev => !needle || ev.text.toLowerCase().includes(needle) || row.date.toLowerCase().includes(needle))
      .slice(0, 30)
      .map(ev => {
        const conf = ev.confidence ? `<span class="ml-2 mono text-[11px] text-slate-400">[${escapeHtml(ev.confidence)}]</span>` : '';
        const src = (ev.sources || []).length
          ? `<div class="mt-1 text-[11px] text-slate-400">${(ev.sources || []).slice(0,2).map(s => {
              const name = typeof s === 'string' ? s : (s.name || s.title || 'source');
              const url = typeof s === 'object' && s && s.url ? String(s.url) : '';
              return url ? `<a class=\"underline decoration-slate-600 hover:decoration-slate-200\" href=\"${escapeHtml(url)}\" target=\"_blank\" rel=\"noreferrer\">${escapeHtml(name)}</a>` : escapeHtml(name);
            }).join(' · ')}
          </div>`
          : '';
        return `<li class="text-sm text-slate-200">${escapeHtml(ev.text)}${conf}${src}</li>`;
      })
      .join('');

    box.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="mono text-sm text-slate-100">${escapeHtml(row.date || '')}</div>
        <div class="text-xs text-slate-400">${row.events.length} events</div>
      </div>
      <ul class="mt-2 space-y-1 list-disc list-inside">${bullets}</ul>
    `;

    root.appendChild(box);
  }
}

function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([31.5, 45.0], 4);
  mapLayerGroup = L.layerGroup().addTo(map);

  // Online tiles. If offline, map will still show markers on blank background.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 8,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
}

function renderMapMarkers(data) {
  initMap();
  mapLayerGroup.clearLayers();

  const cities = new Set();
  const strikeCities = data?.strikes?.iran?.cities || [];
  strikeCities.forEach(c => cities.add(String(c)));

  // Add some other locations mentioned in the dataset
  const extra = [
    ...(data?.strikes?.israel?.targets || []),
    ...(data?.strikes?.gulf ? Object.keys(data.strikes.gulf) : []),
  ];
  extra.forEach(c => cities.add(String(c)));

  const markers = [];
  for (const city of cities) {
    const coords = CITY_COORDS[city];
    if (!coords) continue;
    const m = L.marker(coords).bindPopup(`<div class="mono">${escapeHtml(city)}</div>`);
    m.addTo(mapLayerGroup);
    markers.push(coords);
  }

  if (markers.length > 0) {
    const bounds = L.latLngBounds(markers);
    map.fitBounds(bounds.pad(0.35));
  }
}

function renderShipsAndChokepoints(data) {
  const ships = data?.ships?.attacks || [];
  $('shipsTotal').textContent = String(ships.length || 0);

  const geo = data?.geopolitical || {};
  const lines = [
    geo.straitOfHormuz ? `Hormuz: ${geo.straitOfHormuz}` : null,
    geo.babElMandeb ? `Bab-el-Mandeb: ${geo.babElMandeb}` : null,
  ].filter(Boolean);
  $('chokepoints').textContent = lines.length ? lines.join(' · ') : '—';
}

function resolveFxTo(currency, data) {
  const fx = data?.costs?.fx || {};
  // Default rough FX if none provided
  const usdCad = Number(fx.USD_CAD || 1.35);
  if (currency === 'CAD') return usdCad;
  return 1;
}

function formatMoney(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: n >= 1e9 ? 0 : 0,
    }).format(n);
  } catch {
    const prefix = currency === 'CAD' ? 'C$' : '$';
    return prefix + Math.round(n).toLocaleString();
  }
}

function renderCosts(data) {
  const costs = data?.costs || {};
  const currency = $('costCurrency')?.value || 'USD';
  const fx = resolveFxTo(currency, data);

  const actors = costs.actors && typeof costs.actors === 'object' ? costs.actors : {};
  const actorNames = Object.keys(actors);

  // Categories union
  const categories = new Set();
  for (const name of actorNames) {
    const rec = actors[name] || {};
    for (const k of Object.keys(rec)) categories.add(k);
  }

  const orderedCategories = Array.from(categories);

  // Build stacked datasets (one dataset per category)
  const datasets = orderedCategories.map((cat, idx) => {
    const colorPalette = [
      'rgba(59,130,246,.75)',
      'rgba(168,85,247,.75)',
      'rgba(34,197,94,.75)',
      'rgba(239,68,68,.75)',
      'rgba(234,179,8,.75)',
      'rgba(14,165,233,.75)',
      'rgba(236,72,153,.75)',
      'rgba(148,163,184,.65)',
    ];
    const color = colorPalette[idx % colorPalette.length];
    return {
      label: cat.replaceAll('_', ' '),
      data: actorNames.map((a) => safeNum(actors[a]?.[cat]) * fx),
      backgroundColor: color,
    };
  });

  const total = datasets.reduce((sum, ds) => sum + ds.data.reduce((s, v) => s + safeNum(v), 0), 0);
  $('costTotal').textContent = total > 0 ? formatMoney(total, currency) : 'No cost data yet';

  const conf = costs.confidence || costs.quality || 'unknown';
  $('costConfidence').textContent = `Confidence: ${String(conf)} · Base currency: ${costs.currency || 'USD'}${currency !== (costs.currency || 'USD') ? ` · FX applied` : ''}`;

  const ul = $('costAssumptions');
  if (ul) {
    ul.innerHTML = '';
    const assumptions = Array.isArray(costs.assumptions) ? costs.assumptions : [];
    const fallback = [
      'Exact bullet/small-arms ammo expenditure is almost never public; we only estimate when explicitly reported.',
      'Unit costs vary by contract year, configuration, and accounting method (procurement vs fully-burdened).',
      'Counts based on OSINT/news reports may double-count or omit events; treat totals as ranges.',
    ];
    for (const a of (assumptions.length ? assumptions : fallback).slice(0, 10)) {
      const li = document.createElement('li');
      li.textContent = String(a);
      ul.appendChild(li);
    }
  }

  const ctx = $('costChart')?.getContext?.('2d');
  if (!ctx) return;
  if (charts.cost) charts.cost.destroy();

  const hasData = actorNames.length > 0 && orderedCategories.length > 0 && total > 0;
  if (!hasData) {
    charts.cost = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['No data'],
        datasets: [{ label: 'No cost data yet', data: [0], backgroundColor: 'rgba(148,163,184,.35)' }],
      },
      options: {
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        },
      }
    });
    return;
  }

  charts.cost = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: actorNames.length ? actorNames : ['(no cost data yet)'],
      datasets: hasData ? datasets : [{ label: 'No data', data: [0], backgroundColor: 'rgba(148,163,184,.35)' }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#cbd5e1' } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatMoney(ctx.raw, currency)}`
          }
        },
      },
      scales: {
        x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        y: {
          stacked: true,
          ticks: {
            color: '#94a3b8',
            callback: (v) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return v;
              if (n >= 1e9) return `${Math.round(n/1e9)}B`;
              if (n >= 1e6) return `${Math.round(n/1e6)}M`;
              return n;
            }
          },
          grid: { color: 'rgba(148,163,184,.12)' }
        },
      },
    }
  });
}

function normalizeLossRows(data) {
  const losses = data?.losses || {};
  const aircraft = Array.isArray(losses.aircraft) ? losses.aircraft : [];
  const shipsFromLosses = Array.isArray(losses.ships) ? losses.ships : [];
  // Fall back to ships.attacks list
  const attacks = Array.isArray(data?.ships?.attacks) ? data.ships.attacks : [];
  const ships = shipsFromLosses.length
    ? shipsFromLosses
    : attacks.map((s) => ({
        date: s.date,
        name: s.name,
        type: s.type,
        status: s.status || 'damaged/unknown',
        confidence: 'low',
      }));
  return { aircraft, ships };
}

function renderIndustry(data) {
  const di = data?.defenseIndustry || {};
  const usage = Array.isArray(di.usage) ? di.usage : [];
  const metric = $('industryMetric')?.value || 'count';

  // Aggregate by company
  const byCompany = new Map();
  for (const row of usage) {
    const company = String(row.company || 'Unknown');
    const count = safeNum(row.count);
    const spend = safeNum(row.spendUsd);
    const prev = byCompany.get(company) || { count: 0, spend: 0 };
    prev.count += count;
    prev.spend += spend;
    byCompany.set(company, prev);
  }

  const sorted = [...byCompany.entries()]
    .map(([company, v]) => ({ company, ...v }))
    .sort((a, b) => (metric === 'spend' ? b.spend - a.spend : b.count - a.count))
    .slice(0, 12);

  const labels = sorted.map((x) => x.company);
  const values = sorted.map((x) => (metric === 'spend' ? x.spend : x.count));

  const ctx = $('industryChart')?.getContext?.('2d');
  if (ctx) {
    if (industryChart) industryChart.destroy();
    const has = values.some((v) => v > 0);
    industryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: has ? labels : ['No data'],
        datasets: [
          {
            label: metric === 'spend' ? 'Spend (USD, est.)' : 'Count (reported)',
            data: has ? values : [0],
            backgroundColor: 'rgba(34,197,94,.75)',
          }
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#cbd5e1' } },
          tooltip: {
            callbacks: {
              label: (c) => metric === 'spend' ? formatMoney(c.raw, 'USD') : String(c.raw),
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        }
      }
    });
  }

  // Table of top systems
  const tbody = $('industryTable');
  if (tbody) {
    tbody.innerHTML = '';
    const top = [...usage]
      .map((r) => ({
        system: r.system || r.product || '—',
        company: r.company || '—',
        count: safeNum(r.count),
        confidence: r.confidence || '—',
        sources: Array.isArray(r.sources) ? r.sources : [],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    if (top.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="py-2 text-slate-400" colspan="4">No supplier usage rows yet.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const r of top) {
      const tr = document.createElement('tr');
      const src = r.sources.length
        ? r.sources.slice(0, 1).map((s) => {
            const name = typeof s === 'string' ? s : (s.name || s.title || 'source');
            const url = typeof s === 'object' && s && s.url ? String(s.url) : '';
            return url
              ? `<a class=\"underline decoration-slate-600 hover:decoration-slate-200\" href=\"${escapeHtml(url)}\" target=\"_blank\" rel=\"noreferrer\">${escapeHtml(name)}</a>`
              : escapeHtml(name);
          }).join('')
        : '';
      tr.innerHTML = `
        <td class="pr-3 py-1">${escapeHtml(r.system)}${src ? `<div class=\"text-[11px] text-slate-400 mt-1\">${src}</div>` : ''}</td>
        <td class="pr-3 py-1">${escapeHtml(r.company)}</td>
        <td class="pr-3 py-1 mono text-slate-300">${r.count ? r.count.toLocaleString() : '—'}</td>
        <td class="pr-3 py-1 mono text-slate-300">${escapeHtml(r.confidence)}</td>
      `;
      tbody.appendChild(tr);
    }
  }
}

function renderLosses(data) {
  const { aircraft, ships } = normalizeLossRows(data);

  // Chart: total counts
  const losses = data?.losses || {};
  const launchers = Array.isArray(losses.launchers) ? losses.launchers : [];
  const infra = Array.isArray(losses.infrastructure) ? losses.infrastructure : [];

  const counts = {
    aircraft: aircraft.length,
    ships: ships.length,
    launchers: launchers.length,
    infrastructure: infra.length,
  };

  const ctx = $('lossesChart')?.getContext?.('2d');
  if (ctx) {
    if (charts.losses) charts.losses.destroy();
    charts.losses = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Aircraft', 'Ships', 'Launchers', 'Infrastructure'],
        datasets: [
          {
            label: 'Count (reported)',
            data: [counts.aircraft, counts.ships, counts.launchers, counts.infrastructure],
            backgroundColor: [
              'rgba(239,68,68,.75)',
              'rgba(59,130,246,.75)',
              'rgba(234,179,8,.75)',
              'rgba(148,163,184,.65)'
            ],
          }
        ]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        }
      }
    });
  }

  // Tables
  const airTbody = $('aircraftLossTable');
  if (airTbody) {
    airTbody.innerHTML = '';
    const rows = [...aircraft].sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).slice(0, 50);
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="pr-3 py-1 mono text-slate-300">${escapeHtml(r.date || '—')}</td>
        <td class="pr-3 py-1">${escapeHtml(r.actor || '—')}</td>
        <td class="pr-3 py-1">${escapeHtml(r.platform || r.type || '—')}</td>
        <td class="pr-3 py-1">${escapeHtml(r.status || '—')}</td>
        <td class="pr-3 py-1 mono text-slate-300">${escapeHtml(r.confidence || '—')}</td>
      `;
      airTbody.appendChild(tr);
    }
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="py-2 text-slate-400" colspan="5">No aircraft loss rows yet.</td>`;
      airTbody.appendChild(tr);
    }
  }

  const shipTbody = $('shipLossTable');
  if (shipTbody) {
    shipTbody.innerHTML = '';
    const rows = [...ships].sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).slice(0, 50);
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="pr-3 py-1 mono text-slate-300">${escapeHtml(r.date || '—')}</td>
        <td class="pr-3 py-1">${escapeHtml(r.name || '—')}</td>
        <td class="pr-3 py-1">${escapeHtml(r.type || '—')}</td>
        <td class="pr-3 py-1">${escapeHtml(r.status || '—')}</td>
        <td class="pr-3 py-1 mono text-slate-300">${escapeHtml(r.confidence || 'low')}</td>
      `;
      shipTbody.appendChild(tr);
    }
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="py-2 text-slate-400" colspan="5">No ship incident rows yet.</td>`;
      shipTbody.appendChild(tr);
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function boot() {
  const data = await loadData();
  setHeader(data);
  renderCasualtyCards(data);
  const focus = $('focusSide').value;
  upsertCharts(data, focus);
  renderTimeline(data, $('timelineQuery').value);
  renderMapMarkers(data);
  renderShipsAndChokepoints(data);
  renderCosts(data);
  renderLosses(data);
  renderIndustry(data);

  $('focusSide').addEventListener('change', async () => {
    const next = await loadData();
    upsertCharts(next, $('focusSide').value);
  });

  $('costCurrency').addEventListener('change', async () => {
    const next = await loadData();
    renderCosts(next);
  });

  $('industryMetric').addEventListener('change', async () => {
    const next = await loadData();
    renderIndustry(next);
  });

  $('timelineQuery').addEventListener('input', async () => {
    const next = await loadData();
    renderTimeline(next, $('timelineQuery').value);
  });

  $('btnRefresh').addEventListener('click', async () => {
    const next = await loadData();
    setHeader(next);
    renderCasualtyCards(next);
    upsertCharts(next, $('focusSide').value);
    renderTimeline(next, $('timelineQuery').value);
    renderMapMarkers(next);
    renderShipsAndChokepoints(next);
    renderCosts(next);
    renderLosses(next);
    renderIndustry(next);
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `
    <div style="padding:24px; font-family: ui-sans-serif, system-ui; color: #fff;">
      <h1 style="font-size:20px; margin-bottom:8px;">Dashboard failed to load</h1>
      <pre style="white-space: pre-wrap; background: rgba(0,0,0,.4); padding: 12px; border-radius: 12px;">${escapeHtml(String(err.stack || err))}</pre>
      <p style="opacity:.7; margin-top: 10px;">Make sure you’re serving the folder over HTTP (not file://) so data.json can be fetched.</p>
    </div>
  `;
});
