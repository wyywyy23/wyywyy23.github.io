import docsearch from '@docsearch/js';

var searchPlaceholder = document.getElementById('search-placeholder');

if (searchPlaceholder !== null) {
  searchPlaceholder.className = 'd-none';
}

docsearch({
  container: '#docsearch',
  appId: 'PQRC11ZCA2',
  indexName: 'wyywyy23io',
  apiKey: 'f63d3009221b4cbabe514ba0badbe38a',
  debug: false,
});
