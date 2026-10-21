import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, get } from 'firebase/database';
import { migrarIdsContas } from '../../site-integration/firebase/migrar-ids-contas.mjs';
const base = 'http://127.0.0.1:9000/.json?ns=demo-mixponto';
let env;
const send = options => fetch(base, { ...options, headers: { Authorization: 'Bearer owner', ...(options?.headers || {}) } });
before(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-mixponto', database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } });
});
after(async () => env?.cleanup());
beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(ctx => set(ref(ctx.database()), {
        contas: { company: { meta: { ownerUid: 'company' }, titularesAutorizados: { company: true },
            empresas: { E1: { nome: 'Um', codigoApp: '1' }, E2: { nome: 'Dois', codigoApp: '2' } },
            funcionarios: { f1: { nome: 'Ana', empresaId: 'E2', status: 'ativo', admissao: '2020-01-01' } },
            acessosMobile: { worker: { empresaUid: 'company', funcionarioId: 'f1', ativo: true, vinculadoEm: 1 } },
            credenciaisApp: { f1: { senha: 'credencial-sintetica' } }, registros: { dia: { f1: { p1: { timestamp: 1 } } } },
        } }, empresasPorId: { 1: { contaId: 'company', empresaId: 'E1' }, 2: { contaId: 'company', empresaId: 'E2' } }, sequenciaEmpresas: 2,
    }));
});
test('ETag impede substituir o banco se houver nova batida depois do backup', async () => {
    const snapshot = await send({ headers: { 'X-Firebase-ETag': 'true' } });
    const etag = snapshot.headers.get('etag'), before = await snapshot.json();
    const after = migrarIdsContas(before).dados;
    await env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), 'contas/company/registros/dia/f1/nova'), { timestamp: 2 }));
    const rejected = await send({ method: 'PUT', headers: { 'If-Match': etag }, body: JSON.stringify(after) });
    assert.equal(rejected.status, 412);
    const actual = await (await send()).json();
    assert.equal(actual.contas.company.registros.dia.f1.nova.timestamp, 2);
    assert.equal(actual.sequenciaContas, undefined);
});
test('migração condicional preserva dados e permite login mobile na conta para ambas unidades', async () => {
    const snapshot = await send({ headers: { 'X-Firebase-ETag': 'true' } });
    const etag = snapshot.headers.get('etag'), before = await snapshot.json(), after = migrarIdsContas(before).dados;
    const updated = await send({ method: 'PUT', headers: { 'If-Match': etag }, body: JSON.stringify(after) });
    assert.equal(updated.status, 200);
    const worker = env.authenticatedContext('worker').database();
    assert.equal((await get(ref(worker, 'contasPorId/1'))).val().contaId, 'company');
    await assertSucceeds(get(ref(worker, 'contas/company/funcionarios/f1/nome')));
    await assertFails(get(ref(worker, 'contas/company/credenciaisApp')));
    const actual = await (await send()).json();
    assert.equal(actual.sequenciaContas, 1);
    assert.equal(actual.contas.company.meta.codigoApp, '1');
    assert.deepEqual(actual.contas.company.registros, before.contas.company.registros);
    assert.deepEqual(actual.contas.company.funcionarios, before.contas.company.funcionarios);
    assert.deepEqual(actual.contas.company.credenciaisApp, before.contas.company.credenciaisApp);
});
