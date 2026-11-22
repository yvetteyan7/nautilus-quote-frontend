'use strict';
// Load this file before app.js. Partner applications may set autoLoad:false and
// await NautilusQuote.ready, then call NautilusQuote.loadResult(returnedJSON).
window.NautilusQuoteConfig = {
  autoLoad: true,
  resultURL: './examples/demo-result.json',
  // No API token belongs here. Result URLs must be on this site's own origin.
  imageURL(url) {
    // Synthetic sample artwork, served locally so the demo works without Discogs.
    const demo = /^https:\/\/example\.com\/nautilus-demo\/([a-z0-9-]+\.svg)$/.exec(url);
    return demo ? './assets/demo/' + demo[1] : url;
    // For production, return your own allowlisted image proxy URL if needed:
    // return '/your-image-proxy?url=' + encodeURIComponent(url);
  }
};
