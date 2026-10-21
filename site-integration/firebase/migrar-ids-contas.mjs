import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const codigoValido = value => typeof value === 'string' && /^[1-9][0-9]{0,8}$/.test(value);
export function migrarIdsContas(input) {
    const dados = structuredClone(input);
    const contas = Object.entries(dados.contas || {});
    for (const [id, conta] of contas) if (conta.meta?.ownerUid !== id) throw Error('Há uma conta sem titular coerente. Revise os metadados antes de numerar.');
    const antigo = Object.entries(input.empresasPorId || {}).filter(([, v]) => v);
    const primeiroCodigo = id => Math.min(Infinity, ...antigo.filter(([code, v]) => codigoValido(code) && v.contaId === id).map(([code]) => Number(code)));
    contas.sort(([a], [b]) => primeiroCodigo(a) - primeiroCodigo(b) || a.localeCompare(b));
    const indice = structuredClone(dados.contasPorId || {});
    let ultimo = dados.sequenciaContas ?? 0;
    if (!Number.isSafeInteger(ultimo) || ultimo < 0) throw Error('Sequência de contas inválida.');
    for (const [code, entry] of Object.entries(indice).filter(([, v]) => v)) {
        if (!codigoValido(code) || !entry.contaId) throw Error('Índice de contas inválido.');
        ultimo = Math.max(ultimo, Number(code));
    }
    const utilizados = new Set();
    for (const [id, conta] of contas) {
        const codigo = conta.meta.codigoApp;
        if (!codigo) continue;
        if (!codigoValido(codigo) || utilizados.has(codigo) || (indice[codigo] && indice[codigo].contaId !== id)) throw Error('ID de conta duplicado ou inválido.');
        utilizados.add(codigo); indice[codigo] = { contaId: id }; ultimo = Math.max(ultimo, Number(codigo));
    }
    for (const [id, conta] of contas) {
        if (!conta.meta.codigoApp) {
            if (ultimo >= 999999999) throw Error('Limite da numeração de contas atingido.');
            conta.meta.codigoApp = String(++ultimo);
            indice[conta.meta.codigoApp] = { contaId: id };
        }
        if (conta.empresa) delete conta.empresa.codigoApp;
        for (const empresa of Object.values(conta.empresas || {})) if (empresa) delete empresa.codigoApp;
    }
    dados.contasPorId = indice; dados.sequenciaContas = ultimo;
    delete dados.empresasPorId; delete dados.sequenciaEmpresas;
    return { dados, relatorio: {
        contas: contas.length,
        cadastrosEmpresa: contas.reduce((n, [, c]) => n + Object.values(c.empresas || {}).filter(Boolean).length + (c.empresa?.nome ? 1 : 0), 0),
        sequenciaAnterior: input.sequenciaEmpresas ?? null, sequenciaContas: ultimo,
        ids: contas.map(([id, c]) => ({ contaId: id, codigoApp: c.meta.codigoApp })),
    } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination) throw Error('Uso: node firebase/migrar-ids-contas.mjs exportacao.json contas-numeradas.json');
    const result = migrarIdsContas(JSON.parse(await readFile(source, 'utf8')));
    await writeFile(destination, JSON.stringify(result.dados, null, 2) + '\n', { flag: 'wx' });
    await writeFile(destination + '.relatorio.json', JSON.stringify(result.relatorio, null, 2) + '\n', { flag: 'wx' });
    console.log(`${result.relatorio.contas} conta(s) numerada(s). Nenhum dado enviado ao Firebase.`);
}
