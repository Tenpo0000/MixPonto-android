import { auth, db } from '../../fireBase_config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { revokeMobile } from '../core/mobile-access.js';
import { createEmployeeAccess } from '../core/employee-credentials.js';

const $ = (id) => document.getElementById(id);
let owner;
let processing = false;
const feedback = (message) => { $('mobile-feedback').textContent = message; };
const fail = (error) => feedback(error.code?.includes('permission')
    ? 'Acesso recusado. Use o titular da empresa e confira as regras publicadas.'
    : error.message || 'Não foi possível concluir. Confira sua conexão.');
async function busy(action) {
    if (processing) return;
    processing = true;
    document.querySelectorAll('button, input, select').forEach((control) => { control.disabled = true; });
    try { await action(); } catch (error) { fail(error); }
    finally {
        processing = false;
        document.querySelectorAll('button, input, select').forEach((control) => { control.disabled = false; });
    }
}
async function refresh() {
    const company = (await get(ref(db, `contas/${owner}`))).val();
    if (company?.meta?.ownerUid !== owner) throw new Error('Este login não tem uma empresa cadastrada. Use a conta titular existente.');
    $('funcionario-mobile').replaceChildren();
    for (const [fid, f] of Object.entries(company.funcionarios || {}).sort((a, b) => a[1].nome.localeCompare(b[1].nome))) {
        if (f.status !== 'ativo') continue;
        $('funcionario-mobile').add(new Option(`${f.nome} · ${f.matricula || fid}`, fid));
    }
    $('lista-acessos').replaceChildren();
    for (const [uid, access] of Object.entries(company.mobileAcessos || {})) {
        const row = document.createElement('p');
        row.textContent = `${company.funcionarios?.[access.funcionarioId]?.nome || access.funcionarioId} · ${access.email} · ${access.ativo ? 'Autorizado' : 'Revogado'}`;
        if (access.ativo) {
            const button = document.createElement('button');
            button.className = 'btn btn-secundario';
            button.textContent = 'Revogar acesso';
            button.onclick = () => {
                if (confirm(`Revogar o acesso de ${access.email}? As batidas serão preservadas.`)) busy(async () => {
                    await revokeMobile(db, owner, uid);
                    await refresh();
                    feedback('Acesso revogado. O histórico foi preservado.');
                });
            };
            row.append(' ', button);
        }
        $('lista-acessos').append(row);
    }
    $('acessos-area').hidden = false;
    $('login-titular').hidden = true;
    $('titular-atual').textContent = auth.currentUser.email;
}
$('login-titular').onsubmit = (event) => {
    event.preventDefault();
    busy(() => signInWithEmailAndPassword(auth, $('email-titular').value.trim(), $('senha-titular').value));
};
$('sair-titular').onclick = () => signOut(auth);
$('vinculo-mobile').onsubmit = (event) => {
    event.preventDefault();
    if ($('senha-mobile').value !== $('confirmar-senha-mobile').value) {
        feedback('Preencha a mesma senha nos dois campos.');
        return;
    }
    busy(async () => {
        feedback('Criando e liberando o acesso. Aguarde a confirmação.');
        try {
            const access = await createEmployeeAccess({ auth, db, fid: $('funcionario-mobile').value,
                email: $('email-mobile').value, password: $('senha-mobile').value });
            await refresh();
            feedback(`Acesso de ${access.email} liberado. Entregue o e-mail e a senha definida ao funcionário; ele já pode entrar no aplicativo.`);
        } finally {
            $('senha-mobile').value = '';
            $('confirmar-senha-mobile').value = '';
        }
    });
};
onAuthStateChanged(auth, (user) => {
    owner = user?.uid;
    $('acessos-area').hidden = true;
    $('login-titular').hidden = !!user;
    $('sair-titular').hidden = !user;
    if (user) refresh().catch(fail);
});
