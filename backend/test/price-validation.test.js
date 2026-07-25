import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  chooseMatchingMerchantSeller,
  currencyCode,
  currencySymbol,
  parseGoogleLensPrice,
  pricesAgree,
  productNamesMatch,
  rankMatchingShoppingOffers,
  scrapeProduct,
  selectCheapestOffer,
  selectCheapestDistinctOffers,
} from '../src/services/scraper.js';

test('accepts the same merchant and shopping price', () => {
  assert.equal(pricesAgree(99.99, 99.99), true);
});

test('allows minor rounding differences', () => {
  assert.equal(pricesAgree(99.99, 100), true);
});

test('rejects a materially different variant or accessory price', () => {
  assert.equal(pricesAgree(117.82, 89.99), false);
  assert.equal(pricesAgree(299.99, 19.1), false);
});

test('rejects missing and invalid prices', () => {
  assert.equal(pricesAgree(null, 10), false);
  assert.equal(pricesAgree(10, Number.NaN), false);
  assert.equal(pricesAgree(0, 10), false);
});

test('normalizes supported currency symbols and codes', () => {
  assert.equal(currencyCode('€'), 'EUR');
  assert.equal(currencyCode('$'), 'USD');
  assert.equal(currencySymbol('GBP'), '£');
  assert.equal(currencySymbol('SEK'), 'kr');
});

test('matches the same product while rejecting another model or size', () => {
  assert.equal(
    productNamesMatch('Tefal AeroSteam DT9814 Clothes Steamer', 'Tefal DT9814 AeroSteam Handheld Clothes Steamer'),
    true
  );
  assert.equal(
    productNamesMatch('Tefal AeroSteam DT9814 Clothes Steamer', 'Tefal AeroSteam DT3030 Clothes Steamer'),
    false
  );
  assert.equal(productNamesMatch('Byredo La Tulipe Body Wash 225ml', 'Byredo La Tulipe Body Wash 100ml'), false);
  assert.equal(productNamesMatch('Alaia Fishnet Flat Mules Black', 'Alaia Fishnet Flat Mules White'), false);
  assert.equal(productNamesMatch('Alaia Fishnet Flat Mules Black', 'Alaia Fishnet Flat Mules'), true);
});

test('normalizes accented brand names when matching products', () => {
  assert.equal(
    productNamesMatch('FISHNET FLAT MULES Alaia', 'ALAÏA Black Flat Mules in Fishnet'),
    true
  );
});

test('ranks the cheapest offer after all offers pass the same-product gate', () => {
  const offers = [
    { title: 'Nanamica Wind SS Shirt', price: 166.91, currency: '£', storeName: 'HHV' },
    { title: "nanamica Men's Short Sleeve Button Down Wind Shirt", price: 89, currency: '£', storeName: 'EQVVS' },
    { title: 'Generic Windbreaker Shirt', price: 20, currency: '£', storeName: 'Other' },
  ];

  const ranked = rankMatchingShoppingOffers(offers, 'Nanamica Wind SS Shirt', 'GBP');
  assert.deepEqual(ranked.map((offer) => offer.price), [89, 166.91]);
});

test('compares verified page prices instead of stopping at the first stale snippet', () => {
  const selected = selectCheapestOffer([
    { storeName: 'First result', price: 640 },
    { storeName: 'Second result', price: 530 },
    { storeName: 'Third result', price: 567.7 },
  ]);
  assert.equal(selected.storeName, 'Second result');
});

test('returns the cheapest three distinct merchant offers with valid prices', () => {
  const selected = selectCheapestDistinctOffers([
    { storeName: 'ALAÏA', price: 640, productUrl: 'https://alaia.example/one' },
    { storeName: 'Lyst', price: 530, productUrl: 'https://lyst.example/one' },
    { storeName: 'Lyst', price: 535, productUrl: 'https://lyst.example/two' },
    { storeName: 'eBay', price: 567.7, productUrl: 'https://ebay.example/one' },
    { storeName: 'Mytheresa', price: 700, productUrl: 'https://mytheresa.example/one' },
    { storeName: 'No Price', price: null, productUrl: 'https://invalid.example/one' },
  ]);

  assert.deepEqual(selected.map((offer) => offer.storeName), ['Lyst', 'eBay', 'ALAÏA']);
  assert.deepEqual(selected.map((offer) => offer.price), [530, 567.7, 640]);
});

test('chooses the advertised merchant instead of an unrelated cheaper seller', () => {
  const selected = chooseMatchingMerchantSeller(
    { storeName: 'Earl of East', price: 26 },
    [
      { name: 'HHV', base_price: '£19.10', direct_link: 'https://hhv.example/item' },
      { name: 'Earl of East', base_price: '£26.00', direct_link: 'https://earlofeast.example/item' },
    ]
  );

  assert.equal(selected.seller.name, 'Earl of East');
  assert.equal(selected.sellerPrice, 26);
});

test('does not resolve to an unrelated seller when neither merchant nor price matches', () => {
  const selected = chooseMatchingMerchantSeller(
    { storeName: 'ALAÏA', price: 640 },
    [{ name: 'Unrelated Outlet', base_price: '£530', direct_link: 'https://example.com/item' }]
  );
  assert.equal(selected, null);
});

test('uses Google Lens extracted numeric prices instead of display strings', () => {
  assert.equal(parseGoogleLensPrice({ value: '£530*', extracted_value: 530 }), 530);
  assert.equal(parseGoogleLensPrice({ value: '£1,299.99*' }), 1299.99);
});

test('prefers a visible sale price over crossed-out structured/list price', async (t) => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html>
      <html>
        <head>
          <title>Sale Test Product</title>
          <meta property="product:price:currency" content="GBP">
          <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Sale Test Product",
              "offers": {
                "@type": "Offer",
                "price": "100.00",
                "priceCurrency": "GBP",
                "availability": "https://schema.org/InStock"
              }
            }
          </script>
        </head>
        <body>
          <main>
            <h1>Sale Test Product</h1>
            <div class="product-price">
              <s class="old-price">£100.00</s>
              <span class="sale-price">£80.00</span>
            </div>
          </main>
        </body>
      </html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const result = await scrapeProduct(`http://127.0.0.1:${address.port}/product`);
  assert.equal(result.success, true);
  assert.equal(result.price, 80);
  assert.equal(result.priceSource, 'explicit_current_dom');
  assert.equal(result.priceConfidence, 'high');
  assert.equal(result.currency, 'GBP');
});
