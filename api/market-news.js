function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const sectorQueryMap = {
  ALL: "India stock market Nifty Sensex equity market",
  OVERALL: "India stock market Nifty Sensex equity market",
  NIFTY_BANK: "Nifty Bank banking stocks India RBI credit growth",
  NIFTY_FMCG: "India FMCG stocks rural demand margins",
  NIFTY_AUTO: "India auto stocks EV passenger vehicles two wheelers",
  NIFTY_IT: "India IT stocks software services guidance",
  NIFTY_PHARMA: "India pharma stocks USFDA generics",
  NIFTY_METAL: "India metal stocks steel aluminium China commodity prices",
  NIFTY_ENERGY: "India energy oil gas stocks crude refining margins",
  NIFTY_FIN_SERVICE: "India NBFC financial services stocks interest rates",
  POWER_UTILITY: "India power utility stocks electricity demand transmission",
  DEFENCE: "India defence stocks order book Make in India",
  MIDCAP: "India midcap stocks market valuation",
  SMALLCAP: "India smallcap stocks market correction liquidity"
};

function stripTags(text = "") {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractItems(xml, sector) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return blocks.slice(0, 12).map((block) => {
    const title =
      stripTags(
        (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
          block.match(/<title>([\s\S]*?)<\/title>/) ||
          [])[1] || ""
      );

    const source =
      stripTags((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "Google News");

    const pubDate =
      stripTags((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "");

    return {
      scope: sector === "ALL" ? "OVERALL" : "SECTOR",
      sectorKey: sector,
      impact: "neutral",
      source,
      title,
      why: "Live headline fetched from Google News RSS. Review the full article before taking any market action.",
      tags: [pubDate ? new Date(pubDate).toLocaleDateString("en-IN") : "Live News"]
    };
  }).filter((item) => item.title);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const sector = String(req.query.sector || "ALL").toUpperCase();
    const query = sectorQueryMap[sector] || sectorQueryMap.ALL;
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

    const response = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Google News returned ${response.status}`);
    }

    const xml = await response.text();
    const news = extractItems(xml, sector);

    if (!news.length) {
      throw new Error("No news items parsed");
    }

    return res.status(200).json({
      source: "Google News RSS",
      lastUpdated: new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
      }),
      news
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
