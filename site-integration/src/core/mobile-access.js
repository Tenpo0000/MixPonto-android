import { ref, get, update, runTransaction, serverTimestamp } from './firebase-tenant.js';
import { admissionMs, mergeRecords } from './batidas.mjs';

export async function employeeForAccess(db, owner, fid) {
    const company = (await get(ref(db, `contas/${owner}`))).val();
    if (!company?.meta?.ownerUid) throw new Error('Entre com o login titular de uma empresa já cadastrada.');
    const f = company.funcionarios?.[fid];
    if (!f || f.status !== 'ativo') throw new Error('Selecione um funcionário ativo já cadastrado.');
    const admission = admissionMs(f.admissao);
    return { company, f, admission };
}

export async function authorizeMobile(db, owner, fid, uid, credentials = null) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || uid === owner) throw new Error('Use uma conta individual de funcionário.');
    credentials?.onStage?.('consultar o cadastro da empresa');
    const { company, f, admission } = await employeeForAccess(db, owner, fid);
    credentials?.onStage?.('consultar a identidade em solicitacoesMobile');
    const request = credentials?.identity || (await get(ref(db, `contas/${owner}/solicitacoesMobile/${uid}`))).val();
    if (!request) throw new Error('Não foi possível confirmar a identidade da conta. Tente criar o acesso novamente.');
    // Inicializa sem recuar o relógio caso o terminal grave enquanto o titular autoriza.
    const latest = Math.max(0, ...mergeRecords(company.registros, company.batidasMobile)
        .filter((r) => r.funcionarioId === fid).map((r) => r.ms));
    credentials?.onStage?.('preparar o intervalo em controleBatidas');
    await runTransaction(ref(db, `contas/${owner}/controleBatidas/${fid}`), (current) => {
        if (current && current.timestamp >= latest) return current;
        return { timestamp: latest, requestId: 'migracao', origem: 'migracao', authUid: owner };
    });
    const access = { empresaUid: owner, funcionarioId: fid, ativo: true, vinculadoEm: serverTimestamp() };
    const changes = {
        [`contas/${owner}/acessosMobile/${uid}`]: access,
        [`contas/${owner}/funcionarios/${fid}/emailApp`]: request.email,
        [`contas/${owner}/funcionarios/${fid}/appAuthUid`]: uid,
        [`contas/${owner}/mobileAcessos/${uid}`]: { funcionarioId: fid, email: request.email, ativo: true },
        [`contas/${owner}/mobileConfig/${fid}`]: {
            admissao: f.admissao, admissaoEm: admission,
            empresa: company.empresas?.[f.empresaId]?.nome || company.empresa?.nome || 'Sua empresa',
        },
    };
    // A senha serve somente à autenticação temporária no Firebase Auth.
    // Não pode ser copiada para o cadastro ou para o Realtime Database.
    credentials?.onStage?.('liberar o vínculo em acessosMobile');
    await update(ref(db), changes);
    return request.email;
}

export async function revokeMobile(db, owner, uid) {
    const mirror = (await get(ref(db, `contas/${owner}/mobileAcessos/${uid}`))).val();
    if (!mirror?.funcionarioId) throw Error('O vínculo deste funcionário não foi encontrado nesta empresa.');
    const changes = {
        [`contas/${owner}/acessosMobile/${uid}`]: {
            empresaUid: owner, funcionarioId: mirror.funcionarioId, ativo: false, vinculadoEm: serverTimestamp(),
        },
        [`contas/${owner}/mobileAcessos/${uid}/ativo`]: false,
    };
    await update(ref(db), changes);
}
