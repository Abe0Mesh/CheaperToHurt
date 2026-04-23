const width = 960;
const height = 620;
const BASE_ER_COST = 2400;

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

const currentErCost = BASE_ER_COST;

function formatMoney(value) {
  return `$${d3.format(",")(Math.round(value))}`;
}

function formatPercent(value) {
  return `${d3.format(".1f")(value)}%`;
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
  `);
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
  `);
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

async function init() {
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
}

init();
