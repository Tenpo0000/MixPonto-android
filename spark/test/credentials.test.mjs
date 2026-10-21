import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, goOffline, ref, get, set, update, serverTimestamp } from 'firebase/database';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const core = new URL('../../site-integration/src/core/', import.meta.url);
const sdk = {
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js': import.meta.resolve('firebase/app'),
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js': import.meta.resolve('firebase/auth'),
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js': import.meta.resolve('firebase/database'),
};
const asModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const localSdk = (source) => Object.entries(sdk).reduce((text, [remote, local]) => text.replaceAll(remote, local), source);
const tenantModule = asModule(localSdk(readFileSync(new URL('firebase-tenant.js', core), 'utf8')));
const accessModule = asModule(localSdk(readFileSync(new URL('mobile-access.js', core), 'utf8'))
    .replace('./firebase-tenant.js', tenantModule)
    .replace('./batidas.mjs', new URL('batidas.mjs', core).href));
const credentialsModule = asModule(localSdk(readFileSync(new URL('employee-credentials.js', core), 'utf8'))
    .replace('./firebase-tenant.js', tenantModule)
    .replace('./mobile-access.js', accessModule));
const { createEmployeeAccess } = await import(credentialsModule);
const { revokeMobile } = await import(accessModule);

const projectId = 'demo-mixponto';
const password = 'Only-test-12345!';
const options = { apiKey: 'fake-api-key', projectId, databaseURL: `https://${projectId}.firebaseio.com` };
const emulators = { auth: 'http://127.0.0.1:9099', databaseHost: '127.0.0.1', databasePort: 9000 };
let env, administrator, companyUid;
const sessions = [];
async function closeSessions() {
    for (const value of sessions.splice(0)) {
        goOffline(value.db);
        await signOut(value.auth);
        await deleteApp(value.app);
    }
}
function session() {
    const app = initializeApp(options, `test-${crypto.randomUUID()}`);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, emulators.auth, { disableWarnings: true });
    const db = getDatabase(app);
    connectDatabaseEmulator(db, emulators.databaseHost, emulators.databasePort);
    const value = { app, auth, db };
    sessions.push(value);
    return value;
}
async function seed(path, value) {
    await env.withSecurityRulesDisabled((context) => set(ref(context.database(), path), value));
}
function provision(extra = {}) {
    return createEmployeeAccess({ ...administrator, fid: 'f1', email: 'employee@example.com', password, emulators, ...extra });
}
function mobilePatch(uid) {
    const id = '12345678-1234-4123-8123-123456789abc';
    return {
        [`batidasMobile/f1/${id}`]: { timestamp: serverTimestamp(), authUid: uid, origem: 'android' },
        'controleBatidas/f1': { timestamp: serverTimestamp(), authUid: uid, origem: 'android', requestId: id },
    };
}
before(async () => {
    env = await initializeTestEnvironment({ projectId, database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } });
});
beforeEach(async () => {
    await closeSessions();
    await env.clearDatabase();
    const reset = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
    assert.equal(reset.status, 200);
    administrator = session();
    const { user } = await createUserWithEmailAndPassword(administrator.auth, 'admin@example.com', password);
    companyUid = user.uid;
    await seed('/', {
        contas: { [companyUid]: { titularesAutorizados: { [companyUid]: true }, meta: { ownerUid: companyUid }, funcionarios: {
            f1: { nome: 'Ana', matricula: '1', status: 'ativo', admissao: '2020-01-01' },
            f2: { nome: 'Bia', matricula: '2', status: 'ativo', admissao: '2020-01-01' },
        } } },
    });
});
after(async () => {
    await closeSessions();
    await env?.cleanup();
});

test('titular define credenciais e funcionário entra e bate sem confirmar email', async () => {
    const beforeApps = getApps().length;
    const access = await provision();
    assert.equal(administrator.auth.currentUser.uid, companyUid);
    assert.equal(getApps().length, beforeApps);
    const employee = session();
    const { user } = await signInWithEmailAndPassword(employee.auth, access.email, password);
    assert.equal(user.uid, access.uid);
    assert.equal(user.emailVerified, false);
    const result = await user.getIdTokenResult();
    assert.equal(result.claims.email_verified, false);
    await assertSucceeds(update(ref(employee.db, `contas/${companyUid}`), mobilePatch(user.uid)));
    await assertFails(get(ref(employee.db, `contas/${companyUid}/funcionarios/f2`)));
    const account = (await get(ref(administrator.db, `contas/${companyUid}`))).val();
    assert.equal(Object.keys(account.funcionarios).length, 2);
    assert.equal(account.funcionarios.f1.emailApp, access.email);
    assert.equal(account.funcionarios.f1.appAuthUid, user.uid);
    assert.equal(account.mobileAcessos[user.uid].email, access.email);
    let everything;
    await env.withSecurityRulesDisabled(async (context) => { everything = (await get(ref(context.database()))).val(); });
    assert.equal(everything.solicitacoesMobile, undefined, 'novas solicitações não ficam na raiz');
    assert.equal(everything.acessosMobile, undefined, 'novos vínculos não ficam na raiz');
    assert.equal(account.solicitacoesMobile[user.uid].email, access.email);
    assert.equal(account.credenciaisApp, undefined, 'Não pode existir cópia da senha no RTDB');
    await assertFails(get(ref(employee.db, `contas/${companyUid}/credenciaisApp`)));
    await assertFails(get(ref(employee.db, `contas/${companyUid}/credenciaisApp/f1/senha`)));
    await assertFails(set(ref(employee.db, `contas/${companyUid}/credenciaisApp/f1/senha`), 'Changed-12345!'));
    delete everything.contas[companyUid].credenciaisApp;
    assert.ok(!JSON.stringify(everything).includes(password));
    await revokeMobile(administrator.db, companyUid, user.uid);
    await assertFails(update(ref(employee.db, `contas/${companyUid}`), mobilePatch(user.uid)));
    assert.ok((await get(ref(administrator.db, `contas/${companyUid}/batidasMobile/f1`))).exists());
});
test('repetir com as mesmas credenciais conclui o mesmo login sem duplicar funcionário ou acesso', async () => {
    const first = await provision();
    const second = await provision();
    assert.equal(second.uid, first.uid);
    assert.equal(administrator.auth.currentUser.uid, companyUid);
    const accesses = (await get(ref(administrator.db, `contas/${companyUid}/mobileAcessos`))).val();
    assert.deepEqual(Object.keys(accesses), [first.uid]);
});

test('liberar novamente com as mesmas credenciais restaura o vínculo sem duplicar a conta', async () => {
    const first = await provision();
    await revokeMobile(administrator.db, companyUid, first.uid);
    const second = await provision();
    assert.equal(second.uid, first.uid);
    const link = (await get(ref(administrator.db, `contas/${companyUid}/acessosMobile/${first.uid}`))).val();
    assert.equal(link.ativo, true);
    assert.equal(link.funcionarioId, 'f1');
    assert.equal((await get(ref(administrator.db, `contas/${companyUid}/credenciaisApp/f1/senha`))).val(), null);
});

test('um titular também pode ter vínculo móvel em outra empresa, sem vínculo global', async () => {
    const candidate = session();
    const { user } = await createUserWithEmailAndPassword(candidate.auth, 'employee@example.com', password);
    await seed(`contas/${user.uid}/titularesAutorizados/${user.uid}`, true);
    const access = await provision();
    assert.equal(access.uid, user.uid);
    assert.equal((await get(ref(administrator.db, `contas/${companyUid}/credenciaisApp/f1/senha`))).val(), null);
    await assertFails(get(ref(candidate.db, `acessosMobile/${user.uid}`)));
});

test('conclui uma conta criada antes de uma interrupção, sem criar outro login', async () => {
    const interrupted = session();
    const { user } = await createUserWithEmailAndPassword(interrupted.auth, 'employee@example.com', password);
    assert.equal((await get(ref(interrupted.db, `contas/${companyUid}/acessosMobile/${user.uid}`))).exists(), false);
    const access = await provision();
    assert.equal(access.uid, user.uid);
    assert.equal((await get(ref(interrupted.db, `contas/${companyUid}/acessosMobile/${user.uid}`))).val().ativo, true);
    assert.equal(administrator.auth.currentUser.uid, companyUid);
});
test('não redefine a senha de email existente nem troca a sessão do titular ao falhar', async () => {
    const first = await provision();
    await assert.rejects(provision({ password: 'Different-password-123!' }), /senha informada não confere/);
    assert.equal(administrator.auth.currentUser.uid, companyUid);
    const employee = session();
    assert.equal((await signInWithEmailAndPassword(employee.auth, first.email, password)).user.uid, first.uid);
    assert.equal((await get(ref(administrator.db, `contas/${companyUid}/credenciaisApp/f1/senha`))).val(), null);
});
test('valida funcionário, admissão e senha antes de criar conta', async () => {
    await assert.rejects(provision({ password: 'short' }), /8 caracteres/);
    await assert.rejects(provision({ email: 'admin@example.com' }), /diferente do administrador/);
    await assert.rejects(provision({ fid: 'missing' }), /funcionário ativo/);
    await seed(`contas/${companyUid}/funcionarios/f1/status`, 'desligado');
    await assert.rejects(provision(), /funcionário ativo/);
    await seed(`contas/${companyUid}/funcionarios/f1/status`, 'ativo');
    await seed(`contas/${companyUid}/funcionarios/f1/admissao`, '2026-02-30');
    await assert.rejects(provision(), /admissão inválida/);
    const nonexistent = session();
    await assert.rejects(signInWithEmailAndPassword(nonexistent.auth, 'employee@example.com', password));
});
test('cadastro direto em Authentication não dá permissão para ponto ou autoautorização', async () => {
    const stranger = session();
    const { user } = await createUserWithEmailAndPassword(stranger.auth, 'stranger@example.com', password);
    await assertFails(update(ref(stranger.db, `contas/${companyUid}`), mobilePatch(user.uid)));
    await assertFails(set(ref(stranger.db, `contas/${companyUid}/acessosMobile/${user.uid}`), { empresaUid: companyUid, funcionarioId: 'f1', ativo: true, vinculadoEm: serverTimestamp() }));
    await assert.rejects(createEmployeeAccess({ ...stranger, fid: 'f1', email: 'another@example.com', password, emulators }));
    assert.equal(stranger.auth.currentUser.uid, user.uid);
});
test('a mesma identidade recebe vínculos independentes em duas empresas', async () => {
    const first = await provision();
    const other = session();
    const { user } = await createUserWithEmailAndPassword(other.auth, 'other-admin@example.com', password);
    await seed(`contas/${user.uid}/titularesAutorizados/${user.uid}`, true);
    await seed(`contas/${user.uid}`, { titularesAutorizados: { [user.uid]: true }, meta: { ownerUid: user.uid }, funcionarios: { f1: { nome: 'Outra', status: 'ativo', admissao: '2020-01-01' } } });
    const second = await provision({ ...other, owner: user.uid });
    assert.equal(second.uid, first.uid);
    await assertFails(get(ref(other.db, `contas/${companyUid}/credenciaisApp/f1`)));
    await assertFails(set(ref(other.db, `contas/${companyUid}/credenciaisApp/f1/senha`), 'Changed-12345!'));
    assert.equal(other.auth.currentUser.uid, user.uid);
    assert.equal((await get(ref(administrator.db, `contas/${companyUid}/acessosMobile/${first.uid}`))).val().empresaUid, companyUid);
});

test('credenciais administrativas rejeitam leitura anônima e cópia inconsistente', async () => {
    await provision();
    const anonymous = session();
    await assertFails(get(ref(anonymous.db, `contas/${companyUid}/credenciaisApp/f1`)));
    await assertFails(set(ref(administrator.db, `contas/${companyUid}/credenciaisApp/f1`), {
        email: 'other@example.com', senha: password, authUid: 'other', atualizadoEm: serverTimestamp(),
    }));
    assert.equal((await get(ref(administrator.db, `contas/${companyUid}/credenciaisApp/f1/senha`))).val(), null);
});
