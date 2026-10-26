# CheaperToHurt — How Protected Are Americans From a Medical Bill?

**Live Site:** [cheapertohurtt.vercel.app](https://cheapertohurtt.vercel.app/)

An interactive data-journalism story and US choropleth map exploring how the cost of a single emergency room visit ($2,400 average) and ambulance ride ($1,150 average) impacts household budgets across all 50 states.

## Features

- **Interactive D3.js + TopoJSON Choropleth Map:** Shaded by state-level ER cost burden as a percentage of median monthly household income, with click-to-lock state inspection and state-by-state rankings.
- **Multi-Dataset US Census Integration:** Joins 2024 American Community Survey (ACS) tables for health insurance coverage (`S2701`), poverty status (`S1701`), and median household income (`B19013`).
- **Live FRED Economic Data Proxy:** Includes a Vercel serverless API endpoint (`api/fredgraph.csv.js`) and local Node/Python proxy servers to fetch Federal Reserve Economic Data (FRED) medical care and transportation CPI series.

## Tech Stack

- **Frontend:** JavaScript (ES6+), D3.js v7, TopoJSON, HTML5, CSS3
- **Backend / API:** Node.js Vercel Serverless Functions (`api/fredgraph.csv.js`), Python
- **Data Sources:** U.S. Census Bureau (2024 ACS `S2701`, `S1701`, `B19013`), Federal Reserve Bank of St. Louis (FRED), KFF

## Run Locally

```bash
node server.js
# or
python3 server.py
```
