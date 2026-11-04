const assert=require('assert');const KN=require('../kn-core.js');
// money
assert.strictEqual(KN.toMinor('1,000.50'),100050);
assert.strictEqual(KN.toMinor(0.1)+KN.toMinor(0.2),KN.toMinor(0.3));
assert.strictEqual(KN.toMinor('10.005'),1001);
assert.strictEqual(KN.lineMinor(10,KN.toMinor(100)),100000);          // 10 x 100 = 1000
assert.strictEqual(KN.lineMinor(4,KN.toMinor(150)),60000);            // 4 x 150 = 600
assert.strictEqual(KN.lineMinor(4,KN.toMinor(100)),40000);            // COGS 400
assert.strictEqual(KN.fmt(60000-40000),'200.00');                     // gross profit 200
assert.strictEqual(KN.lineMinor(2.5,KN.toMinor('33.33')),8333);
// migration is additive + idempotent, legacy untouched
const d={grades:[{n:'A',m:5,k:'raw'},{n:'B',m:2,k:'fin'}],tx:[{id:1,t:'in',g:'A',kg:10},{id:2,t:'out',g:'A',kg:4}],cfg:{unit:'kg'},ph:{x:1}};
const before=JSON.stringify({g:d.grades,t:d.tx,ph:d.ph});
KN.normalize(d);KN.normalize(d);
assert.strictEqual(d.products.length,2);
assert.strictEqual(JSON.stringify({g:d.grades,t:d.tx,ph:d.ph}),before);
assert.strictEqual(KN.stockOf(d,d.products[0]),6);
assert.strictEqual(d.products[0].buyPrice,0);const d2=KN.normalize({grades:[{n:'Z',m:1}],tx:[{id:1,t:'in',g:'Z',kg:100,r:10},{id:2,t:'in',g:'Z',kg:100,r:20},{id:3,t:'out',g:'Z',kg:50,r:99}]});assert.strictEqual(d2.products[0].buyPrice,15);
assert.strictEqual(d.warehouses.length,1);assert.strictEqual(d.meta.schema,2);
// stock moves + audit + idempotency
d.stockMoves.push({product:d.products[0].id,qty:5});assert.strictEqual(KN.stockOf(d,d.products[0]),11);
KN.audit(d,'create','product','x',null,{a:1});assert.strictEqual(d.audit.length,1);
assert.ok(KN.once(d,'inv-1'));assert.ok(!KN.once(d,'inv-1'));
assert.notStrictEqual(KN.uid('t'),KN.uid('t'));
console.log('ALL CORE TESTS PASSED');
