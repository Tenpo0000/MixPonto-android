import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update } from 'firebase/database';
import { criarGestao } from 'file:///C:/Users/Laerte/Documents/GitHub/Sistema-de-ponto/servidor/gestao-service.mjs';
const require=createRequire('C:/Users/Laerte/Documents/GitHub/Sistema-de-ponto/servidor/package.json');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
let env,app,db,service;
const config={adminEmail:'central@example.com',adminUids:['central'],resellerUids:['reseller']};
const reseller={uid:'reseller',email:'reseller@example.com',email_verified:true};
const central={uid:'central',email:'central@example.com',email_verified:true};
const users={'central@example.com':{uid:'central',emailVerified:true},'member@example.com':{uid:'member',emailVerified:true}};
const action=extra=>({requestId:crypto.randomUUID(),...extra});
before(async()=>{
    process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';
    env=await initializeTestEnvironment({projectId:'demo-mixponto',database:{host:'127.0.0.1',port:9000,rules:readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')}});
    await env.clearDatabase();
    app=initializeApp({projectId:'demo-mixponto',databaseURL:'https://demo-mixponto.firebaseio.com'},'gestao-tests');db=getDatabase(app);
    service=criarGestao(db,{getUserByEmail:async email=>{if(users[email])return users[email];throw Object.assign(Error('not found'),{code:'auth/user-not-found'});}},config,{
        listAccountIds:async()=>Object.keys((await db.ref('contas').get()).val() || {}),get:async path=>(await db.ref(path).get()).val()
    });
});
after(async()=>{await deleteApp(app);await env.cleanup();});
test('backend real cria duas contas, protege auditoria e isola revogação durante sessão aberta',async()=>{
    const a=await service.create(reseller,action({nome:'A'})),b=await service.create(reseller,action({nome:'B'}));
    assert.equal(a.conta.codigoApp,'1');assert.equal(b.conta.codigoApp,'2');
    const identity={uid:'member',email:'member@example.com',email_verified:true};
    for(const c of [a,b]) await service.mutate(reseller,c.conta.id,action({tipo:'acesso',email:identity.email,permissao:'administrador'}));
    const client=env.authenticatedContext('member',{email:identity.email,email_verified:true}).database();
    const seller=env.authenticatedContext('reseller',{email:reseller.email,email_verified:true}).database();
    await assertSucceeds(get(ref(client,`contas/${a.conta.id}`)));
    await assertFails(get(ref(seller,`contas/${a.conta.id}/funcionarios`)));
    await assertFails(set(ref(client,`contas/${a.conta.id}/auditoria/falso`),{tipo:'forjado'}));
    await assertFails(set(ref(client,`contas/${a.conta.id}/meta/revendedorUid`),'member'));
    await assertFails(set(ref(client,`contas/${a.conta.id}/usuarios/elevado`),{permissao:'administrador'}));
    await assertSucceeds(set(ref(client,`contas/${a.conta.id}/funcionarios/f1`),{nome:'Ana',status:'ativo'}));
    assert.equal((await db.ref(`contas/${b.conta.id}/funcionarios`).get()).exists(),false);
    await service.mutate(central,a.conta.id,action({tipo:'acesso',email:identity.email,permissao:'administrador',revogar:true}));
    await assertFails(get(ref(client,`contas/${a.conta.id}`)));
    await assertFails(update(ref(client,`contas/${a.conta.id}/funcionarios/f1`),{nome:'Tentativa'}));
    await assertSucceeds(get(ref(client,`contas/${b.conta.id}`)));
    assert.equal((await service.list(reseller)).contas.length,2);
    await assert.rejects(service.detail({uid:'outro',email_verified:true},a.conta.id));
});
test('convite é aceito no backend real sem alterar senha e não reativa após cancelamento',async()=>{
    const [c]=(await service.list(reseller)).contas;
    await service.mutate(reseller,c.id,action({tipo:'acesso',email:'novo@example.com',permissao:'visualizador'}));
    await service.accept({uid:'novo',email:'novo@example.com',email_verified:false});
    assert.equal((await db.ref(`contas/${c.id}/acessosContas/novo@example%2Ecom`).get()).exists(),false);
    await service.accept({uid:'novo',email:'novo@example.com',email_verified:true});
    const client=env.authenticatedContext('novo',{email:'novo@example.com',email_verified:true}).database();
    await assertSucceeds(get(ref(client,`contas/${c.id}/funcionarios`)));
    await assertFails(get(ref(client,`contas/${c.id}/credenciaisApp`)));
    await service.mutate(reseller,c.id,action({tipo:'acesso',email:'novo@example.com',permissao:'visualizador',revogar:true}));
    await service.accept({uid:'novo',email:'novo@example.com',email_verified:true});
    await assertFails(get(ref(client,`contas/${c.id}/funcionarios`)));
});
test('criação concorrente usa IDs distintos e retry idempotente sem sobrescrever conta existente',async()=>{
    const one=action({nome:'Concorrente A'}),two=action({nome:'Concorrente B'});
    const result=await Promise.all([service.create(reseller,one),service.create(reseller,two)]);
    assert.deepEqual(result.map(r=>r.conta.codigoApp).sort(),['3','4']);
    assert.equal((await service.create(reseller,one)).conta.id,result[0].conta.id);
    assert.equal((await db.ref('sequenciaContas').get()).val(),4);
    const owner=env.authenticatedContext('central',{email:central.email,email_verified:true}).database();
    for(const r of result) await assertSucceeds(get(ref(owner,`contas/${r.conta.id}`)));
});
