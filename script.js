const width = 960;
const height = 620;
const BASE_ER_COST = 2400;
const CPI_BASELINE_YEAR = 2024;
const FRED_SERIES = {
  cpi_u: { id: "CPIAUCSL", label: "CPI-U (all items)" },
  cpi_medical: { id: "CUSR0000SAM", label: "CPI medical care" },
  unrate: { id: "UNRATE", label: "Unemployment rate" }
};

const svg = d3.select("#map")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g");

const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);

let lockedState = null;
let statePaths = null;
let statesFeatureCollection = null;

let rawStateData = [];
let rankedStateData = [];
let stateDataMap = new Map();
let colorScale = null;

let currentErCost = BASE_ER_COST;
let fredLatestDate = null;
let fredSeriesData = new Map();

function formatMoney(value) {
  return `$${d3.format(",")(Math.round(value))}`;
}

function formatPercent(value) {
  return `${d3.format(".1f")(value)}%`;
}

function formatMonthYear(date) {
  return d3.timeFormat("%b %Y")(date);
}

function buildLegend(scale) {
  const [min, max] = scale.domain();

  d3.select("#legend").html(`
    <p class="legend-title">Share of a median month&rsquo;s income needed to cover one ER visit</p>
    <div class="legend-bar" aria-hidden="true"></div>
    <div class="legend-scale">
      <span>${formatPercent(min)}</span>
      <span>${formatPercent((min + max) / 2)}</span>
      <span>${formatPercent(max)}</span>
    </div>
  `);
}

function createRankings(data) {
  return [...data]
    .sort((a, b) => d3.descending(a.burdenPct, b.burdenPct))
    .map((d, index) => ({ ...d, burdenRank: index + 1 }));
}

function buildOverview(data) {
  const burdenAverage = d3.mean(data, d => d.burdenPct);
  const uninsuredAverage = d3.mean(data, d => d.uninsuredRate);
  const povertyAverage = d3.mean(data, d => d.povertyRate);
  const topBurden = [...data]
    .sort((a, b) => d3.descending(a.burdenPct, b.burdenPct))
    .slice(0, 5);

  d3.select("#info-panel").html(`
    <p class="panel-label">Overview</p>
    <h2 class="panel-title">The cost shock is uneven.</h2>
    <p class="panel-subtitle">
      The same medical emergency can feel very different depending on what families earn and how many
      people already lack coverage.
    </p>

    <div class="metric-grid">
      <div class="metric">
        <p class="metric-label">Average burden</p>
        <p class="metric-value">${formatPercent(burdenAverage)}</p>
        <p class="metric-detail">ER cost as a share of median monthly income across states.</p>
      </div>
      <div class="metric">
        <p class="metric-label">Average uninsured rate</p>
        <p class="metric-value">${formatPercent(uninsuredAverage)}</p>
        <p class="metric-detail">Statewide share of residents without health insurance.</p>
      </div>
      <div class="metric">
        <p class="metric-label">Average poverty rate</p>
        <p class="metric-value">${formatPercent(povertyAverage)}</p>
        <p class="metric-detail">Share of people living below the federal poverty line.</p>
      </div>
      <div class="metric">
        <p class="metric-label">Typical ER bill</p>
        <p class="metric-value">${formatMoney(currentErCost)}</p>
        <p class="metric-detail">Used as the comparison benchmark throughout this map.</p>
      </div>
    </div>

    <p class="summary-copy">
      Darker states face a larger estimated income hit from a single ER visit. Select a state to compare
      its medical cost burden, uninsured population, and poverty rate.
    </p>

    <div class="ranking-block">
      <h3 class="ranking-title">Highest burden states</h3>
      <ol class="ranking-list">
        ${topBurden.map((d, index) => `
          <li>
            <span class="rank">${index + 1}</span>
            <span class="state-name">${d.state}</span>
            <span class="rank-value">${formatPercent(d.burdenPct)}</span>
          </li>
        `).join("")}
      </ol>
    </div>

    <div class="chart-block" aria-label="Live economic indicators from FRED">
      <div class="chart-head">
        <p class="chart-title">Live indicator</p>
        <select id="fred-series-select" class="chart-select" aria-label="Choose a FRED series">
          <option value="cpi_u">CPI-U</option>
          <option value="cpi_medical">CPI medical</option>
          <option value="unrate">Unemployment</option>
        </select>
      </div>
      <svg id="fred-chart" class="fred-chart" viewBox="0 0 360 130" role="img" aria-label="FRED time series chart"></svg>
      <p class="chart-meta" id="fred-chart-meta">Loading live series…</p>
    </div>
  `);

  const seriesSelect = document.getElementById("fred-series-select");
  if (seriesSelect) {
    const savedSeries = localStorage.getItem("fred_series") || "cpi_u";
    seriesSelect.value = savedSeries;
    seriesSelect.addEventListener("change", () => {
      localStorage.setItem("fred_series", seriesSelect.value);
      renderFredChart(seriesSelect.value);
    });
    renderFredChart(savedSeries);
  }
}

function buildStatePanel(datum) {
  d3.select("#info-panel").html(`
    <p class="panel-label">State Detail</p>
    <h2 class="panel-title">${datum.state}</h2>
    <p class="panel-subtitle">
      A typical ER visit would consume <strong>${formatPercent(datum.burdenPct)}</strong> of a median
      month&rsquo;s household income here.
    </p>

    <div class="metric-grid">
      <div class="metric">
        <p class="metric-label">ER burden</p>
        <p class="metric-value">${formatPercent(datum.burdenPct)}</p>
        <p class="metric-detail">${formatMoney(currentErCost)} against a median month of ${formatMoney(datum.monthlyIncome)}.</p>
      </div>
      <div class="metric">
        <p class="metric-label">Median income</p>
        <p class="metric-value">${formatMoney(datum.medianIncome)}</p>
        <p class="metric-detail">Median household income in the past 12 months.</p>
      </div>
      <div class="metric">
        <p class="metric-label">Uninsured rate</p>
        <p class="metric-value">${formatPercent(datum.uninsuredRate)}</p>
        <p class="metric-detail">${d3.format(",")(datum.uninsuredPopulation)} people without coverage.</p>
      </div>
      <div class="metric">
        <p class="metric-label">Poverty rate</p>
        <p class="metric-value">${formatPercent(datum.povertyRate)}</p>
        <p class="metric-detail">${d3.format(",")(datum.povertyPopulation)} people below poverty level.</p>
      </div>
    </div>

    <p class="summary-copy">
      ${datum.state} ranks <strong>${datum.burdenRank}${ordinalSuffix(datum.burdenRank)}</strong> highest
      on ER burden among the mapped states. That means the income shock from an emergency visit is larger
      here than in most of the country.
    </p>

    <div class="state-context">
      <p>
        This does not measure every out-of-pocket cost people face, but it offers a simple proxy for how
        exposed households may be when illness strikes.
      </p>
      <p>
        Click the state again, or choose another one, to keep comparing the map.
      </p>
    </div>

    <div class="chart-block" aria-label="Live economic indicators from FRED">
      <div class="chart-head">
        <p class="chart-title">Live indicator</p>
        <select id="fred-series-select" class="chart-select" aria-label="Choose a FRED series">
          <option value="cpi_u">CPI-U</option>
          <option value="cpi_medical">CPI medical</option>
          <option value="unrate">Unemployment</option>
        </select>
      </div>
      <svg id="fred-chart" class="fred-chart" viewBox="0 0 360 130" role="img" aria-label="FRED time series chart"></svg>
      <p class="chart-meta" id="fred-chart-meta">Loading live series…</p>
    </div>
  `);

  const seriesSelect = document.getElementById("fred-series-select");
  if (seriesSelect) {
    const savedSeries = localStorage.getItem("fred_series") || "cpi_u";
    seriesSelect.value = savedSeries;
    seriesSelect.addEventListener("change", () => {
      localStorage.setItem("fred_series", seriesSelect.value);
      renderFredChart(seriesSelect.value);
    });
    renderFredChart(savedSeries);
  }
}

function ordinalSuffix(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return "st";
  if (mod10 === 2 && mod100 !== 12) return "nd";
  if (mod10 === 3 && mod100 !== 13) return "rd";
  return "th";
}

function updateActiveState(selection, stateName = null) {
  selection
    .classed("is-dimmed", d => stateName && d.properties.name !== stateName)
    .classed("is-active", d => stateName && d.properties.name === stateName);
}

function computeDerivedStateData(source, erCost) {
  const withBurden = source.map(d => ({
    ...d,
    burdenPct: (erCost / d.monthlyIncome) * 100
  }));

  rankedStateData = createRankings(withBurden);
  stateDataMap = new Map(rankedStateData.map(d => [d.state, d]));

  const burdenExtent = d3.extent(rankedStateData, d => d.burdenPct);
  colorScale = d3.scaleLinear()
    .domain(burdenExtent)
    .range(["#f4dfd3", "#8b2e1f"])
    .interpolate(d3.interpolateLab);

  buildLegend(colorScale);

  const erCostDisplay = document.getElementById("er-cost-display");
  if (erCostDisplay) erCostDisplay.textContent = formatMoney(erCost);

  if (lockedState && stateDataMap.has(lockedState)) {
    buildStatePanel(stateDataMap.get(lockedState));
  } else {
    buildOverview(rankedStateData);
  }

  if (statePaths && colorScale) {
    statePaths
      .transition()
      .duration(450)
      .attr("fill", d => {
        const datum = stateDataMap.get(d.properties.name);
        return datum ? colorScale(datum.burdenPct) : "#e5dfd6";
      });
  }
}

async function fetchFredSeriesCsv(seriesId) {
  const proxied = `/api/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const direct = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;

  let text = null;
  try {
    const response = await fetch(proxied, { cache: "no-store" });
    if (response.ok) {
      text = await response.text();
    }
  } catch (error) {
    text = null;
  }

  if (!text) {
    const response = await fetch(direct, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch FRED series ${seriesId}`);
    }
    text = await response.text();
  }

  const parsed = d3.csvParse(text);
  const normalized = parsed
    .map(row => {
      const dateValue = row.observation_date || row.date;
      const date = new Date(dateValue);
      const raw = row[seriesId];
      const value = raw === "." || raw === undefined || raw === "" ? null : +raw;
      return Number.isFinite(date.getTime()) && Number.isFinite(value)
        ? { date, value }
        : { date, value: null };
    })
    .filter(d => d.value !== null)
    .sort((a, b) => d3.ascending(a.date, b.date));

  if (!normalized.length) {
    throw new Error(`No usable observations returned for ${seriesId}`);
  }

  return normalized;
}

function yearAverage(series, year) {
  const points = series.filter(d => d.date.getFullYear() === year);
  return points.length ? d3.mean(points, d => d.value) : null;
}

function latestPoint(series) {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const point = series[i];
    if (point && Number.isFinite(point.value)) return point;
  }
  return null;
}

function computeErCost(adjustMode) {
  if (adjustMode === "none") return BASE_ER_COST;

  const seriesKey = adjustMode === "cpi_medical" ? "cpi_medical" : "cpi_u";
  const seriesMeta = FRED_SERIES[seriesKey];
  const series = fredSeriesData.get(seriesMeta?.id);
  if (!series || !series.length) return BASE_ER_COST;

  const base = yearAverage(series, CPI_BASELINE_YEAR);
  const latest = latestPoint(series);
  if (!base || !latest) return BASE_ER_COST;

  return BASE_ER_COST * (latest.value / base);
}

function syncFredLatestDate() {
  const cpi = fredSeriesData.get(FRED_SERIES.cpi_u.id);
  const latest = cpi ? latestPoint(cpi) : null;
  if (!latest) return;

  fredLatestDate = latest.date;
  const latestEl = document.getElementById("fred-latest-date");
  if (latestEl) latestEl.textContent = formatMonthYear(fredLatestDate);
}

function setLiveStatus(isLive) {
  const statusEl = document.getElementById("fred-live-status");
  const latestEl = document.getElementById("fred-latest-date");

  if (statusEl) {
    statusEl.className = `status-pill ${isLive ? "status-pill--live" : "status-pill--offline"}`;
    statusEl.textContent = isLive ? "Live FRED data connected" : "Live data unavailable";
  }

  if (!latestEl) return;
  if (isLive) return;
  latestEl.textContent = "Unavailable";
}

function applyErCostFromUi() {
  const select = document.getElementById("er-adjust");
  const mode = select?.value || "none";
  localStorage.setItem("er_adjust_mode", mode);
  currentErCost = computeErCost(mode);
  computeDerivedStateData(rawStateData, currentErCost);
}

function renderFredChart(seriesKey) {
  const svgEl = document.getElementById("fred-chart");
  const metaEl = document.getElementById("fred-chart-meta");
  if (!svgEl || !metaEl) return;

  const meta = FRED_SERIES[seriesKey] || FRED_SERIES.cpi_u;
  const series = fredSeriesData.get(meta.id);
  if (!series || series.length < 2) {
    svgEl.innerHTML = "";
    metaEl.textContent = "Live series unavailable.";
    return;
  }

  const latest = latestPoint(series);
  const start = d3.timeMonth.offset(latest.date, -120);
  const windowed = series.filter(d => d.date >= start);
  const values = windowed.map(d => d.value);

  const innerWidth = 360;
  const innerHeight = 130;
  const margin = { top: 10, right: 12, bottom: 22, left: 38 };
  const w = innerWidth - margin.left - margin.right;
  const h = innerHeight - margin.top - margin.bottom;

  const x = d3.scaleTime()
    .domain(d3.extent(windowed, d => d.date))
    .range([0, w]);

  const y = d3.scaleLinear()
    .domain(d3.extent(values))
    .nice()
    .range([h, 0]);

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.value))
    .curve(d3.curveMonotoneX);

  const formatY = seriesKey === "unrate"
    ? d => `${d3.format(".1f")(d)}%`
    : d => d3.format(".0f")(d);

  svgEl.innerHTML = `
    <rect x="0" y="0" width="${innerWidth}" height="${innerHeight}" rx="14" fill="rgba(255,255,255,0.55)"></rect>
    <g transform="translate(${margin.left},${margin.top})">
      <g class="axis axis--y"></g>
      <g class="axis axis--x" transform="translate(0,${h})"></g>
      <path class="series" fill="none" stroke="#8b2e1f" stroke-width="2.25" d="${line(windowed)}"></path>
      <circle cx="${x(latest.date)}" cy="${y(latest.value)}" r="3.6" fill="#8b2e1f"></circle>
    </g>
  `;

  const svgSelection = d3.select(svgEl);
  const root = svgSelection.select("g");
  root.select(".axis--y")
    .call(d3.axisLeft(y).ticks(4).tickFormat(formatY))
    .call(g => g.selectAll(".domain").remove())
    .call(g => g.selectAll("line").attr("stroke", "rgba(0,0,0,0.12)"));

  root.select(".axis--x")
    .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%Y")))
    .call(g => g.selectAll(".domain").attr("stroke", "rgba(0,0,0,0.12)"))
    .call(g => g.selectAll("line").attr("stroke", "rgba(0,0,0,0.12)"));

  const latestLabel = seriesKey === "unrate"
    ? `${d3.format(".1f")(latest.value)}%`
    : d3.format(".1f")(latest.value);
  metaEl.textContent = `${meta.label}: ${latestLabel} (${formatMonthYear(latest.date)})`;
}

async function init() {
  const adjustSelect = document.getElementById("er-adjust");
  if (adjustSelect) {
    const savedMode = localStorage.getItem("er_adjust_mode") || "cpi_u";
    adjustSelect.value = savedMode;
    adjustSelect.addEventListener("change", () => applyErCostFromUi());
  }

  const [us, stateRows] = await Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("data/medical_burden_states.csv", d => ({
      state: d.state,
      medianIncome: +d.median_income,
      monthlyIncome: +d.monthly_income,
      povertyRate: +d.poverty_rate,
      povertyPopulation: +d.poverty_population,
      uninsuredRate: +d.uninsured_rate,
      uninsuredPopulation: +d.uninsured_population
    }))
  ]);

  statesFeatureCollection = topojson.feature(us, us.objects.states);
  projection.fitSize([width, height], statesFeatureCollection);

  rawStateData = stateRows;
  computeDerivedStateData(rawStateData, currentErCost);

  statePaths = g.selectAll("path")
    .data(statesFeatureCollection.features)
    .enter()
    .append("path")
    .attr("class", "state")
    .attr("d", path)
    .attr("fill", d => {
      const datum = stateDataMap.get(d.properties.name);
      return datum ? colorScale(datum.burdenPct) : "#e5dfd6";
    })
    .attr("stroke", "#f7f3ed")
    .attr("stroke-width", 1)
    .attr("cursor", "pointer")
    .on("mouseenter", function(event, d) {
      if (lockedState) return;
      const datum = stateDataMap.get(d.properties.name);
      if (!datum) return;
      updateActiveState(statePaths, d.properties.name);
      buildStatePanel(datum);
    })
    .on("mouseleave", function() {
      if (lockedState) return;
      updateActiveState(statePaths, null);
      buildOverview(rankedStateData);
    })
    .on("click", function(event, d) {
      const stateName = d.properties.name;
      const datum = stateDataMap.get(stateName);
      if (!datum) return;

      if (lockedState === stateName) {
        lockedState = null;
        updateActiveState(statePaths, null);
        buildOverview(rankedStateData);
        return;
      }

      lockedState = stateName;
      updateActiveState(statePaths, stateName);
      buildStatePanel(datum);
    });

  try {
    const [cpiU, cpiMedical, unrate] = await Promise.all([
      fetchFredSeriesCsv(FRED_SERIES.cpi_u.id),
      fetchFredSeriesCsv(FRED_SERIES.cpi_medical.id),
      fetchFredSeriesCsv(FRED_SERIES.unrate.id)
    ]);
    fredSeriesData.set(FRED_SERIES.cpi_u.id, cpiU);
    fredSeriesData.set(FRED_SERIES.cpi_medical.id, cpiMedical);
    fredSeriesData.set(FRED_SERIES.unrate.id, unrate);
    syncFredLatestDate();
    setLiveStatus(true);
  } catch (error) {
    // Live series is optional; keep the map usable offline.
    setLiveStatus(false);
  }

  applyErCostFromUi();
}

init();
