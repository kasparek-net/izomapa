import assert from 'node:assert/strict';
import fs from 'node:fs';
// drobná čistá logika prohlížeče z web/js (slepí web/sestav.py)
const js=fs.readdirSync('web/js').filter(f=>f.endsWith('.js')).sort().map(f=>fs.readFileSync('web/js/'+f,'utf8')).join('');
// pražské datum RRRRMMDD posunuté o den (včera/zítra pro jízdní řády), přes konec měsíce, roku a přestupný rok
const ymdSrc=js.match(/const ymd = \(d, k\) => \{[^\n]*?\};/)?.[0];assert.ok(ymdSrc);
const ymd=Function(ymdSrc+' return ymd;')();
assert.equal(ymd(20261127,-1),20261126);assert.equal(ymd(20261127,1),20261128);
assert.equal(ymd(20260301,-1),20260228);assert.equal(ymd(20280301,-1),20280229);
assert.equal(ymd(20261231,1),20270101);assert.equal(ymd(20270101,-1),20261231);
// pořadí v hledání: každý druh z indexu má číslo, jinak komparátor vrací NaN
const order=Function('return '+js.match(/const order = (\{[^}]*\});/)[1])();
const kinds=new Set([...js.matchAll(/kind: '([^']+)'/g)].map(m=>m[1]).concat(['adresa','budova']));
for(const k of kinds)assert.ok(Number.isFinite(order[k]),'chybí pořadí pro '+k);
console.log('OK: posun pražského data o den, pořadí všech druhů v hledání');
