import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, connectAuthEmulator, signOut } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref as sdkRef, set as sdkSet, goOffline } from 'firebase/database';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { publicarIdConta } from '../../site-integration/src/core/conta-id.js';

const source = readFileSync(new URL('../../site-integration/src/core/firebase-tenant.js', import.meta.url), 'utf8')
    .replaceAll('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js', import.meta.resolve('firebase/auth'))
    .replaceAll('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js', import.meta.resolve('firebase/database'));
const transport = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const projectId = 'demo-mixponto';
let env, app, db, auth, uid;
before(async () => { env = await initializeTestEnvironment({ projectId, database: { host: '127.0.0.1', port: 9000,
    rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } }); });
beforeEach(async () => {
    if (app) { goOffline(db); await signOut(auth); await deleteApp(app); }
    await env.clearDatabase();
    app = initializeApp({ apiKey: 'fake-api-key', projectId, databaseURL: `https://${projectId}.firebaseio.com` }, crypto.randomUUID());
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    db = getDatabase(app); connectDatabaseEmulator(db, '127.0.0.1', 9000);
    uid = (await createUserWithEmailAndPassword(auth, `${crypto.randomUUID()}@example.com`, 'Only-test-12345!')).user.uid;
    await env.withSecurityRulesDisabled((context) => sdkSet(sdkRef(context.database()), {
        contas: { [uid]: { titularesAutorizados: { [uid]: true }, meta: { ownerUid: uid } } },
    }));
});
after(async () => { if (app) { goOffline(db); await signOut(auth); await deleteApp(app); } await env?.cleanup(); });

test('REST envia X-Conta-ID nas leituras, lotes e transações ETag', async () => {
    const fetchOriginal = globalThis.fetch, requests = [];
    globalThis.fetch = async (url, options) => { requests.push({ url: String(url), ...options }); return fetchOriginal(url, options); };
    try {
        const target = transport.ref(db, `contas/${uid}/config/contador`);
        await transport.update(transport.ref(db), { [`contas/${uid}/empresa`]: { nome: 'Empresa' } });
        await transport.set(target, 0);
        await transport.runTransaction(target, (current) => current + 1);
        assert.equal((await transport.get(target)).val(), 1);
        assert.ok(requests.length >= 5);
        assert.ok(requests.every((request) => request.headers['X-Conta-ID'] === uid));
        assert.ok(requests.some((request) => request.headers['If-Match']));
        assert.ok(requests.some((request) => request.headers['X-Firebase-ETag'] === 'true'));
        await assert.rejects(transport.update(transport.ref(db), {
            [`contas/${uid}/empresa/nome`]: 'A', 'contas/other/empresa/nome': 'B',
        }), /duas empresas/);
    } finally { globalThis.fetch = fetchOriginal; }
});

test('assinatura SSE com header recebe estado inicial e atualizações e pode ser encerrada', async () => {
    const target = transport.ref(db, `contas/${uid}/config`), seen = [];
    let off, timer;
    try {
        await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(Error('SSE não entregou a atualização.')), 7000);
            off = transport.onValue(target, (snapshot) => {
                seen.push(snapshot.val());
                if (snapshot.val()?.contador === 5) resolve();
                if (seen.length === 1) transport.set(target, { contador: 5 }).catch(reject);
            }, reject);
        });
        assert.equal(seen[0], null);
        assert.equal(seen.at(-1).contador, 5);
    } finally { clearTimeout(timer); off?.(); }
});

test('header HTTP usa o código público da conta e índice resolve apenas contaId', async () => {
    await publicarIdConta({ ...transport, db, auth }, uid);
    const originalWindow = globalThis.window, originalFetch = globalThis.fetch, requests = [];
    globalThis.window = { fb: { contaAtiva: { id: uid, codigoApp: '1', permissao: 'administrador' } } };
    globalThis.fetch = (url, options) => { requests.push(options); return originalFetch(url, options); };
    try {
        await transport.set(transport.ref(db, 'contas/' + uid + '/empresas/A'), { nome: 'A' });
        await transport.set(transport.ref(db, 'contasPorId/1'), { contaId: uid });
        assert.ok(requests.every(r => r.headers['X-Conta-ID'] === '1'));
        assert.ok(requests.every(r => !r.headers['X-Empresa-ID']));
    } finally { globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

test('gerador grava número, metadado da conta e diretório no mesmo PATCH', async () => {
    const originalFetch = globalThis.fetch, writes = [];
    globalThis.fetch = (url, options) => { if (options.method === 'PATCH') writes.push(options); return originalFetch(url, options); };
    try {
        assert.equal(await publicarIdConta({ ...transport, db, auth }, uid), '1');
        assert.equal(writes.length, 1);
        const changes = JSON.parse(writes[0].body);
        assert.equal(changes.sequenciaContas, 1);
        assert.equal(changes['contas/' + uid + '/meta/codigoApp'], '1');
        assert.deepEqual(changes['contasPorId/1'], { contaId: uid });
    } finally { globalThis.fetch = originalFetch; }
});

test('assinaturas da mesma empresa compartilham um stream e fecham ao trocar de conta', async () => {
    const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
    globalThis.window = { fb: { contaAtiva: { id: uid, permissao: 'administrador' } } };
    let streams = 0, offA, offB, timer;
    globalThis.fetch = (url, options) => {
        if (options.headers.Accept === 'text/event-stream') { streams++; assert.equal(options.headers['X-Conta-ID'], uid); }
        return originalFetch(url, options);
    };
    try {
        await new Promise((resolve, reject) => {
            const seen = new Set();
            timer = setTimeout(() => reject(Error('Estado inicial não recebido.')), 7000);
            const ready = (name) => { seen.add(name); if (seen.size === 2) resolve(); };
            offA = transport.onValue(transport.ref(db, `contas/${uid}/funcionarios`), () => ready('A'), reject);
            offB = transport.onValue(transport.ref(db, `contas/${uid}/config`), () => ready('B'), reject);
        });
        assert.equal(streams, 1);
    } finally {
        clearTimeout(timer); offA?.(); offB?.(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;
    }
});
