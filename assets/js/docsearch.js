import docsearch from '@docsearch/js';

var searchPlaceholder = document.getElementById('search-placeholder');

if (searchPlaceholder !== null) {
  searchPlaceholder.className = 'd-none';
}

docsearch({
  container: '#docsearch',
  appId: 'PQRC11ZCA2',
  indexName: 'wyywyy23io',
  apiKey: '077ecd89b65785a99e98ef3b9f925486',
  debug: false,
});
