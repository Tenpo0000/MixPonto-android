import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, workedMinutes, dayKey, admissionMs, timestampMs } from '../../site-integration/src/core/batidas.mjs';

test('RFID antigo e UTC são normalizados no fuso de Brasília', () => {
    assert.equal(timestampMs('2026-10-19T08:00:00'), Date.parse('2026-10-19T11:00:00Z'));
    assert.equal(dayKey(Date.parse('2026-10-20T01:00:00Z')), '2026-10-19');
    assert.ok(Number.isNaN(timestampMs('inválido')));
});
test('une fontes, inclui ambos extremos e aceita um par', () => {
    const legacy = { '2026-10-19': { f1: { esp: { timestamp: '2026-10-19T08:00:00' } } }, '2026-10-20': { f1: { manual: { timestamp: '2026-10-20T11:00:00Z', manual: true } } } };
    const mobile = { f1: { a: { timestamp: Date.parse('2026-10-19T20:00:00Z') }, b: { timestamp: Date.parse('2026-10-20T20:00:00Z') }, c: { timestamp: Date.parse('2026-10-21T20:00:00Z') } } };
    const records = mergeRecords(legacy, mobile, '2026-10-19', '2026-10-20');
    assert.equal(records.length, 4);
    assert.equal(workedMinutes(records), 18 * 60);
    assert.equal(records[1].origem, 'android');
    assert.equal(records[1].manual, false);
    assert.equal(records[2].manual, true);
});
test('não cruza pares de funcionários ou de dias diferentes', () => {
    const records = mergeRecords({}, { f1: { a: { timestamp: Date.parse('2026-10-19T12:00:00Z') }, b: { timestamp: Date.parse('2026-10-20T12:00:00Z') } }, f2: { a: { timestamp: Date.parse('2026-10-19T20:00:00Z') } } });
    assert.equal(workedMinutes(records), 0);
});
test('admissão rejeita data impossível e começa à meia noite de Brasília', () => {
    assert.throws(() => admissionMs('2026-02-30'));
    assert.throws(() => admissionMs(''));
    assert.equal(admissionMs('2026-10-19'), Date.parse('2026-10-19T03:00:00Z'));
});
