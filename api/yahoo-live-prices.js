import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const yahooFinance = new YahooFinance();

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const NSE_HOME = "https://www.nseindia.com";
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function cleanNseSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(".NS", "");
}

function toYahooSymbol(symbol) {
  const clean = cleanNseSymbol(symbol);
  return clean.endsWith(".NS") ? clean : `${clean}.NS`;
}

function getSetCookie(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().join("; ");
  }
  return headers.get("set-cookie") || "";
}

async function getNseCookie() {
  const response = await fetch(NSE_HOME, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`NSE home returned ${response.status}`);
  }

  return getSetCookie(response.headers);
}

async function fetchNseQuote(symbol, cookie) {
  const cleanSymbol = cleanNseSymbol(symbol);
  const url = `${NSE_HOME}/api/quote-equity?symbol=${encodeURIComponent(cleanSymbol)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-IN,en;q=0.9",
      "Referer": `${NSE_HOME}/get-quotes/equity?symbol=${encodeURIComponent(cleanSymbol)}`,
      "Cookie": cookie
    }
  });

  if (!response.ok) {
    throw new Error(`NSE quote ${cleanSymbol} returned ${response.status}`);
  }

  const data = await response.json();
  const priceInfo = data.priceInfo || {};

  const previousClose =
    Number(priceInfo.previousClose || 0) ||
    Number(priceInfo.close || 0) ||
    Number(priceInfo.lastPrice || 0) ||
    0;

  const lastPrice = Number(priceInfo.lastPrice || 0);

  const dayChangePct =
    previousClose && lastPrice
      ? ((lastPrice - previousClose) / previousClose) * 100
      : Number(priceInfo.pChange || 0);

  if (!previousClose) {
    throw new Error(`NSE quote ${cleanSymbol} missing previous close`);
  }

  return {
    symbol: `${cleanSymbol}.NS`,
    yahooSymbol: `${cleanSymbol}.NS`,
    nseSymbol: cleanSymbol,
    source: "NSE",
    previousClose,
    currentPrice: previousClose,
    lastPrice,
    dayChangePct: Number(dayChangePct || 0),
    rawTimestamp: data.metadata?.lastUpdateTime || data.priceInfo?.lastUpdateTime || ""
  };
}

async function fetchYahooQuote(symbol) {
  const yahooSymbol = toYahooSymbol(symbol);
  const quote = await yahooFinance.quote(yahooSymbol);

  const previousClose =
    Number(quote.regularMarketPreviousClose || 0) ||
    Number(quote.previousClose || 0) ||
    Number(quote.regularMarketPrice || 0) ||
    0;

  if (!previousClose) {
    throw new Error(`Yahoo quote ${yahooSymbol} missing previous close`);
  }

  return {
    symbol: yahooSymbol,
    yahooSymbol,
    nseSymbol: cleanNseSymbol(symbol),
    source: "Yahoo fallback",
    previousClose,
    currentPrice: previousClose,
    lastPrice: Number(quote.regularMarketPrice || 0),
    dayChangePct: Number(quote.regularMarketChangePercent || 0),
    rawTimestamp: ""
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const symbolsParam = req.query.symbols || "";
    const symbols = symbolsParam
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    if (!symbols.length) {
      return res.status(400).json({
        error: "No symbols provided. Example: ?symbols=SBIN.NS,ITC.NS,PFC.NS"
      });
    }

    let cookie = "";
    let nseSessionError = "";

    try {
      cookie = await getNseCookie();
    } catch (error) {
      nseSessionError = error.message;
    }

    const quotes = [];
    const errors = [];

    for (const symbol of symbols) {
      try {
        if (!cookie) {
          throw new Error(nseSessionError || "NSE cookie unavailable");
        }

        const quote = await fetchNseQuote(symbol, cookie);
        quotes.push(quote);
      } catch (nseError) {
        try {
          const yahooQuote = await fetchYahooQuote(symbol);
          quotes.push(yahooQuote);

          errors.push({
            symbol,
            nseError: nseError.message,
            fallback: "Yahoo used"
          });
        } catch (yahooError) {
          errors.push({
            symbol,
            nseError: nseError.message,
            yahooError: yahooError.message
          });
        }
      }
    }

    if (!quotes.length) {
      return res.status(500).json({
        error: "No quotes returned from NSE or Yahoo",
        errors
      });
    }

    return res.status(200).json({
      source: "NSE previous close first, Yahoo fallback",
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
