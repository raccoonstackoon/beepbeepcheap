import assert from 'node:assert/strict';
import test from 'node:test';
import { currencyCode, currencySymbol, pricesAgree, productNamesMatch } from '../src/services/scraper.js';

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
});
