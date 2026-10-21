import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
const keyEmail = email => String(email || '').trim().toLowerCase().replace(/[% .#$\[\]\/]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function migrarIsolamento(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Exporte a raiz completa do Realtime Database como objeto JSON.');
    const out = structuredClone(input), pendencias = [], avisos = [];
    out.contas ||= {};
    const conta = id => {
        if (!validId(id)) throw Error('ID interno de conta inválido no arquivo.');
        return Object.hasOwn(out.contas, id) ? out.contas[id] : null;
    };
    for (const [uid, ativo] of Object.entries(input.titularesAutorizados || {})) {
        if (!validId(uid) || typeof ativo !== 'boolean') throw Error('Titular legado inválido.');
        if (!conta(uid)) out.contas[uid] = {};
        const target = conta(uid);
        target.titularesAutorizados ||= {};
        if (!Object.hasOwn(target.titularesAutorizados, uid)) target.titularesAutorizados[uid] = ativo;
    }
    for (const [email, grants] of Object.entries(input.acessosContas || {})) {
        for (const [id, grant] of Object.entries(grants || {})) {
            const target = conta(id), profile = target?.usuarios?.[grant?.usuarioId];
            if (!profile || keyEmail(profile.email) !== email || profile.titular || !['administrador','rh','visualizador'].includes(profile.permissao) || !['ativo','bloqueado'].includes(profile.status)) {
                pendencias.push({ origem: `acessosContas/${email}/${id}`, motivo: 'Perfil ausente ou incompatível; autorização não foi inferida.', dado: grant }); continue;
            }
            target.acessosContas ||= {};
            if (!Object.hasOwn(target.acessosContas, email)) target.acessosContas[email] = {
                usuarioId: grant.usuarioId, email: profile.email, nomeConta: grant.nomeConta || target.empresa?.nome || 'Empresa',
                permissao: profile.permissao, status: profile.status,
            };
        }
    }
    for (const [uid, access] of Object.entries(input.acessosMobile || {})) {
        const target = conta(access?.empresaUid);
        if (!validId(uid) || !validId(access?.funcionarioId) || !target?.funcionarios?.[access.funcionarioId]) {
            pendencias.push({ origem: `acessosMobile/${uid}`, motivo: 'Conta ou funcionário não encontrado.', dado: access }); continue;
        }
        target.acessosMobile ||= {};
        if (!Object.hasOwn(target.acessosMobile, uid)) target.acessosMobile[uid] = access;
        else if (JSON.stringify(target.acessosMobile[uid]) !== JSON.stringify(access)) avisos.push(`Vínculo local de ${uid} em ${access.empresaUid} preservado; o legado não substitui a decisão atual.`);
    }
    for (const [uid, request] of Object.entries(input.solicitacoesMobile || {})) {
        const targets = Object.values(out.contas).filter(c => Object.hasOwn(c.acessosMobile || {}, uid));
        if (!targets.length) {
            pendencias.push({ origem: `solicitacoesMobile/${uid}`, motivo: 'Não há vínculo que identifique a conta de destino.', dado: request }); continue;
        }
        for (const target of targets) {
            target.solicitacoesMobile ||= {};
            if (!Object.hasOwn(target.solicitacoesMobile, uid)) target.solicitacoesMobile[uid] = request;
        }
    }
    for (const name of ['acessosContas','acessosMobile','solicitacoesMobile','titularesAutorizados']) delete out[name];
    return { dados: out, relatorio: { pendencias, avisos } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination) throw Error('Uso: node firebase/migrar-isolamento.mjs exportacao.json banco-isolado.json');
    const { dados, relatorio } = migrarIsolamento(JSON.parse(await readFile(source, 'utf8')));
    await writeFile(destination, JSON.stringify(dados, null, 2) + '\n', { flag: 'wx' });
    await writeFile(destination + '.relatorio.json', JSON.stringify(relatorio, null, 2) + '\n', { flag: 'wx' });
    console.log(`Arquivo preparado. Pendências para revisar: ${relatorio.pendencias.length}. Nenhum dado foi enviado ao Firebase.`);
}
