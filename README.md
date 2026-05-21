# PEGY Backend Proxy - Ready for Vercel

Correct root structure:

package.json
api/
  yahoo-live-prices.js
  market-news.js
  Trigger redeploy

After upload/deploy on Vercel, test these URLs:

https://YOUR-PROJECT.vercel.app/api/yahoo-live-prices?symbols=SBIN.NS,ITC.NS,PFC.NS

https://YOUR-PROJECT.vercel.app/api/market-news?scope=CURRENT_SECTOR&sector=NIFTY_BANK

This version tries NSE previous close first and Yahoo Finance fallback second.
