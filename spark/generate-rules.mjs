import { writeFileSync } from 'node:fs';

const scopedLink = "root.child('contas').child($empresa).child('acessosMobile').child(auth.uid)";
const employee = "root.child('contas').child($empresa).child('funcionarios').child($fid)";
const config = "root.child('contas').child($empresa).child('mobileConfig').child($fid)";
const own = `auth != null && ${scopedLink}.child('ativo').val() === true && ${scopedLink}.child('empresaUid').val() === $empresa && ${scopedLink}.child('funcionarioId').val() === $fid`;
const allowed = `${own} && ${employee}.child('status').val() === 'ativo' && ${config}.child('admissao').val() === ${employee}.child('admissao').val() && ${config}.child('admissaoEm').isNumber() && ${config}.child('admissaoEm').val() <= now`;
const uuid = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';
const ownerUid = owner => `root.child('contas').child(${owner}).child('meta/ownerUid').val()`;
const authorizedOwner = (owner) => `root.child('contas').child(${owner}).child('titularesAutorizados').child(${ownerUid(owner)}).val() === true`;
const emailKey = "auth.token.email.toLowerCase().replace('%','%25').replace(' ','%20').replace('.','%2E').replace('#','%23').replace('$','%24').replace('[','%5B').replace(']','%5D').replace('/','%2F')";
const membership = (owner) => `root.child('contas').child(${owner}).child('acessosContas').child(${emailKey})`;
const member = (owner) => `(auth != null && auth.token.email != null && auth.token.email_verified === true && ${authorizedOwner(owner)} && ${membership(owner)}.child('status').val() === 'ativo' && root.child('contas').child(${owner}).child('usuarios').child(${membership(owner)}.child('usuarioId').val()).child('status').val() === 'ativo' && root.child('contas').child(${owner}).child('usuarios').child(${membership(owner)}.child('usuarioId').val()).child('email').val() === auth.token.email.toLowerCase() && root.child('contas').child(${owner}).child('usuarios').child(${membership(owner)}.child('usuarioId').val()).child('permissao').val() === ${membership(owner)}.child('permissao').val())`;
const ownerAdmin = (owner) => `(auth != null && auth.uid === ${ownerUid(owner)} && ${authorizedOwner(owner)} && (root.child('contas').child(${owner}).child('meta/gestaoVersao').val() !== 2 || auth.token.email_verified === true))`;
const admin = (owner) => `(${ownerAdmin(owner)} || (${member(owner)} && ${membership(owner)}.child('permissao').val() === 'administrador'))`;
const writer = (owner) => `(${member(owner)} && (${membership(owner)}.child('permissao').val() === 'administrador' || ${membership(owner)}.child('permissao').val() === 'rh'))`;
const exactFields = (fields, extra = {}) => ({
    '.validate': `newData.hasChildren(${JSON.stringify(fields)})`,
    ...Object.fromEntries(fields.map((f) => [f, { '.validate': true }])),
    ...extra,
    '$other': { '.validate': false },
});
const numeroConta = '/^[1-9][0-9]{0,8}$/';
const preservarNumero = `!data.child('codigoApp').isString() || !data.child('codigoApp').val().matches(${numeroConta}) || newData.child('codigoApp').val() === data.child('codigoApp').val()`;
const directoryOwner = "newData.parent().child('contasPorId').child(newData.val() + '').child('contaId').val()";
const rules = {
    '.read': false,
    '.write': false,
    sequenciaContas: {
        '.read': 'auth != null',
        '.write': `newData.exists() && ${admin(directoryOwner)}`,
        '.validate': "newData.isNumber() && newData.val() <= 999999999 && newData.val() === (data.exists() ? data.val() + 1 : 1) && !root.child('contasPorId').child(newData.val() + '').exists()",
    },
    contasPorId: {
        '$codigo': {
            '.read': 'auth != null',
            '.write': `$codigo.matches(${numeroConta}) && newData.exists() && ${admin("newData.child('contaId').val()")} && ((data.exists() && newData.child('contaId').val() === data.child('contaId').val()) || (!data.exists() && $codigo === newData.parent().parent().child('sequenciaContas').val() + '' && newData.parent().parent().child('sequenciaContas').val() === (root.child('sequenciaContas').exists() ? root.child('sequenciaContas').val() + 1 : 1)))`,
            ...exactFields(['contaId'], {
                '.validate': "newData.hasChildren(['contaId']) && newData.child('contaId').isString() && newData.parent().parent().child('contas').child(newData.child('contaId').val()).child('meta/ownerUid').isString() && newData.parent().parent().child('contas').child(newData.child('contaId').val()).child('meta/codigoApp').val() === $codigo",
            }),
        },
    },
    contas: {
        '$empresa': {
            '.read': admin('$empresa'),
            '.write': false,
            '$colecao': {
                '.read': `${member('$empresa')} && ($colecao === 'meta' || $colecao === 'empresa' || $colecao === 'empresas' || $colecao === 'funcionarios' || $colecao === 'registros' || $colecao === 'batidasMobile' || $colecao === 'mobileAcessos' || $colecao === 'ajustes' || $colecao === 'horarios' || $colecao === 'cargos' || $colecao === 'departamentos' || $colecao === 'feriados' || $colecao === 'justificativas' || $colecao === 'desligamentos' || $colecao === 'config')`,
                '.write': `(${ownerAdmin('$empresa')} || ${writer('$empresa')}) && ($colecao === 'funcionarios' || $colecao === 'cartoes' || $colecao === 'mobileConfig' || $colecao === 'registros' || $colecao === 'controleBatidas' || $colecao === 'ajustes' || $colecao === 'desligamentos' || $colecao === 'horarios' || $colecao === 'cargos' || $colecao === 'departamentos' || $colecao === 'feriados' || $colecao === 'justificativas' || $colecao === 'empresas' || $colecao === 'empresa' || $colecao === 'config' || $colecao === 'mobileAcessos' || $colecao === 'acessosMobile' || $colecao === 'credenciaisApp')`,
            },
            titularesAutorizados: { '.write': false },
            usuarios: { '.write': false },
            auditoria: { '.write': false },
            convites: { '.write': false },
            operacoes: { '.read': false, '.write': false },
            acessosContas: {
                '$email': {
                    '.read': `auth != null && auth.token.email != null && auth.token.email_verified === true && $email === ${emailKey}`,
                    '.write': false,
                    ...exactFields(['usuarioId','email','nomeConta','permissao','status'], {
                        '.validate': `newData.hasChildren(['usuarioId','email','nomeConta','permissao','status']) && newData.child('usuarioId').isString() && newData.child('email').isString() && newData.child('nomeConta').isString() && (newData.child('permissao').val() === 'administrador' || newData.child('permissao').val() === 'rh' || newData.child('permissao').val() === 'visualizador') && (newData.child('status').val() === 'ativo' || newData.child('status').val() === 'bloqueado') && $email === newData.child('email').val().toLowerCase().replace('%','%25').replace(' ','%20').replace('.','%2E').replace('#','%23').replace('$','%24').replace('[','%5B').replace(']','%5D').replace('/','%2F') && newData.parent().parent().child('usuarios').child(newData.child('usuarioId').val()).child('email').val() === newData.child('email').val() && newData.parent().parent().child('usuarios').child(newData.child('usuarioId').val()).child('status').val() === newData.child('status').val() && newData.parent().parent().child('usuarios').child(newData.child('usuarioId').val()).child('permissao').val() === newData.child('permissao').val()`,
                    }),
                },
            },
            preferencias: { '$perfil': {
                '.read': `(${ownerAdmin('$empresa')} || ${member('$empresa')}) && auth.uid === $perfil`,
                '.write': `(${ownerAdmin('$empresa')} || ${member('$empresa')}) && auth.uid === $perfil`,
            } },
            meta: { '.validate': preservarNumero,
                ownerUid: { '.validate': 'newData.val() === data.val()' },
                codigoApp: { '.write': admin('$empresa'), '.validate': `newData.isString() && newData.val().matches(${numeroConta}) && newData.parent().parent().parent().parent().child('contasPorId').child(newData.val()).child('contaId').val() === $empresa` },
            },

            privacidade: {
                '.read': admin('$empresa'),
                '$uid': {
                    '.read': 'auth != null && auth.uid === $uid',
                    '$pedido': {
                        // A resposta é definitiva: preserva o pedido e o histórico enviado ao titular.
                        '.write': `auth != null && newData.exists() && $pedido.matches(${uuid}) && ((auth.uid === $uid && !data.exists() && (auth.uid === ${ownerUid('$empresa')} || root.child('contas').child($empresa).child('acessosMobile').child(auth.uid).child('funcionarioId').isString() || (auth.token.email != null && auth.token.email_verified === true && ${membership('$empresa')}.child('email').val() === auth.token.email.toLowerCase()))) || (data.exists() && data.child('status').val() === 'recebida' && newData.child('status').val() === 'respondida' && ${admin('$empresa')}))`,
                        ...exactFields(['tipo','detalhes','criadoEm','status'], {
                            '.validate': `newData.hasChildren(['tipo','detalhes','criadoEm','status']) && ((data.exists() && newData.child('tipo').val() === data.child('tipo').val() && newData.child('detalhes').val() === data.child('detalhes').val() && newData.child('criadoEm').val() === data.child('criadoEm').val()) || (!data.exists() && newData.child('criadoEm').val() === now && newData.child('status').val() === 'recebida' && !newData.child('resposta').exists() && !newData.child('respondidoEm').exists())) && (newData.child('status').val() === 'recebida' || (newData.child('status').val() === 'respondida' && newData.child('resposta').isString() && newData.child('resposta').val().length > 0 && newData.child('respondidoEm').val() === now))`,
                            tipo: { '.validate': "newData.isString() && newData.val().matches(/^(acesso|correcao|eliminacao|informacao|oposicao|revogacao|acessibilidade)$/)" },
                            detalhes: { '.validate': 'newData.isString() && newData.val().length <= 1000' },
                            criadoEm: { '.validate': 'newData.isNumber()' },
                            status: { '.validate': "newData.val() === 'recebida' || newData.val() === 'respondida'" },
                            resposta: { '.validate': 'newData.isString() && newData.val().length <= 2000' },
                            respondidoEm: { '.validate': 'newData.isNumber() && newData.val() === now' },
                        }),
                    },
                },
            },
            solicitacoesMobile: {
                '$uid': {
                    '.read': `(auth != null && auth.uid === $uid) || ${admin('$empresa')}`,
                    '.write': `auth != null && auth.uid === $uid && auth.token.email != null && ${authorizedOwner('$empresa')} && !data.exists() && newData.exists()`,
                    ...exactFields(['email', 'criadoEm'], {
                        email: { '.validate': 'newData.val() === auth.token.email' },
                        criadoEm: { '.validate': 'newData.isNumber() && newData.val() === now' },
                    }),
                },
            },
            acessosMobile: { '.write': admin('$empresa'),
                '$uid': {
                    '.read': `(auth != null && auth.uid === $uid) || ${admin('$empresa')}`,
                    ...exactFields(['empresaUid','funcionarioId','ativo','vinculadoEm'], {
                        '.validate': "newData.hasChildren(['empresaUid','funcionarioId','ativo','vinculadoEm']) && newData.child('empresaUid').val() === $empresa && newData.child('funcionarioId').isString() && newData.child('ativo').isBoolean() && root.child('contas').child($empresa).child('funcionarios').child(newData.child('funcionarioId').val()).exists() && (newData.child('ativo').val() === false || (root.child('contas').child($empresa).child('solicitacoesMobile').child($uid).exists() && root.child('contas').child($empresa).child('funcionarios').child(newData.child('funcionarioId').val()).child('status').val() === 'ativo')) && newData.child('vinculadoEm').isNumber() && newData.child('vinculadoEm').val() <= now",
                    }),
                },
            },
            // Bloqueia a recriação de cópias recuperáveis de senhas.
            credenciaisApp: { '.read': false, '.write': false, '.validate': false },
            funcionarios: { '.write': `(${ownerAdmin('$empresa')} || ${writer('$empresa')})`,
                '$fid': {
                    '.validate': "!newData.hasChild('senha') && !newData.hasChild('password') && !newData.hasChild('senhaApp') && !newData.hasChild('appPassword') && !newData.hasChild('mobilePassword') && !newData.hasChild('senhaMobile') && (!data.exists() || newData.child('cartaoUid').val() === data.child('cartaoUid').val() || (newData.child('cartaoVersao').isNumber() && newData.child('cartaoVersao').val() === (data.child('cartaoVersao').exists() ? data.child('cartaoVersao').val() + 1 : 1)))",
                    ...Object.fromEntries(['nome', 'matricula', 'status', 'admissao', 'empresaId'].map((field) => [field, { '.read': own }])),
                    cartaoUid: { '.validate': "newData.isString() && (newData.val() === '' || (newData.val().matches(/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/) && newData.parent().parent().parent().child('cartoes').child(newData.val()).val() === $fid))" },
                },
            },
            cartoes: { '.write': `(${ownerAdmin('$empresa')} || ${writer('$empresa')})`,
                '$cartao': { '.validate': "$cartao.matches(/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/) && newData.isString() && newData.parent().parent().child('funcionarios').child(newData.val()).child('cartaoUid').val() === $cartao && (!data.exists() || data.val() === newData.val() || newData.parent().parent().child('funcionarios').child(data.val()).child('cartaoUid').val() !== $cartao)" },
            },
            mobileConfig: { '.write': `(${ownerAdmin('$empresa')} || ${writer('$empresa')})`, '$fid': { '.read': own } },
            registros: { '.write': `(${ownerAdmin('$empresa')} || ${writer('$empresa')})`, '$dia': { '$fid': { '.read': own } } },
            batidasMobile: { '.write': admin('$empresa'),
                '$fid': {
                    '.read': own,
                    '.indexOn': ['timestamp'],
                    '$request': {
                        '.write': `${allowed} && !data.exists() && newData.exists() && $request.matches(${uuid})`,
                        ...exactFields(['timestamp', 'authUid', 'origem'], {
                            '.validate': `${admin('$empresa')} || (newData.hasChildren(['timestamp','authUid','origem']) && newData.child('timestamp').val() === now && newData.child('authUid').val() === auth.uid && newData.child('origem').val() === 'android' && newData.parent().parent().parent().child('controleBatidas').child($fid).child('timestamp').val() === now && newData.parent().parent().parent().child('controleBatidas').child($fid).child('requestId').val() === $request && newData.parent().parent().parent().child('controleBatidas').child($fid).child('authUid').val() === auth.uid)`,
                        }),
                    },
                },
            },
            controleBatidas: { '.write': `(${ownerAdmin('$empresa')} || ${writer('$empresa')})`,
                '$fid': {
                    '.read': own,
                    '.write': `${allowed} && newData.exists() && (!data.exists() || (data.child('timestamp').isNumber() && now - data.child('timestamp').val() >= 300000))`,
                    ...exactFields(['timestamp', 'requestId', 'authUid', 'origem'], {
                        '.validate': `${admin('$empresa')} || (newData.hasChildren(['timestamp','requestId','authUid','origem']) && newData.child('timestamp').val() === now && newData.child('authUid').val() === auth.uid && newData.child('origem').val() === 'android' && newData.child('requestId').isString() && !root.child('contas').child($empresa).child('batidasMobile').child($fid).child(newData.child('requestId').val()).exists() && newData.parent().parent().child('batidasMobile').child($fid).child(newData.child('requestId').val()).child('timestamp').val() === now && newData.parent().parent().child('batidasMobile').child($fid).child(newData.child('requestId').val()).child('authUid').val() === auth.uid)`,
                    }),
                },
            },
        },
    },
};
const operational = ['funcionarios','cartoes','mobileConfig','registros','controleBatidas','ajustes','desligamentos','horarios','cargos','departamentos','feriados','justificativas'];
const readable = [...operational, 'batidasMobile','mobileAcessos','config','empresa','empresas','meta'];
const account = rules.contas['$empresa'];
account.$colecao['.read'] = `${member('$empresa')} && (${readable.map((key) => `$colecao === '${key}'`).join(' || ')})`;
// Filhos explícitos não herdam a regra do curinga irmão no Realtime Database.
for (const name of readable) {
    if (!account[name]) continue;
    account[name]['.read'] = member('$empresa');
    if (operational.includes(name)) account[name]['.write'] = `(${ownerAdmin('$empresa')} || ${writer('$empresa')})`;
}
writeFileSync(new URL('database.rules.json', import.meta.url), JSON.stringify({ rules }, null, 4) + '\n');
