console.log("Script running");

const width = 900;
const height = 600;
const ER_COST = 2400;

let active = null;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const g = svg.append("g");

const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.csv("data/insurance_master_full.csv")
]).then(([us, data]) => {

  const states = topojson.feature(us, us.objects.states);

  projection.fitSize([width, height], states);

  const dataMap = new Map();

  data.forEach(d => {
    dataMap.set(d.state, {
      rate: +d.uninsured_rate,
      population: +d.uninsured_population,
      monthly_income: +d.monthly_income
    });
  });

  const color = d3.scaleSequential()
    .domain([0, 20])
    .interpolator(d3.interpolateReds);

  g.selectAll("path")
    .data(states.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", d => {
      const stateData = dataMap.get(d.properties.name);
      return stateData ? color(stateData.rate) : "#ddd";
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .attr("cursor", "pointer")
    .on("click", function(event, d) {

      if (active === this) {
        active = null;

        g.transition().duration(750).attr("transform", "");

        g.selectAll("path")
          .transition().duration(300)
          .style("opacity", 1)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1);

        d3.select("#info-panel").html("");
        return;
      }

      active = this;

      g.selectAll("path")
        .transition().duration(300)
        .style("opacity", 0.2);

      d3.select(this)
        .transition().duration(300)
        .style("opacity", 1)
        .attr("stroke", "#000")
        .attr("stroke-width", 2);

      const stateName = d.properties.name;
      const stateData = dataMap.get(stateName);
      if (!stateData) return;

      const [[x0, y0], [x1, y1]] = path.bounds(d);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const x = (x0 + x1) / 2;
      const y = (y0 + y1) / 2;
      const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));
      const translate = [width / 2 - scale * x, height / 2 - scale * y];

      g.transition()
        .duration(750)
        .attr("transform", `translate(${translate})scale(${scale})`);

      const monthlyIncome = stateData.monthly_income;
      const burdenPct = ((ER_COST / monthlyIncome) * 100).toFixed(1);

      d3.select("#info-panel").html(`
        <div class="card">
          <h2>${stateName}</h2>
          <p><strong>${stateData.rate}%</strong> uninsured</p>
          <p><strong>${stateData.population.toLocaleString()}</strong> people without coverage</p>
          <hr>
          <p>Median monthly income: <strong>$${monthlyIncome.toLocaleString()}</strong></p>
          <p>🏥 Average ER visit: <strong>$${ER_COST.toLocaleString()}</strong></p>
          <p class="burden">
            ⚠ ${burdenPct}% of a month's income
          </p>
        </div>
      `);

      setTimeout(() => {
        document.querySelector(".card")?.classList.add("visible");
      }, 50);

    });

});
