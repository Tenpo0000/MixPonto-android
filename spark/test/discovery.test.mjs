import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, connectAuthEmulator, signOut } from 'firebase/auth';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { set, ref } from 'firebase/database';

const site = process.env.MIXPONTO_SITE_ROOT || 'C:/Users/Laerte/Documents/GitHub/Sistema-de-ponto';
const requireAdmin = createRequire(path.join(site, 'servidor/package.json'));
const { initializeApp: adminApp, deleteApp: deleteAdminApp } = await import(pathToFileURL(requireAdmin.resolve('firebase-admin/app')));
const { getAuth } = await import(pathToFileURL(requireAdmin.resolve('firebase-admin/auth')));
const { criarHandler } = await import(pathToFileURL(path.join(site, 'servidor/http.mjs')));
const { criarStore } = await import(pathToFileURL(path.join(site, 'servidor/firebase-store.mjs')));
const projectId = 'demo-mixponto';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
let env, server, backend, api, owner, shared;
const clients = [];
async function login(email) {
    const app = initializeApp({ apiKey: 'fake-api-key', projectId }, crypto.randomUUID());
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    clients.push({ app, auth });
    return (await createUserWithEmailAndPassword(auth, email, 'Only-test-12345!')).user;
}
async function seed(path, value) { await env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value)); }
const request = token => fetch(api, { headers: { Authorization: `Bearer ${token}` } });
before(async () => {
    env = await initializeTestEnvironment({ projectId, database: { host: '127.0.0.1', port: 9000,
        rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } });
    await env.clearDatabase();
    backend = adminApp({ projectId }, crypto.randomUUID());
    owner = await login(`owner-${crypto.randomUUID()}@example.com`);
    shared = await login(`shared-${crypto.randomUUID()}@example.com`);
    await getAuth(backend).updateUser(shared.uid, { emailVerified: true });
    const mailKey = shared.email.replace('.', '%2E');
    for (const id of [owner.uid, 'other']) {
        await seed(`contas/${id}`, { meta: { ownerUid: id }, titularesAutorizados: { [id]: true }, empresa: { nome: id },
            acessosContas: { [mailKey]: { usuarioId: 'p', email: shared.email, status: 'ativo', permissao: 'visualizador', nomeConta: id } },
            usuarios: { p: { email: shared.email, status: 'ativo', permissao: 'visualizador' } },
            credenciaisApp: { private: { senha: 'NAO-RETORNAR' } },
        });
    }
    const store = criarStore({ databaseURL: 'https://demo-mixponto.firebaseio.com', projectId, emulatorHost: '127.0.0.1:9000' });
    server = createServer(criarHandler({ store, verifyToken: token => getAuth(backend).verifyIdToken(token, true) }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    api = `http://127.0.0.1:${server.address().port}/api/contas`;
});
after(async () => {
    if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    for (const c of clients) { await signOut(c.auth); await deleteApp(c.app); }
    if (backend) await deleteAdminApp(backend);
    await env?.cleanup();
});

test('API real valida token Firebase, descobre duas contas sem índice e reflete revogação', async () => {
    assert.equal((await request('forged')).status, 401);
    const token = await shared.getIdToken(true);
    const response = await request(token);
    assert.equal(response.status, 200);
    const text = await response.text(), data = JSON.parse(text);
    assert.deepEqual(data.contas.map(c => c.id).sort(), [owner.uid, 'other'].sort());
    assert.ok(!text.includes('NAO-RETORNAR'));
    await seed(`contas/${owner.uid}/usuarios/p/status`, 'bloqueado');
    assert.deepEqual((await (await request(token)).json()).contas.map(c => c.id), ['other']);
    await getAuth(backend).updateUser(shared.uid, { disabled: true });
    assert.equal((await request(token)).status, 401);
});

test('titular não confirmado recebe somente a própria conta e a raiz continua inacessível', async () => {
    const token = await owner.getIdToken(true);
    const response = await request(token);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).contas.map(c => c.id), [owner.uid]);
    const root = await fetch(`http://127.0.0.1:9000/contas.json?ns=${projectId}&auth=${token}`);
    assert.equal(root.status, 401);
});
