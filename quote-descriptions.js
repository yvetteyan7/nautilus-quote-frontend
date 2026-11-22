'use strict';
globalThis.QuoteDescriptions = {
  resolveSource(source, saved) {
    if (typeof saved?.quote_description === 'string') return saved.quote_description;
    return source.quote_copy?.status === 'completed' ? source.quote_copy.description : '';
  }
};
