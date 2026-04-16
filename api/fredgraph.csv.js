export default async function handler(request, response) {
  const { id } = request.query;

  if (!id || typeof id !== "string") {
    response.status(400).send("Missing id");
    return;
  }

  const upstreamUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "insurance-map-vercel-proxy"
      }
    });

    if (!upstreamResponse.ok) {
      response.status(502).send(`Upstream error (${upstreamResponse.status})`);
      return;
    }

    const body = await upstreamResponse.text();
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    response.status(200).send(body);
  } catch (error) {
    response.status(502).send("Upstream fetch failed");
  }
}
