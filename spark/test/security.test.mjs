import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove, serverTimestamp } from 'firebase/database';
import { createMockUserToken } from '@firebase/util';
import { mergeRecords } from '../../site-integration/src/core/batidas.mjs';
import { salvarUsuarioComAcesso, chaveEmail } from '../../site-integration/src/core/contas.js';
import { publicarIdConta } from '../../site-integration/src/core/conta-id.js';
import { migrarIsolamento } from '../../site-integration/firebase/migrar-isolamento.mjs';

const accessSource = readFileSync(new URL('../../site-integration/src/core/mobile-access.js', import.meta.url), 'utf8')
    .replace('./firebase-tenant.js', import.meta.resolve('firebase/database'))
    .replace('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js', import.meta.resolve('firebase/database'))
    .replace('./batidas.mjs', new URL('../../site-integration/src/core/batidas.mjs', import.meta.url).href);
const { authorizeMobile, revokeMobile } = await import(`data:text/javascript;base64,${Buffer.from(accessSource).toString('base64')}`);
const restUrl = (path, uid) => {
    const token = createMockUserToken({ sub: uid, email: `${uid}@example.com`, email_verified: true }, 'demo-mixponto');
    return `http://127.0.0.1:9000/${path}.json?ns=demo-mixponto&auth=${token}`;
};

let env;
const id = '12345678-1234-4123-8123-123456789abc';
const second = '22345678-1234-4123-8123-123456789abc';
const path = `contas/company/batidasMobile/f1/${id}`;
const clockPath = 'contas/company/controleBatidas/f1';
const db = (uid = 'worker', verified = true) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified }).database();
const payload = (requestId = id, uid = 'worker') => ({
    [`batidasMobile/f1/${requestId}`]: { timestamp: serverTimestamp(), authUid: uid, origem: 'android' },
    'controleBatidas/f1': { timestamp: serverTimestamp(), authUid: uid, origem: 'android', requestId },
});
const punch = (database = db(), requestId = id, uid = 'worker') => update(ref(database, 'contas/company'), payload(requestId, uid));
const adminSet = async (path, value) => env.withSecurityRulesDisabled((context) => set(ref(context.database(), path), value));
const numerar = owner => publicarIdConta({ db: db(owner), ref, get, update }, owner);

before(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-mixponto', database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') } });
});
after(async () => env?.cleanup());
beforeEach(async () => {
    await env.clearDatabase();
    await adminSet('/', {
        contas: {
            company: {
                titularesAutorizados: { company: true },
                acessosMobile: { worker: { empresaUid: 'company', funcionarioId: 'f1', ativo: true, vinculadoEm: 1 } },
                meta: { ownerUid: 'company' },
                solicitacoesMobile: { worker: { email: 'worker@example.com', criadoEm: 1 }, newcomer: { email: 'newcomer@example.com', criadoEm: 1 } },
                funcionarios: {
                    f1: { nome: 'Ana', matricula: '1', status: 'ativo', admissao: '2020-01-01', cpf: 'private' },
                    f2: { nome: 'Bia', status: 'ativo', admissao: '2020-01-01' },
                },
                mobileConfig: { f1: { admissao: '2020-01-01', admissaoEm: 1577847600000, empresa: 'Empresa' } },
                registros: { '2026-10-19': { f1: { esp_1: { nome: 'Ana', timestamp: '2026-10-19T10:00:00.000Z', origem: 'esp32' } } } },
            },
            other: { titularesAutorizados: { other: true }, meta: { ownerUid: 'other' }, funcionarios: { f9: { nome: 'Outra', status: 'ativo' } } },
        },
    });
});

test('nega acesso anônimo, inclusive batida', async () => {
    const anon = env.unauthenticatedContext().database();
    await assertFails(get(ref(anon, '/')));
    await assertFails(punch(anon));
});

test('quatro nós globais ficam inacessíveis mesmo para titulares e não concedem autorização', async () => {
    for (const name of ['acessosContas','acessosMobile','solicitacoesMobile','titularesAutorizados']) {
        await adminSet(`${name}/legado`, true);
        await assertFails(get(ref(db('company'), name)));
        await assertFails(set(ref(db('company'), `${name}/novo`), true));
    }
    await adminSet('acessosMobile/worker', { empresaUid: 'company', funcionarioId: 'f1', ativo: true });
    await adminSet('contas/company/acessosMobile/worker', null);
    await assertFails(punch());
    await assertFails(get(ref(db(), 'contas/company/funcionarios/f1/nome')));
    await adminSet('titularesAutorizados/company', true);
    await adminSet('contas/company/titularesAutorizados/company', null);
    await assertFails(get(ref(db('company'), 'contas/company')));
});

test('permissão de uma conta não autoriza administrar titulares, solicitações ou usuários de outra', async () => {
    await assertFails(get(ref(db('company'), 'contas/other/acessosContas')));
    await assertFails(set(ref(db('company'), 'contas/other/titularesAutorizados/company'), true));
    await assertFails(set(ref(db('company'), 'contas/other/acessosMobile/worker'), { empresaUid: 'other', funcionarioId: 'f9', ativo: true, vinculadoEm: serverTimestamp() }));
    await assertFails(get(ref(db(), 'contas/company/acessosContas')));
});

test('ID público resolve a conta sem empresaId, sequestro ou listagem global', async () => {
    await numerar('company');
    assert.deepEqual((await get(ref(db(), 'contasPorId/1'))).val(), { contaId: 'company' });
    await assertFails(get(ref(db(), 'contasPorId')));
    await assertFails(get(ref(env.unauthenticatedContext().database(), 'contasPorId/1')));
    await assertFails(set(ref(db('other'), 'contasPorId/1'), { contaId: 'other' }));
    await assertFails(set(ref(db(), 'contasPorId/1'), { contaId: 'company' }));
    await assertFails(set(ref(db('company'), 'contasPorId/1'), { contaId: 'company', empresaId: 'extra' }));
});

test('duas empresas internas não consomem dois IDs; segunda conta recebe 2', async () => {
    await adminSet('contas/company/empresas', { A: { nome: 'A' }, B: { nome: 'B' } });
    assert.equal(await numerar('company'), '1');
    await assertSucceeds(set(ref(db('company'), 'contas/company/empresas/C'), { nome: 'C' }));
    await assertSucceeds(update(ref(db('company'), 'contas/company/empresas/A'), { nome: 'Novo nome' }));
    assert.equal(await numerar('company'), '1');
    assert.equal((await get(ref(db(), 'sequenciaContas'))).val(), 1);
    assert.equal(await numerar('other'), '2');
});

test('numeração de contas concorrentes é única e sequencial', async () => {
    assert.deepEqual((await Promise.all([numerar('company'), numerar('other')])).sort(), ['1','2']);
    assert.equal((await get(ref(db(), 'sequenciaContas'))).val(), 2);
    const ids = await Promise.all(['1','2'].map(async code => (await get(ref(db(), 'contasPorId/' + code))).val().contaId));
    assert.deepEqual(ids.sort(), ['company','other']);
});

test('duas abas da mesma conta recebem o mesmo número', async () => {
    assert.deepEqual(await Promise.all([numerar('company'), numerar('company')]), ['1','1']);
    assert.equal((await get(ref(db(), 'sequenciaContas'))).val(), 1);
});

test('contador e ID da conta rejeitam salto, alteração, exclusão e lote incompleto', async () => {
    await numerar('company');
    await assertFails(set(ref(db('company'), 'sequenciaContas'), 2));
    await assertFails(update(ref(db('other')), {
        sequenciaContas: 3, 'contasPorId/3': { contaId: 'other' }, 'contas/other/meta/codigoApp': '3',
    }));
    await assertFails(update(ref(db('company')), {
        sequenciaContas: 2, 'contasPorId/2': { contaId: 'company' }, 'contas/company/meta/codigoApp': '2',
    }));
    await assertFails(remove(ref(db('company'), 'contas/company/meta/codigoApp')));
    await assertFails(remove(ref(db('company'), 'contasPorId/1')));
    assert.equal((await get(ref(db(), 'sequenciaContas'))).val(), 1);
    assert.equal((await get(ref(db(), 'contasPorId/3'))).val(), null);
});

test('funcionários de duas empresas da conta usam o mesmo ID, mantendo isolamento por vínculo', async () => {
    await adminSet('contas/company/funcionarios/f1/empresaId', 'A');
    await adminSet('contas/company/funcionarios/f2/empresaId', 'B');
    await numerar('company');
    await authorizeMobile(db('company'), 'company', 'f2', 'newcomer');
    assert.equal((await get(ref(db(), 'contasPorId/1'))).val().contaId, 'company');
    await assertSucceeds(get(ref(db(), 'contas/company/funcionarios/f1/nome')));
    await assertSucceeds(get(ref(db('newcomer'), 'contas/company/funcionarios/f2/nome')));
    await assertFails(get(ref(db(), 'contas/company/funcionarios/f2/nome')));
    await assertFails(get(ref(db('newcomer'), 'contas/company/funcionarios/f1/nome')));
    await assertSucceeds(punch());
});

test('excluir cadastro de empresa não recicla nem altera número da conta', async () => {
    await adminSet('contas/company/empresas/A', { nome: 'A' });
    await numerar('company');
    await assertSucceeds(remove(ref(db('company'), 'contas/company/empresas/A')));
    assert.equal(await numerar('company'), '1');
    assert.equal(await numerar('other'), '2');
});

// Fixtures s�o provisionadas como pelo backend; clientes n�o gravam permiss�es.
const grant = async (owner,email,role='administrador',status='ativo') => {
    if(!['company','other'].includes(owner)) return set(ref(db(owner),'contas/company/acessosContas/injetado'),{});
    await env.withSecurityRulesDisabled(ctx=>update(ref(ctx.database()),{
        [`contas/${owner}/usuarios/shared-profile`]:{nome:'Compartilhado',email,permissao:role,status},
        [`contas/${owner}/acessosContas/${chaveEmail(email)}`]:{usuarioId:'shared-profile',email,nomeConta:`Empresa ${owner}`,permissao:role,status}
    }));
};

test('exportação legada migrada funciona com as regras isoladas sem autorização na raiz', async () => {
    await grant('company', 'shared@example.com');
    let legacy;
    await env.withSecurityRulesDisabled(async ctx => { legacy = (await get(ref(ctx.database()))).val(); });
    const account = legacy.contas.company;
    legacy.titularesAutorizados = { company: true };
    delete account.titularesAutorizados;
    legacy.acessosMobile = account.acessosMobile; delete account.acessosMobile;
    legacy.solicitacoesMobile = account.solicitacoesMobile; delete account.solicitacoesMobile;
    const email = chaveEmail('shared@example.com');
    legacy.acessosContas = { [email]: { company: account.acessosContas[email] } }; delete account.acessosContas;
    await adminSet('/', legacy);
    await assertFails(get(ref(db('company'), 'contas/company')));
    const migrated = migrarIsolamento(legacy);
    assert.equal(migrated.relatorio.pendencias.length, 1, 'solicitação sem vínculo fica no relatório local');
    await adminSet('/', migrated.dados);
    await assertSucceeds(get(ref(db('company'), 'contas/company')));
    await assertSucceeds(get(ref(db('shared'), 'contas/company')));
    await assertSucceeds(punch());
    for (const name of ['acessosContas','acessosMobile','solicitacoesMobile','titularesAutorizados']) assert.equal(migrated.dados[name], undefined);
});

test('administradores liberam o mesmo e-mail em duas contas sem cadastrar outro titular', async () => {
    await assertSucceeds(grant('company', 'shared@example.com'));
    await assertSucceeds(grant('other', 'shared@example.com'));
    const shared = db('shared');
    const access = (await get(ref(shared, `contas/company/acessosContas/${chaveEmail('shared@example.com')}`))).val();
    assert.equal(access.status, 'ativo');
    assert.equal((await get(ref(shared, `contas/other/acessosContas/${chaveEmail('shared@example.com')}`))).val().status, 'ativo');
    await assertSucceeds(get(ref(shared, 'contas/company')));
    await assertSucceeds(get(ref(shared, 'contas/other')));
    await assertSucceeds(grant('company', 'shared@example.com', 'administrador', 'bloqueado'));
    await assertFails(get(ref(shared, 'contas/company')));
    await assertSucceeds(get(ref(shared, 'contas/other')));
});

test('visualizador não altera dados ou permissões; convite exige e-mail confirmado', async () => {
    await grant('company', 'viewer@example.com', 'visualizador');
    const viewer = db('viewer');
    await assertSucceeds(get(ref(viewer, 'contas/company/funcionarios')));
    await assertFails(set(ref(viewer, 'contas/company/funcionarios/f1/nome'), 'Injetado'));
    await assertFails(get(ref(viewer, 'contas/company/credenciaisApp')));
    await assertFails(get(ref(viewer, 'contas/company/usuarios')));
    await assertFails(grant('viewer', 'viewer@example.com'));
    await assertFails(get(ref(db('viewer', false), 'contas/company/funcionarios')));
    await assertFails(get(ref(db('stranger'), `acessosContas/${chaveEmail('viewer@example.com')}`)));
});

test('RH altera dados operacionais mas não delega acesso ou se promove', async () => {
    await grant('company', 'hr@example.com', 'rh');
    const hr = db('hr');
    await assertSucceeds(set(ref(hr, 'contas/company/funcionarios/f1/nome'), 'Atualizado'));
    await assertFails(set(ref(hr, 'contas/company/usuarios/shared-profile/permissao'), 'administrador'));
    await assertFails(update(ref(hr, 'acessosContas'), { 'hr@example%2Ecom/company/permissao': 'administrador' }));
});

test('header de outra conta não permite atravessar empresas ou consultar outra solicitação', async () => {
    const response = await fetch(restUrl('contas/other/funcionarios', 'worker'), {
        headers: { 'X-Conta-ID': 'company' },
    });
    assert.equal(response.status, 401);
    await assertFails(get(ref(db(), 'contas/company/solicitacoesMobile/newcomer')));
    await assertFails(set(ref(db(), 'contas/other/acessosMobile/worker'), {
        empresaUid: 'other', funcionarioId: 'f9', ativo: true, vinculadoEm: serverTimestamp(),
    }));
});

test('administrador convidado libera e revoga funcionário na empresa selecionada', async () => {
    await grant('company', 'shared@example.com');
    await assertSucceeds(authorizeMobile(db('shared'), 'company', 'f2', 'newcomer'));
    const access = (await get(ref(db('newcomer'), 'contas/company/acessosMobile/newcomer'))).val();
    assert.equal(access.empresaUid, 'company');
    assert.equal(access.funcionarioId, 'f2');
    assert.equal(access.ativo, true);
    await assertSucceeds(revokeMobile(db('shared'), 'company', 'newcomer'));
    assert.equal((await get(ref(db('newcomer'), 'contas/company/acessosMobile/newcomer'))).val().ativo, false);
    await assertFails(authorizeMobile(db('shared'), 'other', 'f9', 'newcomer'));
});
test('identidade confirma o email do token sem conceder acesso, inclusive sem verificação', async () => {
    await assertSucceeds(set(ref(db('fresh'), 'contas/company/solicitacoesMobile/fresh'), { email: 'fresh@example.com', criadoEm: serverTimestamp() }));
    await assertSucceeds(set(ref(db('unverified', false), 'contas/company/solicitacoesMobile/unverified'), { email: 'unverified@example.com', criadoEm: serverTimestamp() }));
    await assertFails(punch(db('unverified', false), id, 'unverified'));
    await assertFails(set(ref(db('forged'), 'contas/company/solicitacoesMobile/forged'), { email: 'other@example.com', criadoEm: serverTimestamp() }));
    await assertFails(set(ref(db('timetravel'), 'contas/company/solicitacoesMobile/timetravel'), { email: 'timetravel@example.com', criadoEm: 1 }));
});
test('não permite ler ou alterar solicitação de outro login', async () => {
    await assertFails(get(ref(db(), 'solicitacoesMobile/newcomer')));
    await assertFails(update(ref(db(), 'solicitacoesMobile/worker'), { email: 'new@example.com' }));
});
test('titular confirma a identidade e cria o vínculo; funcionário não se autoriza', async () => {
    await assertSucceeds(get(ref(db('company'), 'contas/company/solicitacoesMobile/newcomer')));
    const access = { empresaUid: 'company', funcionarioId: 'f2', ativo: true, vinculadoEm: serverTimestamp() };
    await assertSucceeds(set(ref(db('company'), 'contas/company/acessosMobile/newcomer'), access));
    await assertFails(set(ref(db('newcomer'), 'acessosMobile/newcomer'), access));
    await assertFails(punch(db('newcomer'), id, 'newcomer'));
});
test('titular de outra empresa não toma vínculo ativo nem consulta equipe', async () => {
    await assertFails(get(ref(db('other'), 'contas/company')));
    await assertFails(set(ref(db('other'), 'acessosMobile/worker'), { empresaUid: 'other', funcionarioId: 'f9', ativo: true, vinculadoEm: serverTimestamp() }));
});
test('conta titular não pode ser transformada em login de funcionário de outra empresa', async () => {
    await adminSet('solicitacoesMobile/other', { email: 'other@example.com', criadoEm: 1 });
    await assertFails(set(ref(db('company'), 'acessosMobile/other'), { empresaUid: 'company', funcionarioId: 'f1', ativo: true, vinculadoEm: serverTimestamp() }));
});
test('funcionário lê somente projeção e suas batidas', async () => {
    for (const suffix of ['nome', 'matricula', 'status', 'admissao']) await assertSucceeds(get(ref(db(), `contas/company/funcionarios/f1/${suffix}`)));
    await assertSucceeds(get(ref(db(), 'contas/company/registros/2026-10-19/f1')));
    for (const target of ['contas/company', 'contas/company/funcionarios/f1', 'contas/company/funcionarios/f1/cpf', 'contas/company/funcionarios/f2/nome', 'contas/company/registros/2026-10-19', 'contas/other', 'acessosMobile']) await assertFails(get(ref(db(), target)));
});
test('batida e relógio são confirmados juntos com horário de servidor', async () => {
    const start = Date.now();
    await assertSucceeds(punch());
    const event = (await get(ref(db(), path))).val();
    const clock = (await get(ref(db(), clockPath))).val();
    assert.equal(event.timestamp, clock.timestamp);
    assert.ok(event.timestamp >= start - 1000 && event.timestamp <= Date.now() + 1000);
});
test('sem vínculo não bate; login liberado pelo titular não exige verificação de email', async () => {
    await assertFails(punch(db('unknown'), id, 'unknown'));
    await assertSucceeds(punch(db('worker', false)));
});
test('não aceita timestamp arbitrário, origem ou identidade forjada', async () => {
    for (const [field, value] of [['timestamp', 1], ['origem', 'esp32'], ['authUid', 'other']]) {
        const p = payload();
        p[`batidasMobile/f1/${id}`][field] = value;
        await assertFails(update(ref(db(), 'contas/company'), p));
    }
});
test('nega campos extras, inclusive manual e outro funcionário', async () => {
    const p = payload();
    p[`batidasMobile/f1/${id}`].manual = true;
    await assertFails(update(ref(db(), 'contas/company'), p));
    const other = Object.fromEntries(Object.entries(payload()).map(([k, v]) => [k.replace('/f1', '/f2'), v]));
    await assertFails(update(ref(db(), 'contas/company'), other));
});
test('não permite batida isolada nem manipular somente o controle', async () => {
    await assertFails(set(ref(db(), path), payload()[`batidasMobile/f1/${id}`]));
    await assertFails(set(ref(db(), clockPath), payload()['controleBatidas/f1']));
});
test('bloqueia dois eventos num mesmo patch', async () => {
    const p = payload();
    p[`batidasMobile/f1/${second}`] = p[`batidasMobile/f1/${id}`];
    await assertFails(update(ref(db(), 'contas/company'), p));
});
test('reenvio não duplica, não altera nem apaga evento existente', async () => {
    await assertSucceeds(punch());
    const original = (await get(ref(db(), path))).val();
    await assertFails(punch());
    await assertFails(remove(ref(db(), path)));
    await assertFails(update(ref(db(), path), { timestamp: serverTimestamp() }));
    assert.deepEqual((await get(ref(db(), path))).val(), original);
    assert.equal(Object.keys((await get(ref(db(), 'contas/company/batidasMobile/f1'))).val()).length, 1);
});
test('intervalo é por funcionário, incluindo outro login e concorrência', async () => {
    await adminSet('contas/company/acessosMobile/worker2', { empresaUid: 'company', funcionarioId: 'f1', ativo: true });
    const results = await Promise.allSettled([punch(), punch(db('worker2'), second, 'worker2')]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
test('relógio de RFID recente impede ponto móvel; antigo permite', async () => {
    await adminSet(clockPath, { timestamp: Date.now(), origem: 'esp32', requestId: 'esp_test', authUid: 'company' });
    await assertFails(punch());
    await adminSet(clockPath, { timestamp: Date.now() - 301000, origem: 'esp32', requestId: 'esp_test', authUid: 'company' });
    await assertSucceeds(punch());
});
test('demissão, revogação e admissão futura bloqueiam novas batidas', async () => {
    await adminSet('contas/company/funcionarios/f1/status', 'desligado');
    await assertFails(punch());
    await adminSet('contas/company/funcionarios/f1/status', 'ativo');
    await adminSet('contas/company/acessosMobile/worker/ativo', false);
    await assertFails(punch());
    await adminSet('contas/company/acessosMobile/worker/ativo', true);
    await adminSet('contas/company/mobileConfig/f1/admissaoEm', Date.now() + 86400000);
    await assertFails(punch());
});
test('mudança de admissão exige nova projeção e não usa criação da conta', async () => {
    await adminSet('contas/company/funcionarios/f1/admissao', '2021-01-01');
    await assertFails(punch());
});
test('revogação preserva histórico e pode ser feita só pelo titular', async () => {
    await assertSucceeds(punch());
    await assertFails(update(ref(db(), 'acessosMobile/worker'), { ativo: false }));
    await assertSucceeds(update(ref(db('company'), 'contas/company/acessosMobile/worker'), { ativo: false }));
    await assertFails(punch(db(), second));
    await assertSucceeds(get(ref(db('company'), path)));
});
test('contrato real RFID: titular lê cartão/cadastro e grava no caminho antigo', async () => {
    const terminal = db('company');
    await assertSucceeds(update(ref(terminal, 'contas/company'), {
        'cartoes/AABBCCDD': 'f1',
        'funcionarios/f1/cartaoUid': 'AABBCCDD',
        'funcionarios/f1/cartaoVersao': 1,
    }));
    await assertSucceeds(get(ref(terminal, 'contas/company/cartoes/AABBCCDD')));
    await assertSucceeds(get(ref(terminal, 'contas/company/funcionarios/f1/nome')));
    const event = { nome: 'Ana', timestamp: '2026-10-19T15:00:00.000Z', origem: 'esp32', uidCartao: 'AABBCCDD' };
    await assertSucceeds(set(ref(terminal, 'contas/company/registros/2026-10-19/f1/esp_test'), event));
    await assertSucceeds(set(ref(terminal, 'contas/company/registros/2026-10-19/f1/esp_test'), event));
    await assertFails(set(ref(db(), 'contas/company/registros/2026-10-19/f1/forged'), event));
});

test('regras móveis preservam validação de UID, índice e versão do RFID publicado', async () => {
    const terminal = db('company');
    const base = ref(terminal, 'contas/company');
    await assertFails(set(ref(terminal, 'contas/company/cartoes/AABB'), 'f1'));
    await assertFails(set(ref(terminal, 'contas/company/cartoes/AABBCCDD'), 'f1'));
    await assertSucceeds(update(base, {
        'cartoes/AABBCCDD': 'f1', 'funcionarios/f1/cartaoUid': 'AABBCCDD', 'funcionarios/f1/cartaoVersao': 1,
    }));
    const troca = {
        'cartoes/AABBCCDD': null, 'cartoes/11223344': 'f1', 'funcionarios/f1/cartaoUid': '11223344',
    };
    await assertFails(update(base, troca));
    await assertSucceeds(update(base, { ...troca, 'funcionarios/f1/cartaoVersao': 2 }));
    await assertFails(update(base, {
        'cartoes/11223344': 'f2', 'funcionarios/f2/cartaoUid': '11223344', 'funcionarios/f2/cartaoVersao': 1,
    }));
    assert.equal((await get(ref(terminal, 'contas/company/funcionarios/f1/cartaoUid'))).val(), '11223344');
});
test('funcionário não altera política, cadastro ou ownerUid', async () => {
    for (const target of ['mobileConfig/f1/admissaoEm', 'funcionarios/f1/status', 'meta/ownerUid']) await assertFails(set(ref(db(), `contas/company/${target}`), 0));
    await assertFails(set(ref(db('company'), 'contas/company/meta/ownerUid'), 'worker'));
});
test('funcionário não se promove criando empresa ou allowlist', async () => {
    await assertFails(set(ref(db(), 'titularesAutorizados/worker'), true));
    await assertFails(set(ref(db(), 'contas/worker'), { meta: { ownerUid: 'worker' } }));
    await assertFails(get(ref(db(), 'titularesAutorizados')));
    await adminSet('contas/worker/meta/ownerUid', 'worker');
    await assertFails(get(ref(db(), 'solicitacoesMobile/newcomer')));
    await assertFails(set(ref(db(), 'acessosMobile/newcomer'), { empresaUid: 'worker', funcionarioId: 'f1', ativo: true, vinculadoEm: serverTimestamp() }));
});
test('fluxo integrado: módulo real do site vincula, app grava REST, consulta une e revogação bloqueia', async () => {
    const owner = db('company');
    assert.equal(await authorizeMobile(owner, 'company', 'f2', 'newcomer'), 'newcomer@example.com');
    const patch = Object.fromEntries(Object.entries(payload(id, 'newcomer')).map(([k, v]) => [k.replace('/f1', '/f2'), v]));
    const response = await fetch(restUrl('contas/company', 'newcomer'), { method: 'PATCH', body: JSON.stringify(patch), headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 200, await response.text());
    const receipt = await fetch(restUrl(`contas/company/batidasMobile/f2/${id}`, 'newcomer'));
    const original = await receipt.json();
    assert.ok(Number.isFinite(original.timestamp));
    const replay = await fetch(restUrl('contas/company', 'newcomer'), { method: 'PATCH', body: JSON.stringify(patch) });
    assert.equal(replay.status, 401);
    const account = (await get(ref(owner, 'contas/company'))).val();
    const merged = mergeRecords(account.registros, account.batidasMobile);
    assert.ok(merged.some((r) => r.id === id && r.funcionarioId === 'f2' && r.origem === 'android'));
    assert.ok(merged.some((r) => r.id === 'esp_1' && r.origem === 'esp32'));
    assert.equal(Object.keys(account.funcionarios).length, 2);
    await revokeMobile(owner, 'company', 'newcomer');
    await assertFails(update(ref(db('newcomer'), 'contas/company'), Object.fromEntries(Object.entries(payload(second, 'newcomer')).map(([k, v]) => [k.replace('/f1', '/f2'), v]))));
    assert.deepEqual((await get(ref(owner, `contas/company/batidasMobile/f2/${id}`))).val(), original);
});
test('firmware ETag: reserva concorrente não sobrescreve batida móvel', async () => {
    const url = restUrl(clockPath, 'company');
    const initial = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
    assert.equal(initial.status, 200);
    const etag = initial.headers.get('etag');
    assert.ok(etag);
    await assertSucceeds(punch());
    const reservation = await fetch(url, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': etag },
        body: JSON.stringify({ timestamp: { '.sv': 'timestamp' }, requestId: 'esp_reserva', authUid: 'company', origem: 'esp32' }),
    });
    assert.equal(reservation.status, 412);
    assert.equal((await get(ref(db(), clockPath))).val().requestId, id);
});
test('firmware ETag: reserva confirmada impede nova batida móvel', async () => {
    const url = restUrl(clockPath, 'company');
    const initial = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
    const reservation = await fetch(url, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': initial.headers.get('etag') },
        body: JSON.stringify({ timestamp: { '.sv': 'timestamp' }, requestId: 'esp_reserva', authUid: 'company', origem: 'esp32' }),
    });
    assert.equal(reservation.status, 200, await reservation.text());
    await assertFails(punch());
});
