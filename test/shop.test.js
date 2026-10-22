import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, aggregateOrders, newsletterKpis } from '../src/shop.js';

test('Herkunft der Bestellung wird erkannt', () => {
  assert.equal(classifySource({ source_type: 'utm', utm_source: 'mailpoet', utm_medium: 'email' }), 'newsletter');
  assert.equal(classifySource({ source_type: 'organic', utm_source: 'google', utm_medium: 'organic' }), 'google');
  assert.equal(classifySource({ source_type: 'referral', referrer: 'https://linktr.ee/zipperwalls' }), 'bio');
  assert.equal(classifySource({ source_type: 'referral', referrer: 'https://l.facebook.com/l.php' }), 'facebook');
  assert.equal(classifySource({ source_type: 'utm', utm_source: 'google', utm_medium: 'cpc' }), 'google_ads');
  assert.equal(classifySource({ source_type: 'typein' }), 'direct');
  assert.equal(classifySource({}), 'unknown');
});

test('Bestellungen werden je Tag ohne Personendaten summiert', () => {
  const orders = [
    { id: 1, status: 'completed', date_created: '2026-10-20T10:00:00', total: '119.00', total_tax: '19.00', shipping_total: '10.00',
      billing: { email: 'kunde@example.com' }, line_items: [{ name: 'Messewand VIVA - 60 cm', parent_name: 'Messewand VIVA', quantity: 1, total: '90.00' }],
      meta_data: [{ key: '_wc_order_attribution_source_type', value: 'utm' }, { key: '_wc_order_attribution_utm_source', value: 'mailpoet' }] },
    { id: 2, status: 'processing', date_created: '2026-10-20T15:00:00', total: '238.00', total_tax: '38.00', line_items: [{ name: 'Messewand VIVA - 90 cm', parent_name: 'Messewand VIVA', quantity: 2, total: '200.00' }], meta_data: [] },
    { id: 3, status: 'cancelled', date_created: '2026-10-20T16:00:00', total: '500.00', total_tax: '80.00', line_items: [], meta_data: [] },
  ];
  const d = aggregateOrders(orders)['2026-10-20'];
  assert.equal(d.orders, 2);
  assert.equal(d.gross, 357);
  assert.equal(d.net, 300);
  assert.deepEqual(d.sources, { newsletter: { orders: 1, net: 100 }, unknown: { orders: 1, net: 200 } });
  assert.deepEqual(d.products['Messewand VIVA'], { qty: 3, net: 290 });
  assert.doesNotMatch(JSON.stringify(d), /kunde@example/);
});

test('Newsletter-Kennzahlen als Prozent', () => {
  assert.deepEqual(newsletterKpis({ sent: 200, opens: 50, clicks: 9, unsubscribes: 1 }).open_rate, 25);
  assert.equal(newsletterKpis({ sent: 200, opens: 50, clicks: 9, unsubscribes: 1 }).click_rate, 4.5);
  assert.equal(newsletterKpis({ sent: 0 }), null);
});
