import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove, serverTimestamp } from 'firebase/database';
let env;
const uuid='12345678-1234-4123-8123-123456789abc';
const db=(uid,verified=false)=>env.authenticatedContext(uid,{email:`${uid}@example.com`,email_verified:verified}).database();
const request=()=>({tipo:'acesso',detalhes:'',criadoEm:serverTimestamp(),status:'recebida'});
const target=uid=>`contas/company/privacidade/${uid}/${uuid}`;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-mixponto',database:{host:'127.0.0.1',port:9000,rules:readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')}});});
after(async()=>env.cleanup());
beforeEach(async()=>{
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(ctx=>set(ref(ctx.database()),{contas:{company:{
        meta:{ownerUid:'company'},titularesAutorizados:{company:true},
        acessosMobile:{worker:{funcionarioId:'f1',ativo:true},former:{funcionarioId:'f2',ativo:false}},
        funcionarios:{f1:{nome:'Ana'},f2:{nome:'Bia'}},
        usuarios:{hr:{email:'hr@example.com',permissao:'rh',status:'ativo'}},
        acessosContas:{'hr@example%2Ecom':{usuarioId:'hr',email:'hr@example.com',permissao:'rh',status:'ativo'}}
    },other:{meta:{ownerUid:'other'},titularesAutorizados:{other:true}}}}));
});
test('funcionário pode exercer direitos sem exigir e-mail verificado, inclusive com vínculo inativo',async()=>{
    for(const uid of ['worker','former']) {
        await assertSucceeds(set(ref(db(uid),target(uid)),request()));
        assert.equal((await get(ref(db(uid),target(uid)))).val().status,'recebida');
    }
});
test('nega anônimo, conta errada, outro titular e conteúdo fora do esquema',async()=>{
    await assertFails(set(ref(env.unauthenticatedContext().database(),target('worker')),request()));
    await assertFails(set(ref(db('stranger',true),target('stranger')),request()));
    await assertFails(set(ref(db('worker'),target('former')),request()));
    await assertFails(set(ref(db('worker'),`contas/other/privacidade/worker/${uuid}`),request()));
    for(const extra of [{senha:'NUNCA'},{detalhes:'x'.repeat(1001)},{tipo:'fraude'},{status:'respondida'},{criadoEm:1}])
        await assertFails(set(ref(db('worker'),target('worker')),{...request(),...extra}));
});
test('administrador responde, titular consulta e ninguém reescreve ou apaga o pedido',async()=>{
    await set(ref(db('worker'),target('worker')),request());
    await assertFails(update(ref(db('worker'),target('worker')),{status:'respondida',resposta:'forjada',respondidoEm:serverTimestamp()}));
    await assertFails(get(ref(db('former'),target('worker'))));
    await assertSucceeds(update(ref(db('company',true),target('worker')),{status:'respondida',resposta:'Recebido para análise conforme os dados disponíveis.',respondidoEm:serverTimestamp()}));
    assert.equal((await get(ref(db('worker'),target('worker')))).val().status,'respondida');
    await assertFails(update(ref(db('company',true),target('worker')),{status:'recebida',resposta:null,respondidoEm:null}));
    await assertFails(update(ref(db('company',true),target('worker')),{resposta:'Resposta substituída',respondidoEm:serverTimestamp()}));
    await assertFails(update(ref(db('company',true),target('worker')),{detalhes:'reescrito'}));
    await assertFails(remove(ref(db('company',true),target('worker'))));
});
test('RH lê dados operacionais mas não a raiz privada ou os requerimentos de outros usuários',async()=>{
    await set(ref(db('worker'),target('worker')),request());
    await assertSucceeds(get(ref(db('hr',true),'contas/company/funcionarios')));
    await assertFails(get(ref(db('hr',true),'contas/company')));
    await assertFails(get(ref(db('hr',true),'contas/company/privacidade')));
});
test('nenhum cliente pode recriar cópias de senha no RTDB',async()=>{
    for(const uid of ['company','worker','hr'])
        await assertFails(set(ref(db(uid,true),'contas/company/credenciaisApp/f1'),{email:'worker@example.com',senha:'NUNCA-SALVAR-123',authUid:'worker',atualizadoEm:serverTimestamp()}));
    for(const field of ['senha','password','senhaApp','appPassword','mobilePassword','senhaMobile'])
        await assertFails(update(ref(db('company',true),'contas/company/funcionarios/f1'),{[field]:'NUNCA-SALVAR-123'}));
});
