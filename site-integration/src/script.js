import { auth, db } from '../fireBase_config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { dayKey, mergeRecords, workedMinutes, ZONE } from './core/batidas.mjs';
class SistemaPonto {
    constructor() {
        this.inicializar();
    }

    inicializar() {
        this.configurarMenu();
        this.configurarBotoes();
        this.configurarBusca();
        this.carregarDados();
    }

    configurarMenu() {
        const itensMenu = document.querySelectorAll('.menu-item');
        
        itensMenu.forEach(item => {
            item.addEventListener('click', (e) => {
                itensMenu.forEach(i => i.classList.remove('ativo'));
                item.classList.add('ativo');
                this.exibirNotificacao(`Navegando para: ${item.textContent.trim()}`);
            });
        });
    }

    configurarBotoes() {
        const btnInclusao = document.querySelector('.btn-primario');
        if (btnInclusao) {
            btnInclusao.addEventListener('click', () => {
                this.abrirModalInclusao();
            });
        }

        const btnExportar = document.querySelector('.btn-secundario');
        if (btnExportar) {
            btnExportar.addEventListener('click', () => {
                this.exportarPDF();
            });
        }

        const botoesAjustar = document.querySelectorAll('.btn-ajustar');
        botoesAjustar.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.abrirModalAjuste(e.target);
            });
        });
    }

    configurarBusca() {
        const inputBusca = document.querySelector('.busca');
        if (inputBusca) {
            inputBusca.addEventListener('input', (e) => {
                const termo = e.target.value.toLowerCase();
                this.filtrarRegistros(termo);
            });
        }
    } 

    formatarHora(timestamp) {
    if (!timestamp) return '-----';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    calcularTotal(batidas) {
    if (batidas.length < 2) return '00:00';
    let totalMin = 0;
    for (let i = 0; i + 1 < batidas.length; i += 2) {
        const entrada = new Date(batidas[i]);
        const saida   = new Date(batidas[i + 1]);
        totalMin += (saida - entrada) / 60000;
    }
    const h = Math.floor(totalMin / 60);
    const m = Math.floor(totalMin % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    

    carregarDados() {
        this.sources = { legacy: {}, mobile: {}, employees: {} };
        this.unsubscribers = [];
        for (const id of ['data-inicial', 'data-final']) {
            const input = document.getElementById(id);
            input.value = dayKey();
            input.addEventListener('change', () => this.renderRecords());
        }
        onAuthStateChanged(auth, (user) => {
            this.unsubscribers.forEach((unsubscribe) => unsubscribe());
            this.unsubscribers = [];
            this.sources = { legacy: {}, mobile: {}, employees: {} };
            this.renderRecords();
            if (!user) {
                document.querySelector('.rodape-tabela').textContent = 'Entre como titular em Acesso pelo celular para consultar o cartão ponto.';
                return;
            }
            for (const [key, path] of [['legacy', 'registros'], ['mobile', 'batidasMobile'], ['employees', 'funcionarios']]) {
                this.unsubscribers.push(onValue(ref(db, `contas/${user.uid}/${path}`), (snapshot) => {
                    this.sources[key] = snapshot.val() || {};
                    this.renderRecords();
                }, () => {
                    this.sources = { legacy: {}, mobile: {}, employees: {} };
                    this.renderRecords();
                    document.querySelector('.rodape-tabela').textContent = 'Acesso recusado. Confira o login titular, a conexão e as regras do banco.';
                }));
            }
        });
    }

    renderRecords() {
        const start = document.getElementById('data-inicial').value;
        const end = document.getElementById('data-final').value;
        const tbody = document.getElementById('corpo-tabela');
        tbody.replaceChildren();
        if (!start || !end || start > end) {
            document.querySelector('.rodape-tabela').textContent = 'Informe um intervalo válido, incluindo a data inicial e a final.';
            return;
        }
        this.records = mergeRecords(this.sources.legacy, this.sources.mobile, start, end);
        const groups = new Map();
        for (const record of this.records) {
            const key = `${record.dia}/${record.funcionarioId}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(record);
        }
        for (const records of groups.values()) {
            const first = records[0];
            const employee = this.sources.employees[first.funcionarioId];
            const beforeAdmission = employee?.admissao && first.dia < employee.admissao;
            const tr = document.createElement('tr');
            const values = [
                `${employee?.nome || first.nome || first.funcionarioId} · ${first.dia}`,
                ...[0, 1, 2, 3].map((i) => records[i] ? new Date(records[i].ms).toLocaleTimeString('pt-BR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }) : '-----'),
                beforeAdmission ? 'Anterior ao cadastro' : this.minutesText(workedMinutes(records)),
                records.map((r) => `${new Date(r.ms).toLocaleTimeString('pt-BR', { timeZone: ZONE })} ${r.origem === 'android' ? 'Celular' : r.origem === 'manual' ? 'Manual' : 'RFID'}`).join(' · '),
                beforeAdmission ? 'Bloqueado' : '—',
            ];
            for (const value of values) {
                const td = document.createElement('td');
                td.textContent = value;
                tr.append(td);
            }
            tbody.append(tr);
        }
        const valid = this.records.filter((r) => !this.sources.employees[r.funcionarioId]?.admissao || r.dia >= this.sources.employees[r.funcionarioId].admissao);
        document.querySelector('.cards-info .valor').textContent = this.minutesText(workedMinutes(valid));
        document.querySelector('.rodape-tabela').textContent = `${this.records.length} batida(s) · ${start} a ${end} · Horário de Brasília`;
        this.filtrarRegistros(document.querySelector('.busca').value.toLowerCase());
    }

    minutesText(total) {
        const minutes = Math.floor(total);
        return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }
    filtrarRegistros(termo) {
        const linhas = document.querySelectorAll('table tbody tr');
        
        linhas.forEach(linha => {
            const texto = linha.textContent.toLowerCase();
            if (texto.includes(termo)) {
                linha.style.display = '';
            } else {
                linha.style.display = 'none';
            }
        });
    }

    abrirModalInclusao() {
        const conteudo = `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>Inclusão Manual de Ponto</h2>
                        <button class="fechar-modal">&times;</button>
                    </div>
                    <div class="modal-corpo">
                        <div class="grupo-formulario">
                            <label>Data</label>
                            <input type="date" id="data-inclusao">
                        </div>
                        <div class="linha-formulario">
                            <div class="grupo-formulario">
                                <label>Entrada 1</label>
                                <input type="time" id="entrada1-inclusao">
                            </div>
                            <div class="grupo-formulario">
                                <label>Saída 1</label>
                                <input type="time" id="saida1-inclusao">
                            </div>
                        </div>
                        <div class="linha-formulario">
                            <div class="grupo-formulario">
                                <label>Entrada 2</label>
                                <input type="time" id="entrada2-inclusao">
                            </div>
                            <div class="grupo-formulario">
                                <label>Saída 2</label>
                                <input type="time" id="saida2-inclusao">
                            </div>
                        </div>
                        <div class="grupo-formulario">
                            <label>Justificativa</label>
                            <textarea id="justificativa-inclusao" rows="3"></textarea>
                        </div>
                    </div>
                    <div class="modal-rodape">
                        <button class="btn btn-secundario fechar-modal-btn">Cancelar</button>
                        <button class="btn btn-primario salvar-inclusao">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        this.renderizarModal(conteudo);
        this.configurarModalInclusao();
    }

    configurarModalInclusao() {
        const fecharBotoes = document.querySelectorAll('.fechar-modal, .fechar-modal-btn');
        fecharBotoes.forEach(btn => {
            btn.addEventListener('click', () => this.fecharModal());
        });

        const botaoSalvar = document.querySelector('.salvar-inclusao');
        if (botaoSalvar) {
            botaoSalvar.addEventListener('click', () => {
                this.exibirNotificacao('Esta versão antiga do site não contém gravação manual. Recupere o módulo administrativo antes de usar esta ação.');
                this.fecharModal();
            });
        }
    }

    abrirModalAjuste(botao) {
        const linha = botao.closest('tr');
        const dia = linha.querySelector('.numero').textContent;
        
        const conteudo = `
            <div class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2>Ajustar Ponto - ${dia}</h2>
                        <button class="fechar-modal">&times;</button>
                    </div>
                    <div class="modal-corpo">
                        <div class="grupo-formulario">
                            <label>Tipo de Ajuste</label>
                            <select id="tipo-ajuste">
                                <option>Anexar Atestado</option>
                                <option>Justificar Falta</option>
                                <option>Corrigir Horário</option>
                            </select>
                        </div>
                        <div class="grupo-formulario">
                            <label>Observação</label>
                            <textarea id="obs-ajuste" rows="4"></textarea>
                        </div>
                        <div class="grupo-formulario">
                            <label>Arquivo (opcional)</label>
                            <input type="file" id="arquivo-ajuste">
                        </div>
                    </div>
                    <div class="modal-rodape">
                        <button class="btn btn-secundario fechar-modal-btn">Cancelar</button>
                        <button class="btn btn-primario salvar-ajuste">Salvar Ajuste</button>
                    </div>
                </div>
            </div>
        `;

        this.renderizarModal(conteudo);
        this.configurarModalAjuste();
    }

    configurarModalAjuste() {
        const fecharBotoes = document.querySelectorAll('.fechar-modal, .fechar-modal-btn');
        fecharBotoes.forEach(btn => {
            btn.addEventListener('click', () => this.fecharModal());
        });

        const botaoSalvar = document.querySelector('.salvar-ajuste');
        if (botaoSalvar) {
            botaoSalvar.addEventListener('click', () => {
                this.exibirNotificacao('O módulo de ajustes não está implementado nesta versão do site. Nenhum dado foi gravado.');
                this.fecharModal();
            });
        }
    }

    exportarPDF() {
        window.print();
    }

    renderizarModal(conteudo) {
        const container = document.createElement('div');
        container.id = 'modal-container';
        container.innerHTML = conteudo;
        document.body.appendChild(container);

        const overlay = container.querySelector('.modal-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.fecharModal();
            }
        });
    }

    fecharModal() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.remove();
        }
    }

    exibirNotificacao(mensagem) {
        const notificacao = document.createElement('div');
        notificacao.className = 'notificacao';
        notificacao.textContent = mensagem;
        document.body.appendChild(notificacao);

        setTimeout(() => {
            notificacao.classList.add('visivel');
        }, 10);

        setTimeout(() => {
            notificacao.classList.remove('visivel');
            setTimeout(() => notificacao.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SistemaPonto();

});
