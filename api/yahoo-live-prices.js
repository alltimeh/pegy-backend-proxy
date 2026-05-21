function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function cleanSymbol(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return "";
  return s.endsWith(".NS") ? s : `${s}.NS`;
}

function stripNs(symbol) {
  return String(symbol || "").toUpperCase().replace(".NS", "");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json,text/plain,*/*"
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 120)}` : ""}`
    );
  }

  return response.json();
}

async function fetchYahooQuoteBatch(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;

  const data = await fetchJson(url);
  const result = data?.quoteResponse?.result || [];

  return result.map((q) => {
    const previousClose =
      Number(q.regularMarketPreviousClose || 0) ||
      Number(q.regularMarketPrice || 0) ||
      0;

    const lastPrice = Number(q.regularMarketPrice || 0);

    if (!previousClose) {
      throw new Error(`Yahoo quote ${q.symbol} missing previous close`);
    }

    return {
      symbol: q.symbol,
      yahooSymbol: q.symbol,
      nseSymbol: stripNs(q.symbol),
      source: "Yahoo direct quote",
      previousClose,
      currentPrice: previousClose,
      lastPrice,
      dayChangePct: Number(q.regularMarketChangePercent || 0),
      rawTimestamp: q.regularMarketTime || ""
    };
  });
}

async function fetchYahooChartFallback(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=7d`;

  const data = await fetchJson(url);
  const result = data?.chart?.result?.[0];

  if (!result) {
    throw new Error(`Yahoo chart ${symbol} returned no result`);
  }

  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(
    (v) => typeof v === "number"
  );

  const previousClose =
    Number(meta.previousClose || 0) ||
    Number(meta.chartPreviousClose || 0) ||
    Number(closes.length >= 2 ? closes[closes.length - 2] : closes[closes.length - 1] || 0);

  const lastPrice = Number(meta.regularMarketPrice || closes[closes.length - 1] || 0);

  if (!previousClose) {
    throw new Error(`Yahoo chart ${symbol} missing previous close`);
  }

  return {
    symbol,
    yahooSymbol: symbol,
    nseSymbol: stripNs(symbol),
    source: "Yahoo chart fallback",
    previousClose,
    currentPrice: previousClose,
    lastPrice,
    dayChangePct: previousClose && lastPrice ? ((lastPrice - previousClose) / previousClose) * 100 : 0,
    rawTimestamp: meta.regularMarketTime || ""
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const symbols = String(req.query.symbols || "")
      .split(",")
      .map(cleanSymbol)
      .filter(Boolean);

    if (!symbols.length) {
      return res.status(400).json({
        error: "No symbols provided. Example: ?symbols=SBIN.NS,ITC.NS,PFC.NS"
      });
    }

    const quotes = [];
    const errors = [];

    try {
      const batchQuotes = await fetchYahooQuoteBatch(symbols);
      quotes.push(...batchQuotes);
    } catch (batchError) {
      errors.push({
        batchError: batchError.message,
        fallback: "Trying Yahoo chart endpoint per symbol"
      });
    }

    const found = new Set(quotes.map((q) => q.yahooSymbol));
    const missing = symbols.filter((s) => !found.has(s));

    for (const symbol of missing) {
      try {
        quotes.push(await fetchYahooChartFallback(symbol));
      } catch (error) {
        errors.push({
          symbol,
          yahooChartError: error.message
        });
      }
    }

    if (!quotes.length) {
      return res.status(500).json({
        error: "No quotes returned from Yahoo direct endpoints",
        errors
      });
    }

    return res.status(200).json({
      source: "Yahoo direct endpoint, no yahoo-finance2 package",
      lastUpdated: new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
      }),
      quotes,
      errors
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
