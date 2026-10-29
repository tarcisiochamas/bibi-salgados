// Gestão da Bibi Salgados: pedidos, produção, cardápio com custos e finanças.

import { abrirStore, exportarDados, validarBackup } from './store.js';
import { CATEGORIAS_LANCAMENTO, RETIRADA, APORTE } from './dados-exemplo.js';
import {
  brl, num, pct, lerNumero, arredondarPreco, esc, novoId, codigoPedido, hojeISO, somarDias, mesISO,
  dataCurta, dataComDia, dataRelativa, dataPorExtenso, nomeMes, somarMeses, linkWhats, telefoneBonito,
  telefoneWhats, soDigitos, copiarTexto,
} from './util.js';
import {
  STATUS, STATUS_ABERTOS, STATUS_A_PRODUZIR, PROXIMO_STATUS, porId, custoPorUnidadeBase, calcularFicha,
  custoDoProduto, analisarPreco, totaisPedido, resumoItens, producaoDasDatas, ingredientesDaProducao,
  quantidadeLegivel, resumoDoMes, aReceber, clientesDosPedidos, dataDoRecebimento,
  formasAntecipadas, aguardandoPagamento, PIX_ANTECIPADO, CARTAO_PELO_LINK,
} from './calculos.js';
import { lerChavePix, codigoPix } from './pix.js';
import { icone } from './icones.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);

const TELAS = {
  hoje: ['Hoje', telaHoje],
  pedidos: ['Pedidos', telaPedidos],
  producao: ['Produção', telaProducao],
  cardapio: ['Cardápio', telaCardapio],
  financas: ['Finanças', telaFinancas],
  ajustes: ['Ajustes', telaAjustes],
};

const NAV = [
  ['hoje', 'Hoje', 'hoje'],
  ['pedidos', 'Pedidos', 'pedidos'],
  ['producao', 'Produção', 'producao'],
  ['cardapio', 'Cardápio', 'cardapio'],
  ['financas', 'Finanças', 'financas'],
  ['ajustes', 'Ajustes', 'ajustes'],
];

const ORIGENS = ['WhatsApp', 'Site', 'Instagram', 'Balcão', 'iFood', 'Indicação', 'Outro'];
const FORMAS_PADRAO = ['Pix', 'Dinheiro', 'Cartão na entrega', 'Cartão de crédito', 'Vale-refeição'];
const UNIDADES_COMPRA = {
  kg: ['g', 1000, 'quilo (kg)'],
  g: ['g', 1, 'grama (g)'],
  L: ['ml', 1000, 'litro (L)'],
  ml: ['ml', 1, 'mililitro (ml)'],
  un: ['un', 1, 'unidade'],
};

let store;
const ui = {
  tela: 'hoje',
  filtroPedidos: 'abertos',
  buscaPedidos: '',
  abaPedidos: 'pedidos',
  periodoProducao: 'hoje',
  dataProducao: hojeISO(),
  abaCardapio: 'produtos',
  mes: mesISO(hojeISO()),
  ajustesSujo: false,
  backupPendente: null,
};

const dados = () => store.dados;
const config = () => store.dados.config;

// ---------------------------------------------------------------------------
// Pequenos ajudantes
// ---------------------------------------------------------------------------

function plural(n, um, varios) {
  return `${num(n)} ${n === 1 ? um : varios}`;
}

function capitalizar(t) {
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

function soma(lista, f) {
  return lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
}

function semAcento(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ordenarPedidos(lista, desc = false) {
  const chave = (p) => `${p.dataEntrega || ''} ${p.hora || '99:99'}`;
  return [...lista].sort((a, b) => (desc ? chave(b).localeCompare(chave(a)) : chave(a).localeCompare(chave(b))));
}

const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR');

function agrupar(lista, chave) {
  const m = new Map();
  for (const x of lista) {
    const k = chave(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m.entries()];
}

function dinheiroInput(v) {
  return (Number(v) || 0).toFixed(2).replace('.', ',');
}

function numeroInput(v) {
  if (v === '' || v == null) return '';
  return String(Math.round(Number(v) * 1000) / 1000).replace('.', ',');
}

function vazio(texto) {
  return `<p class="vazio">${esc(texto)}</p>`;
}

function kpi(rotulo, valor, nota = '', classe = '') {
  return `
    <div class="kpi ${classe}">
      <span class="kpi-rotulo">${esc(rotulo)}</span>
      <span class="kpi-valor">${esc(valor)}</span>
      ${nota ? `<span class="kpi-nota">${esc(nota)}</span>` : ''}
    </div>`;
}

function rotuloVenda(p) {
  const rende = Number(p.rende) || 1;
  if (rende <= 1) return 'por unidade';
  if (p.unidade === 'cento') return Number(p.passo) < 1 ? 'por cento · aceita meio cento' : 'por cento';
  return `por ${p.unidade}`;
}

function rotuloPreco(it) {
  if ((Number(it.rende) || 1) <= 1) return 'cada';
  return it.unidade === 'cento' ? 'o cento' : `o ${it.unidade}`;
}

function unidadeDoItem(it) {
  if ((Number(it.rende) || 1) <= 1) return 'un';
  if (it.unidade === 'cento') return Number(it.qtd) === 1 ? 'cento' : 'centos';
  const palavra = String(it.unidade || 'pacote').split(' ')[0];
  return Number(it.qtd) === 1 ? palavra : `${palavra}s`;
}

function compraLegivel(ing) {
  let u = ing.compraUnidade;
  if (!UNIDADES_COMPRA[u] || UNIDADES_COMPRA[u][0] !== ing.unidade) {
    if (ing.unidade === 'g') u = ing.qtdEmbalagem >= 1000 ? 'kg' : 'g';
    else if (ing.unidade === 'ml') u = ing.qtdEmbalagem >= 1000 ? 'L' : 'ml';
    else u = 'un';
  }
  return { qtd: (Number(ing.qtdEmbalagem) || 0) / UNIDADES_COMPRA[u][1], u };
}

function precoReferencia(ing) {
  const cu = custoPorUnidadeBase(ing);
  if (ing.unidade === 'g') return [cu * 1000, 'kg'];
  if (ing.unidade === 'ml') return [cu * 1000, 'L'];
  return [cu, 'un'];
}

function mensagemErro(e) {
  if (e?.code === 'permission-denied') return 'este login não tem permissão.';
  return e?.message || 'erro desconhecido.';
}

function aviso(texto, tipo = '') {
  document.querySelectorAll('.aviso-rapido').forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = `aviso-rapido ${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = texto;
  ($('#janela').open ? $('#janela') : document.body).appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 2600);
}

// Botões perigosos pedem um segundo toque.
function precisaConfirmar(botao) {
  if (botao.dataset.armado) return false;
  botao.dataset.armado = '1';
  const original = botao.innerHTML;
  botao.textContent = botao.dataset.confirmar;
  botao.classList.add('btn-perigo');
  setTimeout(() => {
    if (!botao.isConnected) return;
    delete botao.dataset.armado;
    botao.innerHTML = original;
    botao.classList.remove('btn-perigo');
  }, 5000);
  return true;
}

// ---------------------------------------------------------------------------
// Início, login e navegação
// ---------------------------------------------------------------------------

async function iniciar() {
  try {
    store = await abrirStore();
  } catch (e) {
    console.error(e);
    $('#tela-carregando').textContent = 'Não foi possível abrir a gestão. Confira a internet e recarregue a página.';
    return;
  }
  $('#tela-carregando').hidden = true;
  ui.tela = telaDoEndereco();
  store.aoMudar(() => desenhar());
  store.aoFalhar((e) => aviso(`Não foi possível salvar: ${mensagemErro(e)}`, 'erro'));
  store.aoMudarUsuario(mostrarConformeUsuario);
  mostrarConformeUsuario(store.usuario);

  window.addEventListener('hashchange', () => {
    const t = telaDoEndereco();
    if (t === ui.tela) return;
    ui.tela = t;
    ui.ajustesSujo = false;
    desenhar();
    window.scrollTo(0, 0);
  });
  window.addEventListener('online', desenharSinc);
  window.addEventListener('offline', desenharSinc);
}

function telaDoEndereco() {
  const h = location.hash.replace('#', '');
  return TELAS[h] ? h : 'hoje';
}

function mostrarConformeUsuario(usuario) {
  const dentro = store.modo === 'local' || Boolean(usuario);
  $('#tela-login').hidden = dentro;
  $('#app').hidden = !dentro;
  if (!dentro) {
    $('#login-marca').alt = config().nome;
    if ($('#janela').open) $('#janela').close();
    return;
  }
  desenhar();
}

function irPara(tela) {
  ui.tela = TELAS[tela] ? tela : 'hoje';
  ui.ajustesSujo = false;
  try {
    if (location.hash !== `#${ui.tela}`) location.hash = ui.tela;
  } catch {
    // Alguns visualizadores não deixam mudar o endereço; a tela muda do mesmo jeito.
  }
  desenhar();
  window.scrollTo(0, 0);
}

function desenhar() {
  if (!store || $('#app').hidden) return;
  desenharSinc();
  desenharNav();
  $('#g-marca img').alt = config().nome;
  const main = $('#g-conteudo');
  if (!store.carregado) {
    main.innerHTML = vazio('Carregando seus dados…');
    return;
  }
  if (store.erro) {
    main.innerHTML = htmlErroAcesso();
    return;
  }
  if (ui.tela === 'ajustes' && ui.ajustesSujo) return;
  const [titulo, desenharTela] = TELAS[ui.tela];
  main.innerHTML = desenharTela();
  document.title = `${titulo} · Gestão · ${config().nome}`;
}

function desenharSinc() {
  const el = $('#g-sinc');
  if (store.modo === 'local') {
    el.className = 'g-sinc';
    el.innerHTML = `${icone('aparelho')}<span>Neste aparelho</span>`;
    el.title = 'Os dados estão guardados só neste navegador.';
    return;
  }
  const online = navigator.onLine;
  el.className = `g-sinc${online ? '' : ' offline'}`;
  el.innerHTML = `${icone('nuvem')}<span>${online ? 'Na nuvem' : 'Sem internet'}</span>`;
  el.title = online
    ? 'Tudo salvo na nuvem.'
    : 'Sem internet: o que você fizer fica guardado no aparelho e sobe quando a conexão voltar.';
}

function desenharNav() {
  const novos = dados().pedidos.filter((p) => p.status === 'novo').length;
  $('#g-nav').innerHTML = NAV.map(([id, rotulo, ic]) => `
    <a href="#${id}" data-ir="${id}" class="${id === 'ajustes' ? 'so-largo' : ''}" ${ui.tela === id ? 'aria-current="page"' : ''}>
      ${icone(ic)}<span>${rotulo}</span>
      ${id === 'pedidos' && novos ? `<span class="nav-badge" aria-label="${plural(novos, 'novo', 'novos')}">${novos}</span>` : ''}
    </a>`).join('');
}

function htmlErroAcesso() {
  if (store.erro === 'sem-permissao') {
    return `
      <div class="passos">
        <h2>Este login não tem acesso</h2>
        <p>Você entrou como <strong>${esc(store.usuario?.email || '')}</strong>, mas os dados da ${esc(config().nome)} só abrem com o e-mail do dono do negócio.</p>
        <div class="acoes"><button class="btn" data-acao="sair">${icone('sair')} Entrar com outro e-mail</button></div>
      </div>`;
  }
  return `
    <div class="passos">
      <h2>Não foi possível carregar os dados</h2>
      <p class="suave">${esc(store.erro)}</p>
      <div class="acoes"><button class="btn" onclick="location.reload()">Recarregar</button></div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Linhas reaproveitadas
// ---------------------------------------------------------------------------

function linhaPedido(p, { acao = 'status', mostrarData = false } = {}) {
  const prox = PROXIMO_STATUS[p.status];
  const entrega = p.entrega?.tipo === 'entrega';
  let botao = '';
  if (acao === 'status' && prox) {
    botao = `<button type="button" class="btn btn-pequeno btn-contorno" data-acao="avancar" data-id="${esc(p.id)}">${prox[1]}</button>`;
  } else if (acao === 'receber' && !p.pagamento?.pago) {
    botao = `<button type="button" class="btn btn-pequeno btn-contorno" data-acao="recebi" data-id="${esc(p.id)}">${icone('certo')} Recebi</button>`;
  }
  let pago = '';
  if (aguardandoPagamento(p)) pago = '<span class="pill aguardando sem-ponto">Aguardando pagamento</span>';
  else if (p.status !== 'cancelado') {
    pago = p.pagamento?.pago ? '<span class="pill pago sem-ponto">Pago</span>' : '<span class="pill a-pagar sem-ponto">A pagar</span>';
  }
  return `
    <div class="pedido-linha${p.status === 'cancelado' ? ' cancelado' : ''}">
      <button type="button" class="pl-abrir" data-abrir-pedido="${esc(p.id)}">
        <span class="pl-hora num">${esc(mostrarData ? dataCurta(p.dataEntrega) : (p.hora || '––:––'))}</span>
        <span class="pl-principal">
          <span class="pl-nome">${esc(p.cliente?.nome || 'Sem nome')}</span>
          <span class="pl-itens">${esc(resumoItens(p.itens))}</span>
          <span class="pl-meta">
            <span class="pill st-${esc(p.status)}">${esc(STATUS[p.status] || p.status)}</span>
            ${pago}
            <span class="pl-tag">${icone(entrega ? 'entrega' : 'loja')}${entrega ? 'Entrega' : 'Retirada'}</span>
            ${p.origem === 'Site' ? '<span class="pl-tag">pelo site</span>' : ''}
          </span>
        </span>
      </button>
      <div class="pl-lado">
        <span class="pl-total num">${brl(p.total)}</span>
        ${botao}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Tela: Hoje
// ---------------------------------------------------------------------------

function htmlPrimeirosPassos() {
  const d = dados();
  const passos = [];
  if (!d.produtos.length) {
    passos.push(['O cardápio está vazio. Comece pelo cardápio de exemplo e ajuste nomes e preços, ou cadastre do zero.',
      '<button class="btn btn-pequeno" data-acao="usar-cardapio-exemplo">Usar cardápio de exemplo</button>']);
  }
  if (!config().whatsapp) {
    passos.push(['Coloque o número de WhatsApp que vai receber os pedidos do site.',
      '<button class="btn btn-pequeno btn-contorno" data-ir="ajustes">Abrir ajustes</button>']);
  }
  if (config().cobrarAntes && config().cobrarAntesPix && !lerChavePix(config().chavePix)) {
    passos.push(['Para cobrar no Pix antes da entrega, coloque uma chave Pix válida em Ajustes.',
      '<button class="btn btn-pequeno btn-contorno" data-ir="ajustes">Abrir ajustes</button>']);
  }
  const exemplos = d.pedidos.filter((p) => p.exemplo).length + d.lancamentos.filter((l) => l.exemplo).length;
  if (exemplos) {
    passos.push(['Os pedidos e lançamentos com nomes fictícios são exemplos para você ver como funciona. Apague quando terminar de explorar.',
      `<button class="btn btn-pequeno btn-contorno" data-acao="apagar-exemplos" data-confirmar="Toque de novo para apagar">Apagar exemplos</button>`]);
  }
  if (d.produtos.length && !d.fichas.length) {
    passos.push(['Cadastre a ficha técnica dos produtos para saber o custo e o lucro de cada salgado.',
      '<button class="btn btn-pequeno btn-contorno" data-ir="cardapio">Abrir cardápio</button>']);
  }
  if (!passos.length) return '';
  return `
    <section class="passos" aria-labelledby="passos-titulo">
      <h2 id="passos-titulo">Primeiros passos</h2>
      <ul>${passos.map(([texto, botao]) => `<li><span>${esc(texto)}</span>${botao}</li>`).join('')}</ul>
    </section>`;
}

function telaHoje() {
  const d = dados();
  const hoje = hojeISO();
  const validos = d.pedidos.filter((p) => p.status !== 'cancelado');
  const deHoje = ordenarPedidos(validos.filter((p) => p.dataEntrega === hoje));
  const deAmanha = ordenarPedidos(validos.filter((p) => p.dataEntrega === somarDias(hoje, 1)));
  const atrasados = ordenarPedidos(d.pedidos.filter((p) => p.dataEntrega < hoje && STATUS_ABERTOS.includes(p.status)));
  const novos = d.pedidos.filter((p) => p.status === 'novo');
  const aguardando = d.pedidos.filter(aguardandoPagamento);
  const receber = aReceber(d.pedidos);
  const mes = resumoDoMes(mesISO(hoje), d.pedidos, d.lancamentos);
  const producao = producaoDasDatas(d.pedidos, [hoje]);

  return `
    <div class="g-titulo">
      <div><p class="g-data">${esc(capitalizar(dataPorExtenso(hoje)))}</p><h1>Hoje</h1></div>
      <button class="btn" data-acao="novo-pedido">${icone('mais')} Novo pedido</button>
    </div>
    ${htmlPrimeirosPassos()}
    ${novos.length ? `
      <button class="alerta-novos" data-ir="pedidos" data-filtro="novos">
        <span>${novos.length === 1 ? '1 pedido novo esperando confirmação' : `${novos.length} pedidos novos esperando confirmação`}</span>
        ${icone('avancar')}
      </button>` : ''}
    ${aguardando.length ? `
      <button class="alerta-novos alerta-pagamento" data-ir="pedidos" data-filtro="aguardando">
        <span>${aguardando.length === 1 ? '1 pedido aguardando pagamento antes da entrega' : `${aguardando.length} pedidos aguardando pagamento antes da entrega`}</span>
        ${icone('avancar')}
      </button>` : ''}
    <div class="kpis">
      ${kpi('Pedidos de hoje', num(deHoje.length), brl(soma(deHoje, (p) => p.total)))}
      ${kpi('A receber', brl(soma(receber, (p) => p.total)), plural(receber.length, 'pedido', 'pedidos'))}
      ${kpi('Vendas do mês', brl(mes.vendas), 'pedidos pagos e vendas avulsas')}
      ${kpi('Lucro do mês', brl(mes.lucro), mes.margem != null ? `margem de ${pct(mes.margem)}` : 'sem vendas ainda', mes.lucro < 0 ? 'negativo' : '')}
    </div>
    ${atrasados.length ? `
      <section class="g-secao">
        <h2>Ficaram para trás</h2>
        <p class="suave">Pedidos de dias anteriores que ainda não foram marcados como entregues.</p>
        <div class="lista">${atrasados.map((p) => linhaPedido(p, { mostrarData: true })).join('')}</div>
      </section>` : ''}
    <section class="g-secao">
      <h2>Entregas e retiradas de hoje</h2>
      ${deHoje.length ? `<div class="lista">${deHoje.map((p) => linhaPedido(p)).join('')}</div>` : vazio('Nenhum pedido para hoje.')}
    </section>
    <section class="g-secao">
      <div class="g-secao-topo">
        <h2>Para produzir hoje</h2>
        <button class="btn btn-pequeno btn-contorno" data-ir="producao">Ver produção</button>
      </div>
      ${producao.length ? `
        <div class="tabela-rolagem"><table class="tabela">
          <tbody>${producao.map((l) => `<tr><td>${esc(l.nome)}</td><td class="direita"><strong>${num(l.unidades)} un</strong></td></tr>`).join('')}</tbody>
        </table></div>` : vazio('Nada em aberto para produzir hoje.')}
    </section>
    <section class="g-secao">
      <h2>Amanhã</h2>
      ${deAmanha.length ? `<div class="lista">${deAmanha.map((p) => linhaPedido(p)).join('')}</div>` : vazio('Nenhum pedido para amanhã ainda.')}
    </section>`;
}

// ---------------------------------------------------------------------------
// Tela: Pedidos
// ---------------------------------------------------------------------------

function filtrosPedidos() {
  const hoje = hojeISO();
  const fim = somarDias(hoje, 6);
  return {
    abertos: ['Em aberto', (p) => STATUS_ABERTOS.includes(p.status), false],
    novos: ['Novos', (p) => p.status === 'novo', false],
    ...(config().cobrarAntes || dados().pedidos.some(aguardandoPagamento)
      ? { aguardando: ['Aguardando pagamento', aguardandoPagamento, false] } : {}),
    hoje: ['Hoje', (p) => p.dataEntrega === hoje && p.status !== 'cancelado', false],
    semana: ['Próximos 7 dias', (p) => p.dataEntrega >= hoje && p.dataEntrega <= fim && p.status !== 'cancelado', false],
    areceber: ['A receber', (p) => p.status !== 'cancelado' && !p.pagamento?.pago, false],
    entregues: ['Entregues', (p) => p.status === 'entregue', true],
    cancelados: ['Cancelados', (p) => p.status === 'cancelado', true],
    todos: ['Todos', () => true, true],
  };
}

function telaPedidos() {
  const aba = ui.abaPedidos;
  return `
    <div class="g-titulo">
      <h1>Pedidos</h1>
      <button class="btn" data-acao="novo-pedido">${icone('mais')} Novo pedido</button>
    </div>
    <div class="segmentado" role="group" aria-label="Ver">
      <button type="button" data-acao="aba-pedidos" data-valor="pedidos" aria-pressed="${aba === 'pedidos'}">Pedidos</button>
      <button type="button" data-acao="aba-pedidos" data-valor="clientes" aria-pressed="${aba === 'clientes'}">Clientes</button>
    </div>
    ${aba === 'clientes' ? htmlClientes() : `
      <div class="filtros">
        <div class="chips" role="group" aria-label="Filtrar pedidos">${htmlChipsPedidos()}</div>
        <label class="busca">
          <span class="so-leitor">Buscar pedidos</span>
          ${icone('busca')}
          <input type="search" id="busca-pedidos" placeholder="Buscar por nome, código ou salgado" value="${esc(ui.buscaPedidos)}">
        </label>
      </div>
      <div id="lista-pedidos">${htmlListaPedidos()}</div>`}`;
}

function htmlChipsPedidos() {
  const f = filtrosPedidos();
  const contar = ['abertos', 'novos', 'aguardando', 'areceber'];
  return Object.entries(f).map(([id, [rotulo, filtro]]) => {
    const n = contar.includes(id) ? dados().pedidos.filter(filtro).length : null;
    return `<button type="button" class="chip" data-acao="filtro-pedidos" data-valor="${id}" aria-pressed="${ui.filtroPedidos === id}">${rotulo}${n != null ? `<span class="conta">${n}</span>` : ''}</button>`;
  }).join('');
}

function htmlListaPedidos() {
  const [, filtro, desc] = filtrosPedidos()[ui.filtroPedidos] || filtrosPedidos().abertos;
  const termo = semAcento(ui.buscaPedidos.trim());
  let lista = dados().pedidos.filter(filtro);
  if (termo) {
    lista = lista.filter((p) => semAcento(`${p.cliente?.nome} ${p.codigo} ${p.cliente?.telefone} ${resumoItens(p.itens)}`).includes(termo));
  }
  lista = ordenarPedidos(lista, desc);
  if (!lista.length) return vazio(termo ? 'Nenhum pedido encontrado.' : 'Nenhum pedido aqui.');
  return agrupar(lista, (p) => p.dataEntrega || '').map(([data, doDia]) => `
    <h3 class="grupo-data">${esc(data ? capitalizar(dataRelativa(data)) : 'Sem data')}</h3>
    <div class="lista">${doDia.map((p) => linhaPedido(p)).join('')}</div>`).join('');
}

function htmlClientes() {
  const clientes = clientesDosPedidos(dados().pedidos);
  if (!clientes.length) return vazio('Os clientes aparecem aqui conforme você registra pedidos.');
  return `
    <p class="suave">${plural(clientes.length, 'cliente', 'clientes')}, de quem mais comprou para quem menos comprou.</p>
    <div class="lista">${clientes.map((c) => `
      <div class="cliente-linha">
        <button type="button" class="botao-limpo linha-info" data-acao="abrir-cliente" data-valor="${esc(c.nome)}">
          <strong>${esc(c.nome)}</strong>
          <span class="suave">${plural(c.pedidos, 'pedido', 'pedidos')} · último em ${esc(dataCurta(c.ultimo))}</span>
        </button>
        <span class="linha-valores">
          <strong class="num">${brl(c.total)}</strong>
          ${c.telefone ? `<a class="pl-tag" href="${esc(linkWhats(c.telefone))}" target="_blank" rel="noopener">${icone('conversa')}${esc(telefoneBonito(c.telefone))}</a>` : ''}
        </span>
      </div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Tela: Produção
// ---------------------------------------------------------------------------

function datasDaProducao() {
  const hoje = hojeISO();
  if (ui.periodoProducao === 'amanha') return [somarDias(hoje, 1)];
  if (ui.periodoProducao === 'semana') return Array.from({ length: 7 }, (_, i) => somarDias(hoje, i));
  if (ui.periodoProducao === 'data') return [ui.dataProducao];
  return [hoje];
}

function textoPeriodo(datas) {
  if (datas.length > 1) return `De ${dataComDia(datas[0])} a ${dataComDia(datas[datas.length - 1])}`;
  return capitalizar(dataRelativa(datas[0])) + (['Hoje', 'Amanhã', 'Ontem'].includes(dataRelativa(datas[0])) ? `, ${dataComDia(datas[0])}` : '');
}

function dadosDaProducao() {
  const d = dados();
  const datas = datasDaProducao();
  const producao = producaoDasDatas(d.pedidos, datas);
  const ingredientes = ingredientesDaProducao(producao, porId(d.fichas), porId(d.ingredientes));
  return { datas, producao, ingredientes };
}

function telaProducao() {
  const { datas, producao, ingredientes } = dadosDaProducao();
  const pedidos = ordenarPedidos(dados().pedidos.filter((p) => datas.includes(p.dataEntrega) && STATUS_A_PRODUZIR.includes(p.status)));
  const totalUn = soma(producao, (l) => l.unidades);
  const periodos = [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Próximos 7 dias']];

  return `
    <div class="g-titulo">
      <div><p class="g-data">${esc(textoPeriodo(datas))}</p><h1>Produção</h1></div>
    </div>
    <div class="filtros">
      <div class="chips" role="group" aria-label="Período">
        ${periodos.map(([id, r]) => `<button type="button" class="chip" data-acao="periodo-producao" data-valor="${id}" aria-pressed="${ui.periodoProducao === id}">${r}</button>`).join('')}
      </div>
      <label class="campo" style="max-width:240px"><span>Ou escolha um dia</span>
        <input type="date" id="data-producao" value="${esc(ui.dataProducao)}">
      </label>
    </div>
    <section class="g-secao">
      <h2>O que produzir</h2>
      ${producao.length ? `
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th>Salgado</th><th class="direita">Unidades</th><th class="direita">Pedidos</th></tr></thead>
          <tbody>${producao.map((l) => `
            <tr><td>${esc(l.nome)}</td><td class="direita grande">${num(l.unidades)}</td><td class="direita">${l.pedidos}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td>Total</td><td class="direita">${num(totalUn)} un</td><td></td></tr></tfoot>
        </table></div>` : vazio('Nenhum pedido em aberto para este período.')}
      <p class="nota">Entram os pedidos novos, confirmados e em produção. Os prontos, entregues e cancelados ficam de fora.</p>
    </section>
    ${producao.length ? `
      <section class="g-secao">
        <div class="g-secao-topo">
          <h2>Ingredientes que vão ser usados</h2>
          ${ingredientes.lista.length ? `<button class="btn btn-pequeno btn-contorno" data-acao="copiar-compras">${icone('copiar')} Copiar lista</button>` : ''}
        </div>
        ${ingredientes.lista.length ? `
          <div class="tabela-rolagem"><table class="tabela">
            <thead><tr><th>Ingrediente</th><th class="direita">Quantidade</th><th class="direita">Custo</th></tr></thead>
            <tbody>${ingredientes.lista.map((l) => `
              <tr><td>${esc(l.ingrediente.nome)}</td><td class="direita">${esc(quantidadeLegivel(l.qtd, l.ingrediente.unidade))}</td><td class="direita">${brl(l.custo)}</td></tr>`).join('')}
            </tbody>
            <tfoot><tr><td>Custo dos ingredientes</td><td></td><td class="direita">${brl(ingredientes.custoTotal)}</td></tr></tfoot>
          </table></div>` : ''}
        ${ingredientes.semFicha.length ? `<p class="nota">Sem ficha técnica, por isso fora da conta: ${esc(ingredientes.semFicha.join(', '))}.</p>` : ''}
      </section>` : ''}
    ${pedidos.length ? `
      <section class="g-secao">
        <h2>Pedidos do período</h2>
        <div class="lista">${pedidos.map((p) => linhaPedido(p, { mostrarData: datas.length > 1 })).join('')}</div>
      </section>` : ''}`;
}

function textoListaCompras() {
  const { datas, ingredientes } = dadosDaProducao();
  const linhas = [`Ingredientes · ${config().nome} · ${textoPeriodo(datas)}`, ''];
  for (const l of ingredientes.lista) linhas.push(`- ${l.ingrediente.nome}: ${quantidadeLegivel(l.qtd, l.ingrediente.unidade)}`);
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Tela: Cardápio e custos
// ---------------------------------------------------------------------------

function telaCardapio() {
  const aba = ui.abaCardapio;
  return `
    <div class="g-titulo">
      <h1>Cardápio e custos</h1>
      ${aba === 'produtos'
        ? `<button class="btn" data-acao="novo-produto">${icone('mais')} Novo produto</button>`
        : `<button class="btn" data-acao="novo-ingrediente">${icone('mais')} Novo ingrediente</button>`}
    </div>
    <div class="segmentado" role="group" aria-label="Ver">
      <button type="button" data-acao="aba-cardapio" data-valor="produtos" aria-pressed="${aba === 'produtos'}">Produtos</button>
      <button type="button" data-acao="aba-cardapio" data-valor="ingredientes" aria-pressed="${aba === 'ingredientes'}">Ingredientes</button>
    </div>
    ${aba === 'produtos' ? htmlProdutos() : htmlIngredientes()}`;
}

function htmlProdutos() {
  const d = dados();
  if (!d.produtos.length) {
    return `
      <div class="passos">
        <h2>Nenhum produto ainda</h2>
        <p class="suave">Comece pelo cardápio de exemplo, com fichas técnicas prontas, e ajuste para o seu jeito.</p>
        <div class="acoes">
          <button class="btn" data-acao="usar-cardapio-exemplo">Usar cardápio de exemplo</button>
          <button class="btn btn-contorno" data-acao="novo-produto">Cadastrar do zero</button>
        </div>
      </div>`;
  }
  const ingMap = porId(d.ingredientes);
  const fichas = porId(d.fichas);
  const alvo = Number(config().cmvAlvo) || 0.35;
  const grupos = agrupar([...d.produtos].sort(porOrdem), (p) => p.categoria || 'Sem categoria');
  return `
    <p class="nota">O <strong>custo</strong> vem da ficha técnica de cada produto. A meta é ingredientes e embalagem ficarem em até <strong>${pct(alvo)}</strong> do preço; o resto paga o seu trabalho, gás, entregas e o lucro. <a href="#ajustes" data-ir="ajustes">Mudar a meta</a></p>
    ${grupos.map(([categoria, lista]) => `
      <section class="g-secao">
        <h2>${esc(categoria)}</h2>
        <div class="lista">${lista.map((p) => linhaProduto(p, fichas[p.id], ingMap, alvo)).join('')}</div>
      </section>`).join('')}`;
}

function linhaProduto(p, ficha, ingMap, alvo) {
  const custo = custoDoProduto(p, ficha, ingMap);
  const a = analisarPreco(Number(p.preco) || 0, custo, alvo);
  const pill = a.nivel === 'sem'
    ? '<span class="pill sem">Sem ficha</span>'
    : `<span class="pill ${a.nivel}">Custo ${pct(a.cmv)}</span>`;
  return `
    <button type="button" class="produto-linha${p.ativo === false ? ' fora-do-site' : ''}" data-abrir-produto="${esc(p.id)}">
      <span class="linha-info">
        <strong>${esc(p.nome)}</strong>
        <span class="suave">${esc(rotuloVenda(p))}${p.ativo === false ? ' · fora do site' : ''}</span>
      </span>
      <span class="linha-valores">
        <strong class="num">${brl(p.preco)}</strong>
        ${custo != null ? `<span class="suave num">custo ${brl(custo)}</span>` : ''}
        ${pill}
      </span>
    </button>`;
}

function produtosQueUsam(ingredienteId) {
  const d = dados();
  const nomes = porId(d.produtos);
  return d.fichas
    .filter((f) => (f.itens || []).some((i) => i.ingredienteId === ingredienteId))
    .map((f) => nomes[f.id]?.nome)
    .filter(Boolean);
}

function htmlIngredientes() {
  const d = dados();
  if (!d.ingredientes.length) return vazio('Nenhum ingrediente cadastrado. Cadastre o que você compra para montar as fichas técnicas.');
  const lista = [...d.ingredientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return `
    <p class="nota">Quando um preço mudar no mercado, atualize aqui: o custo de todos os produtos que usam esse ingrediente muda junto.</p>
    <div class="lista">${lista.map((ing) => {
      const { qtd, u } = compraLegivel(ing);
      const [preco, ref] = precoReferencia(ing);
      const usos = produtosQueUsam(ing.id).length;
      return `
        <button type="button" class="ingrediente-linha" data-abrir-ingrediente="${esc(ing.id)}">
          <span class="linha-info">
            <strong>${esc(ing.nome)}</strong>
            <span class="suave">Compra: ${esc(num(qtd, 3))} ${esc(u)} por ${brl(ing.precoEmbalagem)}${usos ? ` · em ${plural(usos, 'produto', 'produtos')}` : ''}</span>
          </span>
          <span class="linha-valores">
            <strong class="num">${brl(preco)}</strong>
            <span class="suave">o ${esc(ref)}</span>
          </span>
        </button>`;
    }).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Tela: Finanças
// ---------------------------------------------------------------------------

function telaFinancas() {
  const d = dados();
  const r = resumoDoMes(ui.mes, d.pedidos, d.lancamentos);
  const receber = ordenarPedidos(aReceber(d.pedidos));
  const maior = Math.max(1, ...r.porCategoria.map(([, v]) => v));
  const movimentos = [
    ...r.vendasPedidos.map((p) => ({ data: dataDoRecebimento(p), p })),
    ...r.lancamentos.map((l) => ({ data: l.data, l })),
  ].sort((a, b) => b.data.localeCompare(a.data));

  return `
    <div class="g-titulo">
      <h1>Finanças</h1>
      <div class="mes-nav">
        <button type="button" class="btn-icone" data-acao="mes" data-valor="-1" aria-label="Mês anterior">${icone('voltar')}</button>
        <strong>${esc(capitalizar(nomeMes(ui.mes)))}</strong>
        <button type="button" class="btn-icone" data-acao="mes" data-valor="1" aria-label="Próximo mês">${icone('avancar')}</button>
      </div>
    </div>
    <div class="kpis">
      ${kpi('Vendas recebidas', brl(r.vendas), plural(r.vendasPedidos.length, 'pedido pago', 'pedidos pagos'))}
      ${kpi('Despesas', brl(r.totalDespesas), 'sem contar suas retiradas')}
      ${kpi('Lucro', brl(r.lucro), r.margem != null ? `margem de ${pct(r.margem)}` : 'sem vendas no mês', r.lucro < 0 ? 'negativo' : '')}
      ${kpi('Sobrou no caixa', brl(r.caixa), 'lucro − retiradas + aportes', r.caixa < 0 ? 'negativo' : '')}
    </div>
    <div class="caixa-resumo">
      <span>Suas retiradas: <strong>${brl(r.totalRetiradas)}</strong></span>
      <span>Dinheiro que você colocou: <strong>${brl(r.totalAportes)}</strong></span>
    </div>
    <div class="acoes">
      <button class="btn" data-acao="novo-lancamento" data-tipo="saida">${icone('mais')} Despesa</button>
      <button class="btn btn-contorno" data-acao="novo-lancamento" data-tipo="entrada">${icone('mais')} Entrada</button>
      <button class="btn btn-contorno" data-acao="novo-lancamento" data-tipo="saida" data-categoria="${esc(RETIRADA)}">${icone('dinheiro')} Retirada (seu salário)</button>
    </div>
    <section class="g-secao">
      <h2>Para onde foi o dinheiro</h2>
      ${r.porCategoria.length ? `<div class="barras">${r.porCategoria.map(([cat, v]) => `
        <div class="barra-item">
          <div class="barra-rotulo"><span>${esc(cat)}</span><span>${brl(v)}</span></div>
          <div class="barra-trilho"><span style="width:${((v / maior) * 100).toFixed(1)}%"></span></div>
        </div>`).join('')}</div>` : vazio('Nenhuma despesa registrada neste mês.')}
    </section>
    <section class="g-secao">
      <h2>A receber</h2>
      ${receber.length ? `<div class="lista">${receber.map((p) => linhaPedido(p, { acao: 'receber', mostrarData: true })).join('')}</div>` : vazio('Nenhum pedido esperando pagamento.')}
    </section>
    <section class="g-secao">
      <h2>Movimentações do mês</h2>
      ${movimentos.length ? `<div class="lista">${movimentos.map(htmlMovimento).join('')}</div>` : vazio('Nada registrado neste mês.')}
    </section>
    <div class="nota">
      <strong>Dinheiro do negócio separado do seu.</strong> Receba as vendas numa conta ou chave Pix só do negócio, pague as compras com esse dinheiro e tire um valor fixo por semana ou por mês como o seu salário, registrando como retirada. Assim o lucro daqui é o lucro de verdade.
    </div>`;
}

function htmlMovimento(m) {
  if (m.p) {
    return `
      <button type="button" class="lanc-linha" data-abrir-pedido="${esc(m.p.id)}">
        <span class="linha-info">
          <strong>Pedido #${esc(m.p.codigo)} · ${esc(m.p.cliente?.nome || '')}</strong>
          <span class="suave">${esc(dataCurta(m.data))} · Venda · ${esc(m.p.pagamento?.forma || '')}</span>
        </span>
        <span class="valor-entrada num">+ ${brl(m.p.total)}</span>
      </button>`;
  }
  const l = m.l;
  return `
    <button type="button" class="lanc-linha" data-abrir-lancamento="${esc(l.id)}">
      <span class="linha-info">
        <strong>${esc(l.descricao || l.categoria)}</strong>
        <span class="suave">${esc(dataCurta(l.data))} · ${esc(l.categoria)}</span>
      </span>
      <span class="${l.tipo === 'entrada' ? 'valor-entrada' : 'valor-saida'} num">${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}</span>
    </button>`;
}

// ---------------------------------------------------------------------------
// Tela: Ajustes
// ---------------------------------------------------------------------------

function telaAjustes() {
  const c = config();
  const d = dados();
  const outras = (c.formasPagamento || []).filter((f) => !FORMAS_PADRAO.includes(f));
  const exemplos = d.pedidos.filter((p) => p.exemplo).length + d.lancamentos.filter((l) => l.exemplo).length;

  return `
    <div class="g-titulo">
      <h1>Ajustes</h1>
      <a class="btn btn-contorno" href="index.html" target="_blank" rel="noopener">${icone('loja')} Ver página de vendas</a>
    </div>
    <form id="form-ajustes" class="form-ajustes grade-larga" novalidate>
      <section class="cartao-ajustes">
        <h2>Página de vendas</h2>
        <p>O que os clientes veem no cardápio e na mensagem do pedido.</p>
        <div class="grade-campos">
          <label class="campo"><span>Nome do negócio</span><input name="nome" id="aj-nome" value="${esc(c.nome)}" maxlength="60"></label>
          <label class="campo"><span>WhatsApp que recebe os pedidos</span>
            <input name="whatsapp" id="aj-whatsapp" type="tel" inputmode="tel" value="${esc(telefoneBonito(c.whatsapp))}" placeholder="(17) 99999-9999">
            <small>Com DDD. É para esse número que o pedido vai.</small>
          </label>
          <label class="campo"><span>Instagram</span><input name="instagram" id="aj-instagram" value="${esc(c.instagram ? `@${c.instagram}` : '')}" placeholder="@bibisalgados"></label>
          <label class="campo"><span>Cidade</span><input name="cidade" id="aj-cidade" value="${esc(c.cidade)}"></label>
          <label class="campo campo-largo"><span>Frase de apresentação</span><textarea name="slogan" id="aj-slogan" rows="2">${esc(c.slogan)}</textarea></label>
          <label class="campo campo-largo"><span>Horário de atendimento</span><input name="horario" id="aj-horario" value="${esc(c.horario)}"></label>
          <label class="campo campo-largo"><span>Onde vocês entregam</span><input name="areaEntrega" id="aj-area" value="${esc(c.areaEntrega)}"></label>
        </div>
      </section>

      <section class="cartao-ajustes">
        <h2>Regras dos pedidos</h2>
        <label class="check"><input type="checkbox" name="aceitandoPedidos" id="aj-aceitando" ${c.aceitandoPedidos !== false ? 'checked' : ''}> Aceitando pedidos pelo site</label>
        <div class="grade-campos">
          <label class="campo"><span>Taxa de entrega</span><span class="com-prefixo"><span>R$</span><input name="taxaEntrega" id="aj-taxa" inputmode="decimal" value="${dinheiroInput(c.taxaEntrega)}"></span></label>
          <label class="campo"><span>Pedido mínimo</span><span class="com-prefixo"><span>R$</span><input name="pedidoMinimo" id="aj-minimo" inputmode="decimal" value="${dinheiroInput(c.pedidoMinimo)}"></span></label>
          <label class="campo"><span>Antecedência mínima</span><span class="com-sufixo"><input name="antecedenciaHoras" id="aj-antecedencia" inputmode="numeric" value="${num(c.antecedenciaHoras)}"><span>horas</span></span><small>0 aceita pedido para o mesmo dia.</small></label>
        </div>
        <fieldset class="secao-janela" style="border:0;padding:0;margin:0">
          <legend class="rotulo" style="margin-bottom:.6rem">Formas de pagamento</legend>
          <div class="opcoes">
            ${FORMAS_PADRAO.map((f) => `<label class="opcao"><input type="checkbox" name="forma" value="${esc(f)}" ${(c.formasPagamento || []).includes(f) ? 'checked' : ''}> ${esc(f)}</label>`).join('')}
          </div>
          <label class="campo"><span>Outras formas (separe por vírgula)</span><input name="formasOutras" id="aj-formas" value="${esc(outras.join(', '))}"></label>
        </fieldset>
        <label class="campo"><span>Chave Pix</span><input name="chavePix" id="aj-pix" value="${esc(c.chavePix)}"><small id="aj-pix-dica">${esc(dicaChavePix(c.chavePix))}</small></label>
      </section>

      <section class="cartao-ajustes">
        <h2>Cobrar antes da entrega</h2>
        <p>Ligue quando quiser receber antes de entregar, por exemplo em dias cheios ou encomendas grandes. O cliente paga ao fazer o pedido, e ele fica "aguardando pagamento" até você marcar como pago.</p>
        <label class="check"><input type="checkbox" name="cobrarAntes" id="aj-cobrar-antes" ${c.cobrarAntes ? 'checked' : ''}> Cobrar antes da entrega nos pedidos do site</label>
        <fieldset class="secao-janela" id="aj-cobrar-formas" style="border:0;padding:0;margin:0" ${c.cobrarAntes ? '' : 'hidden'}>
          <legend class="rotulo" style="margin-bottom:.6rem">Como o cliente pode pagar</legend>
          <label class="check"><input type="checkbox" name="cobrarAntesPix" ${c.cobrarAntesPix !== false ? 'checked' : ''}> Pix: o site mostra o código copia e cola com o valor do pedido</label>
          <label class="check"><input type="checkbox" name="cobrarAntesCartao" ${c.cobrarAntesCartao !== false ? 'checked' : ''}> Cartão de crédito: você manda um link de pagamento pelo WhatsApp</label>
          <small class="suave">O link de cartão é criado no app da sua maquininha ou do banco (InfinitePay, Mercado Pago, PagBank e outros), e cada um cobra a própria taxa.</small>
          <p class="aviso-ajuste" id="aj-cobrar-aviso" ${avisoCobrarAntes(c) ? '' : 'hidden'}>${esc(avisoCobrarAntes(c))}</p>
        </fieldset>
      </section>

      <section class="cartao-ajustes">
        <h2>Custos</h2>
        <p>Em alimentação, ingredientes e embalagem costumam ficar entre 30% e 35% do preço de venda. O cardápio usa essa meta para dizer se um preço está bom e sugerir um novo.</p>
        <label class="campo" style="max-width:240px"><span>Meta de custo sobre o preço</span><span class="com-sufixo"><input name="cmvAlvo" id="aj-cmv" inputmode="decimal" value="${num((Number(c.cmvAlvo) || 0.35) * 100, 1)}"><span>%</span></span></label>
      </section>

      <div class="barra-salvar" id="barra-salvar" hidden>
        <span>Você tem alterações não salvas.</span>
        <button class="btn" type="submit">Salvar ajustes</button>
      </div>
    </form>

    <section class="cartao-ajustes">
      <h2>Seus dados</h2>
      ${exemplos ? `
        <p>Há ${plural(exemplos, 'registro de exemplo', 'registros de exemplo')} (pedidos e lançamentos com nomes fictícios).</p>
        <div class="acoes"><button class="btn btn-contorno" data-acao="apagar-exemplos" data-confirmar="Toque de novo para apagar">${icone('lixeira')} Apagar exemplos</button></div>` : ''}
      <p>Guarde uma cópia de tudo de vez em quando, por exemplo uma vez por mês.</p>
      <div class="acoes">
        <button class="btn btn-contorno" data-acao="baixar-backup">${icone('baixar')} Baixar backup</button>
        <button class="btn btn-contorno" data-acao="copiar-backup">${icone('copiar')} Copiar backup</button>
        <label class="btn btn-contorno">${icone('enviar')} Restaurar backup<input type="file" id="arquivo-backup" accept="application/json,.json" hidden></label>
      </div>
      <div id="area-restaurar">${htmlRestaurar()}</div>
      ${store.modo === 'local' ? `
        <div class="acoes"><button class="btn btn-contorno" data-acao="restaurar-exemplo" data-confirmar="Toque de novo para voltar ao exemplo">Voltar aos dados de exemplo</button></div>` : ''}
    </section>

    <section class="cartao-ajustes">
      <h2>Conta</h2>
      ${store.modo === 'nuvem'
        ? `<p>Conectado como <strong>${esc(store.usuario?.email || '')}</strong>. Os dados ficam na nuvem e aparecem em qualquer aparelho em que você entrar.</p>
           <div class="acoes"><button class="btn btn-contorno" data-acao="sair">${icone('sair')} Sair</button></div>`
        : '<p>Esta versão guarda os dados só neste navegador. Com o Firebase ligado, eles ficam na nuvem e a gestão pede login.</p>'}
    </section>`;
}

function dicaChavePix(texto) {
  const padrao = 'Aparece para o cliente depois que ele monta o pedido.';
  if (!String(texto || '').trim()) return padrao;
  const chave = lerChavePix(texto);
  return chave ? `Chave reconhecida: ${chave.tipo} ${chave.chave}. ${padrao}`
    : 'Não reconhecemos essa chave. Use CPF, CNPJ, celular com DDD, e-mail ou chave aleatória.';
}

function avisoCobrarAntes(c) {
  if (!c.cobrarAntes) return '';
  if (!c.cobrarAntesPix && !c.cobrarAntesCartao) return 'Escolha pelo menos uma forma. Sem nenhuma, o site continua cobrando na entrega.';
  if (c.cobrarAntesPix && !lerChavePix(c.chavePix)) {
    return c.cobrarAntesCartao ? 'O Pix só aparece com uma chave Pix válida. Por enquanto o site oferece só o cartão.'
      : 'O Pix só aparece com uma chave Pix válida. Sem ela, o site continua cobrando na entrega.';
  }
  return '';
}

// Mostra e esconde as opções e os avisos conforme a pessoa mexe, antes de salvar.
function atualizarAjustesPagamento() {
  const f = $('#form-ajustes').elements;
  const c = {
    cobrarAntes: f.cobrarAntes.checked,
    cobrarAntesPix: f.cobrarAntesPix.checked,
    cobrarAntesCartao: f.cobrarAntesCartao.checked,
    chavePix: f.chavePix.value,
  };
  $('#aj-pix-dica').textContent = dicaChavePix(c.chavePix);
  $('#aj-cobrar-formas').hidden = !c.cobrarAntes;
  const aviso = avisoCobrarAntes(c);
  $('#aj-cobrar-aviso').hidden = !aviso;
  $('#aj-cobrar-aviso').textContent = aviso;
}

function htmlRestaurar() {
  const b = ui.backupPendente;
  if (!b) return '';
  return `
    <div class="confirmacao">
      <p>Este backup tem ${plural(b.produtos.length, 'produto', 'produtos')} e ${plural(b.pedidos.length, 'pedido', 'pedidos')}. Restaurar substitui tudo o que está aqui agora.</p>
      <div class="acoes">
        <button class="btn" data-acao="confirmar-restaurar">Substituir tudo</button>
        <button class="btn btn-contorno" data-acao="cancelar-restaurar">Cancelar</button>
      </div>
    </div>`;
}

function salvarAjustes() {
  const f = $('#form-ajustes').elements;
  const formas = [...document.querySelectorAll('#form-ajustes input[name="forma"]:checked')].map((i) => i.value);
  const outras = f.formasOutras.value.split(',').map((s) => s.trim()).filter(Boolean);
  const instagram = f.instagram.value.trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  const cmv = lerNumero(f.cmvAlvo.value);
  store.salvarConfig({
    nome: f.nome.value.trim() || 'Meu negócio',
    whatsapp: telefoneWhats(f.whatsapp.value),
    instagram,
    cidade: f.cidade.value.trim(),
    slogan: f.slogan.value.trim(),
    horario: f.horario.value.trim(),
    areaEntrega: f.areaEntrega.value.trim(),
    aceitandoPedidos: f.aceitandoPedidos.checked,
    taxaEntrega: lerNumero(f.taxaEntrega.value),
    pedidoMinimo: lerNumero(f.pedidoMinimo.value),
    antecedenciaHoras: Math.max(0, Math.round(lerNumero(f.antecedenciaHoras.value))),
    formasPagamento: [...formas, ...outras],
    chavePix: f.chavePix.value.trim(),
    cobrarAntes: f.cobrarAntes.checked,
    cobrarAntesPix: f.cobrarAntesPix.checked,
    cobrarAntesCartao: f.cobrarAntesCartao.checked,
    cmvAlvo: cmv > 0 && cmv < 100 ? cmv / 100 : 0.35,
  });
  ui.ajustesSujo = false;
  desenhar();
  aviso('Ajustes salvos');
}

function baixarBackup() {
  const json = JSON.stringify(exportarDados(dados()), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${semAcento(config().nome).replace(/[^a-z0-9]+/g, '-')}-${hojeISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  aviso('Backup gerado. Se o download não começar, use Copiar backup.');
}

async function lerArquivoBackup(arquivo) {
  try {
    const texto = await arquivo.text();
    ui.backupPendente = validarBackup(JSON.parse(texto));
  } catch (e) {
    ui.backupPendente = null;
    aviso(e instanceof SyntaxError ? 'Este arquivo não é um backup válido.' : e.message, 'erro');
  }
  const area = $('#area-restaurar');
  if (area) area.innerHTML = htmlRestaurar();
}

// ---------------------------------------------------------------------------
// Janelas de edição
// ---------------------------------------------------------------------------

const janela = { atual: null };

function abrirJanela({ titulo, corpo, rodape, ...acoes }) {
  janela.atual = acoes;
  $('#janela-titulo').textContent = titulo;
  $('#janela-corpo').innerHTML = `<p class="erro-campo" id="janela-erro" role="alert" hidden></p>${corpo}`;
  $('#janela-rodape').innerHTML = rodape;
  const el = $('#janela');
  if (!el.open) el.showModal();
  el.scrollTop = 0;
  acoes.aoAbrir?.();
}

function fecharJanela() {
  const el = $('#janela');
  if (el.open) el.close();
}

function erroNaJanela(texto) {
  const el = $('#janela-erro');
  el.textContent = texto;
  el.hidden = false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function campo(nome) {
  return $('#form-janela').elements[nome];
}

function valor(nome) {
  const el = campo(nome);
  return el ? String(el.value ?? '') : '';
}

function rodapeEditor({ podeExcluir = false, salvar = 'Salvar' } = {}) {
  return `
    ${podeExcluir ? `<button type="button" class="btn btn-contorno rodape-esquerda" data-j="excluir" data-confirmar="Confirmar" aria-label="Excluir">${icone('lixeira')}<span class="rotulo-excluir">Excluir</span></button>` : ''}
    <button type="button" class="btn btn-contorno" data-j="fechar">Cancelar</button>
    <button type="submit" class="btn">${esc(salvar)}</button>`;
}

$('#janela').addEventListener('close', () => {
  janela.atual = null;
});
$('#janela').addEventListener('input', (e) => janela.atual?.aoDigitar?.(e));
$('#janela').addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]');
  if (!b) return;
  if (b.dataset.j === 'fechar') {
    fecharJanela();
    return;
  }
  if (b.dataset.confirmar && precisaConfirmar(b)) return;
  janela.atual?.aoClicar?.(b.dataset.j, b);
});
$('#form-janela').addEventListener('submit', (e) => {
  e.preventDefault();
  janela.atual?.aoSalvar?.();
});

// ---------- Pedido ----------

function novoPedido() {
  const c = config();
  return {
    id: novoId('p-'),
    codigo: codigoPedido(),
    criadoEm: new Date().toISOString(),
    origem: 'WhatsApp',
    status: 'confirmado',
    cliente: { nome: '', telefone: '' },
    entrega: { tipo: 'retirada', endereco: '' },
    dataEntrega: hojeISO(),
    hora: '',
    itens: [],
    taxaEntrega: Number(c.taxaEntrega) || 0,
    desconto: 0,
    pagamento: { forma: (c.formasPagamento || [])[0] || 'Pix', pago: false, pagoEm: '' },
    obs: '',
  };
}

function abrirPedido(id) {
  const existente = id ? dados().pedidos.find((p) => p.id === id) : null;
  if (id && !existente) return;
  const p = existente ? structuredClone(existente) : novoPedido();
  const produtos = [...dados().produtos].sort(porOrdem);
  const prodMap = porId(produtos);
  const formas = [...new Set([...(config().formasPagamento || []), ...formasAntecipadas(config()), p.pagamento?.forma].filter(Boolean))];

  const opcoesProdutos = agrupar(produtos, (x) => x.categoria || 'Cardápio').map(([cat, lista]) => `
    <optgroup label="${esc(cat)}">${lista.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)} · ${brl(x.preco)} ${esc(rotuloVenda(x))}</option>`).join('')}</optgroup>`).join('');

  const corpo = `
    <div class="secao-janela">
      <h3>Cliente</h3>
      <div class="grade-campos">
        <label class="campo"><span>Nome</span><input name="nome" id="ped-nome" value="${esc(p.cliente?.nome)}" maxlength="80" autocomplete="off"></label>
        <label class="campo"><span>WhatsApp</span><input name="telefone" id="ped-telefone" type="tel" inputmode="tel" value="${esc(p.cliente?.telefone)}" placeholder="(17) 99999-9999"></label>
      </div>
    </div>

    <div class="secao-janela">
      <h3>Itens</h3>
      <div class="itens-editor" id="ped-itens"></div>
      ${produtos.length ? `
        <div class="adicionar-linha">
          <select id="ped-add" aria-label="Produto para adicionar">${opcoesProdutos}</select>
          <button type="button" class="btn btn-contorno" data-j="add-item">${icone('mais')} Adicionar</button>
        </div>` : '<p class="nota">Cadastre produtos no Cardápio para montar pedidos.</p>'}
    </div>

    <div class="secao-janela">
      <h3>Entrega</h3>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="tipo" value="retirada" ${p.entrega?.tipo !== 'entrega' ? 'checked' : ''}> Retirada</label>
        <label class="opcao"><input type="radio" name="tipo" value="entrega" ${p.entrega?.tipo === 'entrega' ? 'checked' : ''}> Entrega</label>
      </div>
      <div class="grade-campos" id="ped-entrega" ${p.entrega?.tipo === 'entrega' ? '' : 'hidden'}>
        <label class="campo campo-largo"><span>Endereço</span><textarea name="endereco" id="ped-endereco" rows="2">${esc(p.entrega?.endereco)}</textarea></label>
        <label class="campo"><span>Taxa de entrega</span><span class="com-prefixo"><span>R$</span><input name="taxaEntrega" id="ped-taxa" inputmode="decimal" value="${dinheiroInput(p.taxaEntrega)}"></span></label>
      </div>
      <div class="grade-campos">
        <label class="campo"><span>Dia</span><input type="date" name="dataEntrega" id="ped-data" value="${esc(p.dataEntrega)}"></label>
        <label class="campo"><span>Horário</span><input type="time" name="hora" id="ped-hora" value="${esc(p.hora)}" step="900"></label>
      </div>
    </div>

    <div class="secao-janela">
      <h3>Pagamento</h3>
      <div class="grade-campos">
        <label class="campo"><span>Forma</span><select name="forma" id="ped-forma">${formas.map((f) => `<option ${p.pagamento?.forma === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label class="campo"><span>Desconto</span><span class="com-prefixo"><span>R$</span><input name="desconto" id="ped-desconto" inputmode="decimal" value="${dinheiroInput(p.desconto)}"></span></label>
      </div>
      <label class="check"><input type="checkbox" name="pago" id="ped-pago" ${p.pagamento?.pago ? 'checked' : ''}> Já foi pago</label>
      <label class="campo" id="ped-pagoem" style="max-width:240px" ${p.pagamento?.pago ? '' : 'hidden'}><span>Pago em</span><input type="date" name="pagoEm" value="${esc(p.pagamento?.pagoEm || hojeISO())}"></label>
    </div>

    <div class="totais-editor" id="ped-totais"></div>

    <div class="secao-janela">
      <h3>Situação</h3>
      <div class="opcoes">
        ${Object.entries(STATUS).map(([id, rotulo]) => `<label class="opcao"><input type="radio" name="status" value="${id}" ${p.status === id ? 'checked' : ''}> ${rotulo}</label>`).join('')}
      </div>
      <div class="grade-campos">
        <label class="campo"><span>Como chegou</span><select name="origem" id="ped-origem">${[...new Set([...ORIGENS, p.origem].filter(Boolean))].map((o) => `<option ${p.origem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      </div>
      <label class="campo"><span>Observações</span><textarea name="obs" id="ped-obs" rows="2">${esc(p.obs)}</textarea></label>
    </div>

    <div class="secao-janela">
      <h3>Mensagens prontas para o cliente</h3>
      <div id="ped-mensagens"></div>
    </div>`;

  function htmlItem(it, i) {
    return `
      <div class="item-editor">
        <div>
          <div class="nome">${esc(it.nome)}</div>
          <div class="detalhe">${brl(it.preco)} ${esc(rotuloPreco(it))}<span data-un="${i}">${(Number(it.rende) || 1) > 1 ? ` · ${num(it.qtd * it.rende)} un` : ''}</span></div>
        </div>
        <div class="valor" data-valor="${i}">${brl(it.preco * it.qtd)}</div>
        <div class="qtd-editor" style="grid-column:1 / -1">
          <button type="button" data-j="menos-item" data-i="${i}" aria-label="Menos ${esc(it.nome)}">−</button>
          <input name="qtd-item" data-i="${i}" inputmode="decimal" value="${numeroInput(it.qtd)}" aria-label="Quantidade de ${esc(it.nome)}">
          <button type="button" data-j="mais-item" data-i="${i}" aria-label="Mais ${esc(it.nome)}">+</button>
          <span class="suave" data-unidade="${i}">${esc(unidadeDoItem(it))}</span>
          <button type="button" class="btn-icone" style="margin-left:auto" data-j="remover-item" data-i="${i}" aria-label="Tirar ${esc(it.nome)}">${icone('lixeira')}</button>
        </div>
      </div>`;
  }

  function desenharItens() {
    $('#ped-itens').innerHTML = p.itens.length ? p.itens.map(htmlItem).join('') : '<p class="suave">Nenhum item ainda.</p>';
  }

  function atualizarItem(i) {
    const it = p.itens[i];
    $(`[data-valor="${i}"]`).textContent = brl(it.preco * it.qtd);
    const un = $(`[data-un="${i}"]`);
    if (un) un.textContent = (Number(it.rende) || 1) > 1 ? ` · ${num(it.qtd * it.rende)} un` : '';
    $(`[data-unidade="${i}"]`).textContent = unidadeDoItem(it);
  }

  function totaisAtuais() {
    return totaisPedido({
      itens: p.itens,
      entrega: { tipo: valor('tipo') },
      taxaEntrega: lerNumero(valor('taxaEntrega')),
      desconto: lerNumero(valor('desconto')),
    });
  }

  function atualizarTotais() {
    const t = totaisAtuais();
    $('#ped-totais').innerHTML = `
      <div><span>Itens</span><span>${brl(t.subtotal)}</span></div>
      ${t.taxaEntrega ? `<div><span>Entrega</span><span>${brl(t.taxaEntrega)}</span></div>` : ''}
      ${t.desconto ? `<div><span>Desconto</span><span>− ${brl(t.desconto)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${brl(t.total)}</span></div>`;
  }

  function mensagemCobrar(ola, total, pix) {
    const base = `${ola} O total do pedido #${p.codigo} ficou ${brl(total)}.`;
    const chave = lerChavePix(config().chavePix);
    if (valor('forma') === PIX_ANTECIPADO && chave) {
      const codigo = codigoPix({ chave: chave.chave, nome: config().nome, cidade: config().cidade, valor: total, identificador: p.codigo });
      return `${base} Para confirmar, pague com este Pix copia e cola:\n\n${codigo}`;
    }
    if (valor('forma') === CARTAO_PELO_LINK) return `${base} Segue o link para pagar no cartão: `;
    return `${base}${pix} Qualquer dúvida, é só chamar.`;
  }

  function desenharMensagens() {
    const tel = valor('telefone');
    const alvo = $('#ped-mensagens');
    if (soDigitos(tel).length < 10) {
      alvo.innerHTML = '<p class="suave">Coloque o WhatsApp do cliente (com DDD) para mandar mensagens prontas.</p>';
      return;
    }
    const nome = valor('nome').trim().split(' ')[0];
    const ola = nome ? `Olá, ${nome}!` : 'Olá!';
    const t = totaisAtuais();
    const quando = `${dataComDia(valor('dataEntrega'))}${valor('hora') ? ` às ${valor('hora')}` : ''}`;
    const pix = config().chavePix ? ` A chave Pix é ${config().chavePix}.` : '';
    const entrega = valor('tipo') === 'entrega';
    const mensagens = [
      ['Confirmar', `${ola} Seu pedido #${p.codigo} está confirmado para ${quando}. Total: ${brl(t.total)}.${valor('forma') === 'Pix' ? pix : ''} Obrigado pela preferência!`],
      ['Está pronto', `${ola} Seu pedido #${p.codigo} está pronto${entrega ? ' e já vai sair para entrega' : ' para retirar'}.`],
      entrega ? ['Saiu para entrega', `${ola} Seu pedido #${p.codigo} saiu para entrega e chega em breve.`] : null,
      ['Cobrar', mensagemCobrar(ola, t.total, pix)],
    ].filter(Boolean);
    alvo.innerHTML = `<div class="mensagens-rapidas">${mensagens.map(([rotulo, texto]) => `
      <a class="btn btn-pequeno btn-contorno" href="${esc(linkWhats(tel, texto))}" target="_blank" rel="noopener">${icone('conversa')} ${rotulo}</a>`).join('')}</div>`;
  }

  function mudarQtd(i, direcao) {
    const it = p.itens[i];
    const passo = Number(prodMap[it.produtoId]?.passo) || 1;
    it.qtd = Math.max(0, Math.round((Number(it.qtd) + direcao * passo) * 100) / 100);
    if (it.qtd === 0) {
      p.itens.splice(i, 1);
      desenharItens();
    } else {
      $(`[name="qtd-item"][data-i="${i}"]`).value = numeroInput(it.qtd);
      atualizarItem(i);
    }
    atualizarTotais();
  }

  abrirJanela({
    titulo: existente ? `Pedido #${p.codigo}` : 'Novo pedido',
    corpo,
    rodape: rodapeEditor({ podeExcluir: Boolean(existente) }),
    aoAbrir() {
      desenharItens();
      atualizarTotais();
      desenharMensagens();
      if (!existente) $('#ped-nome').focus();
    },
    aoDigitar(e) {
      const nome = e.target.name;
      if (nome === 'qtd-item') {
        const i = Number(e.target.dataset.i);
        p.itens[i].qtd = Math.max(0, lerNumero(e.target.value));
        atualizarItem(i);
      } else if (nome === 'tipo') {
        $('#ped-entrega').hidden = e.target.value !== 'entrega';
      } else if (nome === 'pago') {
        $('#ped-pagoem').hidden = !e.target.checked;
      }
      atualizarTotais();
      if (['nome', 'telefone', 'tipo', 'dataEntrega', 'hora', 'forma', 'taxaEntrega', 'desconto', 'qtd-item'].includes(nome)) desenharMensagens();
    },
    aoClicar(acao, botao) {
      const i = Number(botao.dataset.i);
      if (acao === 'add-item') {
        const prod = prodMap[$('#ped-add').value];
        if (!prod) return;
        const ja = p.itens.findIndex((it) => it.produtoId === prod.id);
        if (ja >= 0) {
          mudarQtd(ja, 1);
        } else {
          p.itens.push({
            produtoId: prod.id, nome: prod.nome, preco: Number(prod.preco) || 0,
            qtd: Number(prod.passo) || 1, rende: Number(prod.rende) || 1, unidade: prod.unidade || 'unidade',
          });
          desenharItens();
        }
        atualizarTotais();
        desenharMensagens();
      } else if (acao === 'mais-item' || acao === 'menos-item') {
        mudarQtd(i, acao === 'mais-item' ? 1 : -1);
        desenharMensagens();
      } else if (acao === 'remover-item') {
        p.itens.splice(i, 1);
        desenharItens();
        atualizarTotais();
        desenharMensagens();
      } else if (acao === 'excluir') {
        store.excluir('pedidos', p.id);
        fecharJanela();
        aviso('Pedido excluído');
      }
    },
    aoSalvar() {
      const nome = valor('nome').trim();
      p.itens = p.itens.filter((it) => Number(it.qtd) > 0);
      if (!nome) return erroNaJanela('Coloque o nome do cliente.');
      if (!p.itens.length) return erroNaJanela('Ponha pelo menos um item no pedido.');
      if (!valor('dataEntrega')) return erroNaJanela('Escolha o dia da entrega ou retirada.');
      const pago = campo('pago').checked;
      Object.assign(p, {
        cliente: { nome, telefone: valor('telefone').trim() },
        entrega: { tipo: valor('tipo'), endereco: valor('tipo') === 'entrega' ? valor('endereco').trim() : '' },
        taxaEntrega: lerNumero(valor('taxaEntrega')),
        desconto: lerNumero(valor('desconto')),
        dataEntrega: valor('dataEntrega'),
        hora: valor('hora'),
        pagamento: { forma: valor('forma'), pago, pagoEm: pago ? (valor('pagoEm') || hojeISO()) : '' },
        status: valor('status') || 'confirmado',
        origem: valor('origem'),
        obs: valor('obs').trim(),
      });
      Object.assign(p, totaisPedido(p));
      store.salvar('pedidos', p);
      fecharJanela();
      aviso(existente ? 'Pedido salvo' : `Pedido #${p.codigo} criado`);
    },
  });
}

// ---------- Produto e ficha técnica ----------

function abrirProduto(id) {
  const d = dados();
  const existente = id ? d.produtos.find((x) => x.id === id) : null;
  if (id && !existente) return;
  const categorias = [...new Set(d.produtos.map((x) => x.categoria).filter(Boolean))];
  const prod = existente ? structuredClone(existente) : {
    id: novoId('prod-'), nome: '', categoria: categorias[0] || 'Salgados fritos', descricao: '', preco: 0,
    unidade: 'unidade', rende: 1, passo: 1, ativo: true,
    ordem: Math.max(0, ...d.produtos.map((x) => Number(x.ordem) || 0)) + 1,
  };
  const fichaExistente = d.fichas.find((f) => f.id === prod.id);
  const ficha = fichaExistente ? structuredClone(fichaExistente) : { id: prod.id, rendimento: '', outrosPct: 20, embalagem: 0, itens: [] };
  const ingMap = porId(d.ingredientes);
  const ingredientes = [...d.ingredientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const tipoVenda = (Number(prod.rende) || 1) <= 1 ? 'unidade' : prod.unidade === 'cento' ? 'cento' : 'pacote';

  const corpo = `
    <div class="secao-janela">
      <h3>Na página de vendas</h3>
      <div class="grade-campos">
        <label class="campo campo-largo"><span>Nome</span><input name="nome" id="pr-nome" value="${esc(prod.nome)}" maxlength="80"></label>
        <label class="campo"><span>Categoria</span><input name="categoria" id="pr-categoria" list="pr-categorias" value="${esc(prod.categoria)}">
          <datalist id="pr-categorias">${categorias.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
        </label>
        <label class="campo"><span>Preço de venda</span><span class="com-prefixo"><span>R$</span><input name="preco" id="pr-preco" inputmode="decimal" value="${dinheiroInput(prod.preco)}"></span></label>
        <label class="campo"><span>Vendido por</span>
          <select name="tipoVenda" id="pr-tipo">
            <option value="unidade" ${tipoVenda === 'unidade' ? 'selected' : ''}>Unidade</option>
            <option value="cento" ${tipoVenda === 'cento' ? 'selected' : ''}>Cento (100 un)</option>
            <option value="pacote" ${tipoVenda === 'pacote' ? 'selected' : ''}>Pacote</option>
          </select>
        </label>
        <label class="campo" id="pr-campo-pacote" ${tipoVenda === 'pacote' ? '' : 'hidden'}><span>Salgados no pacote</span><input name="rendePacote" id="pr-pacote" inputmode="numeric" value="${tipoVenda === 'pacote' ? num(prod.rende) : '25'}"></label>
        <label class="campo campo-largo"><span>Descrição</span><textarea name="descricao" id="pr-descricao" rows="2" maxlength="240">${esc(prod.descricao)}</textarea></label>
      </div>
      <label class="check" id="pr-campo-meio" ${tipoVenda === 'cento' ? '' : 'hidden'}><input type="checkbox" name="meioCento" ${Number(prod.passo) < 1 ? 'checked' : ''}> Aceita meio cento (50 un)</label>
      <label class="check"><input type="checkbox" name="ativo" ${prod.ativo !== false ? 'checked' : ''}> Mostrar na página de vendas</label>
    </div>

    <div class="secao-janela">
      <h3>Ficha técnica</h3>
      <p class="suave">Liste os ingredientes de uma receita, do jeito que você faz numa leva, e quantos salgados ela rende.</p>
      <label class="campo" style="max-width:260px"><span>A receita rende</span><span class="com-sufixo"><input name="rendimento" id="pr-rendimento" inputmode="numeric" value="${numeroInput(ficha.rendimento)}" placeholder="Ex.: 100"><span>salgados</span></span></label>
      <div class="itens-editor" id="pr-ficha"></div>
      ${ingredientes.length ? `
        <div class="adicionar-linha">
          <select id="pr-add" aria-label="Ingrediente para pôr na receita">${ingredientes.map((i) => `<option value="${esc(i.id)}">${esc(i.nome)}</option>`).join('')}</select>
          <button type="button" class="btn btn-contorno" data-j="add-ing">${icone('mais')} Adicionar</button>
        </div>` : '<p class="nota">Cadastre os ingredientes na aba Ingredientes do Cardápio para montar a ficha.</p>'}
      <div class="grade-campos">
        <label class="campo"><span>Gás, óleo, energia e perdas</span><span class="com-sufixo"><input name="outrosPct" id="pr-outros" inputmode="decimal" value="${num(ficha.outrosPct)}"><span>%</span></span><small>Somado ao custo dos ingredientes.</small></label>
        <label class="campo"><span>Embalagem por venda</span><span class="com-prefixo"><span>R$</span><input name="embalagem" id="pr-embalagem" inputmode="decimal" value="${dinheiroInput(ficha.embalagem)}"></span><small>Caixa, saquinho, etiqueta…</small></label>
      </div>
    </div>

    <div class="secao-janela">
      <h3>Custo e preço</h3>
      <div class="resultado" id="pr-resultado"></div>
    </div>`;

  function lerProduto() {
    const tipo = valor('tipoVenda');
    let unidade = 'unidade';
    let rende = 1;
    let passo = 1;
    if (tipo === 'cento') {
      unidade = 'cento';
      rende = 100;
      passo = campo('meioCento').checked ? 0.5 : 1;
    } else if (tipo === 'pacote') {
      rende = Math.max(2, Math.round(lerNumero(valor('rendePacote'))) || 2);
      unidade = `pacote com ${rende}`;
    }
    return {
      ...prod,
      nome: valor('nome').trim(),
      categoria: valor('categoria').trim(),
      descricao: valor('descricao').trim(),
      preco: lerNumero(valor('preco')),
      unidade, rende, passo,
      ativo: campo('ativo').checked,
    };
  }

  function lerFicha() {
    return {
      id: prod.id,
      rendimento: lerNumero(valor('rendimento')),
      outrosPct: lerNumero(valor('outrosPct')),
      embalagem: lerNumero(valor('embalagem')),
      itens: ficha.itens.filter((i) => Number(i.qtd) > 0),
    };
  }

  function htmlLinhaFicha(it, i) {
    const ing = ingMap[it.ingredienteId];
    return `
      <div class="ficha-linha">
        <strong>${esc(ing?.nome || 'Ingrediente apagado')}</strong>
        <span class="com-sufixo"><input name="qtd-ing" data-i="${i}" inputmode="decimal" value="${numeroInput(it.qtd)}" aria-label="Quantidade de ${esc(ing?.nome || '')}"><span>${esc(ing?.unidade || '')}</span></span>
        <button type="button" class="btn-icone" data-j="remover-ing" data-i="${i}" aria-label="Tirar ${esc(ing?.nome || '')}">${icone('lixeira')}</button>
        <span class="ficha-custo" data-custo="${i}">${brl(custoPorUnidadeBase(ing) * (Number(it.qtd) || 0))}</span>
      </div>`;
  }

  function desenharFicha() {
    $('#pr-ficha').innerHTML = ficha.itens.length
      ? ficha.itens.map(htmlLinhaFicha).join('')
      : '<p class="suave">Nenhum ingrediente na receita ainda.</p>';
  }

  function porVenda(p) {
    if (p.rende <= 1) return 'por unidade';
    return p.unidade === 'cento' ? 'por cento' : 'por pacote';
  }

  function atualizarResultado() {
    const p = lerProduto();
    const f = lerFicha();
    const alvo = Number(config().cmvAlvo) || 0.35;
    const custo = custoDoProduto(p, f, ingMap);
    const el = $('#pr-resultado');
    if (custo == null) {
      el.innerHTML = '<p class="dica">Diga quanto a receita rende e ponha os ingredientes para ver o custo e o preço sugerido.</p>';
      return;
    }
    const calc = calcularFicha(f, ingMap);
    const a = analisarPreco(p.preco, custo, alvo);
    const sugerido = arredondarPreco(a.sugerido);
    let dica;
    if (!(p.preco > 0)) dica = `Com esse custo, o preço sugerido é ${brl(sugerido)}.`;
    else if (a.nivel === 'bom') dica = `Preço saudável: o custo fica em ${pct(a.cmv)} do preço, dentro da meta de ${pct(alvo)}.`;
    else dica = `O custo está em ${pct(a.cmv)} do preço. Para ficar em ${pct(alvo)}, o preço sugerido é ${brl(sugerido)}.`;
    el.innerHTML = `
      <div><span>Custo da receita</span><strong>${brl(calc.custoReceita)}</strong></div>
      <div><span>Custo por salgado</span><strong>${brl(calc.porSalgado)}</strong></div>
      <div><span>Custo ${porVenda(p)}</span><strong>${brl(custo)}</strong></div>
      <div><span>Sobra ${porVenda(p)}</span><strong>${p.preco > 0 ? brl(a.lucro) : '–'}</strong></div>
      <p class="dica">${p.preco > 0 ? `<span class="pill ${a.nivel}">Custo ${pct(a.cmv)}</span>` : ''}<span>${esc(dica)}</span>
        ${a.nivel !== 'bom' || !(p.preco > 0) ? `<button type="button" class="btn btn-pequeno" data-j="usar-sugerido" data-valor="${sugerido}">Usar ${brl(sugerido)}</button>` : ''}
      </p>`;
  }

  abrirJanela({
    titulo: existente ? prod.nome : 'Novo produto',
    corpo,
    rodape: rodapeEditor({ podeExcluir: Boolean(existente) }),
    aoAbrir() {
      desenharFicha();
      atualizarResultado();
      if (!existente) $('#pr-nome').focus();
    },
    aoDigitar(e) {
      const nome = e.target.name;
      if (nome === 'tipoVenda') {
        $('#pr-campo-pacote').hidden = e.target.value !== 'pacote';
        $('#pr-campo-meio').hidden = e.target.value !== 'cento';
      } else if (nome === 'qtd-ing') {
        const i = Number(e.target.dataset.i);
        ficha.itens[i].qtd = lerNumero(e.target.value);
        $(`[data-custo="${i}"]`).textContent = brl(custoPorUnidadeBase(ingMap[ficha.itens[i].ingredienteId]) * ficha.itens[i].qtd);
      }
      atualizarResultado();
    },
    aoClicar(acao, botao) {
      if (acao === 'add-ing') {
        const ingId = $('#pr-add').value;
        if (!ingId) return;
        if (!ficha.itens.some((i) => i.ingredienteId === ingId)) ficha.itens.push({ ingredienteId: ingId, qtd: 0 });
        desenharFicha();
        const idx = ficha.itens.findIndex((i) => i.ingredienteId === ingId);
        $(`[name="qtd-ing"][data-i="${idx}"]`)?.focus();
      } else if (acao === 'remover-ing') {
        ficha.itens.splice(Number(botao.dataset.i), 1);
        desenharFicha();
        atualizarResultado();
      } else if (acao === 'usar-sugerido') {
        campo('preco').value = dinheiroInput(Number(botao.dataset.valor));
        atualizarResultado();
      } else if (acao === 'excluir') {
        store.excluir('produtos', prod.id);
        if (fichaExistente) store.excluir('fichas', prod.id);
        fecharJanela();
        aviso('Produto excluído');
      }
    },
    aoSalvar() {
      const novo = lerProduto();
      const f = lerFicha();
      if (!novo.nome) return erroNaJanela('Dê um nome ao produto.');
      if (!(novo.preco > 0)) return erroNaJanela('Coloque o preço de venda.');
      if (f.itens.length && !(f.rendimento > 0)) return erroNaJanela('Diga quantos salgados a receita rende.');
      if (!novo.categoria) novo.categoria = 'Cardápio';
      store.salvar('produtos', novo);
      if (f.itens.length) store.salvar('fichas', f);
      else if (fichaExistente) store.excluir('fichas', prod.id);
      fecharJanela();
      aviso('Produto salvo');
    },
  });
}

// ---------- Ingrediente ----------

function abrirIngrediente(id) {
  const existente = id ? dados().ingredientes.find((x) => x.id === id) : null;
  if (id && !existente) return;
  const ing = existente ? structuredClone(existente) : { id: novoId('ing-'), nome: '', unidade: 'g', qtdEmbalagem: 1000, precoEmbalagem: 0, compraUnidade: 'kg' };
  const { qtd, u } = compraLegivel(ing);
  const usos = produtosQueUsam(ing.id);

  const corpo = `
    <label class="campo"><span>Nome</span><input name="nome" id="ing-nome" value="${esc(ing.nome)}" maxlength="80" placeholder="Ex.: Farinha de trigo"></label>
    <div class="secao-janela">
      <h3>Como você compra</h3>
      <div class="grade-campos">
        <label class="campo"><span>Quantidade</span><input name="qtdCompra" id="ing-qtd" inputmode="decimal" value="${numeroInput(qtd)}"></label>
        <label class="campo"><span>Unidade</span><select name="unidadeCompra" id="ing-unidade">
          ${Object.entries(UNIDADES_COMPRA).map(([k, [, , rotulo]]) => `<option value="${k}" ${k === u ? 'selected' : ''}>${rotulo}</option>`).join('')}
        </select></label>
        <label class="campo"><span>Preço pago</span><span class="com-prefixo"><span>R$</span><input name="precoCompra" id="ing-preco" inputmode="decimal" value="${dinheiroInput(ing.precoEmbalagem)}"></span></label>
      </div>
      <p class="nota" id="ing-calculo"></p>
    </div>
    ${usos.length ? `<div class="secao-janela"><h3>Usado em</h3><p>${esc(usos.join(', '))}</p></div>` : ''}`;

  function ler() {
    const un = valor('unidadeCompra');
    const [base, fator] = UNIDADES_COMPRA[un] || UNIDADES_COMPRA.un;
    return {
      ...ing,
      nome: valor('nome').trim(),
      unidade: base,
      qtdEmbalagem: lerNumero(valor('qtdCompra')) * fator,
      precoEmbalagem: lerNumero(valor('precoCompra')),
      compraUnidade: un,
    };
  }

  function atualizar() {
    const atual = ler();
    const [preco, ref] = precoReferencia(atual);
    const nomesBase = { g: 'gramas (g)', ml: 'mililitros (ml)', un: 'unidades' };
    $('#ing-calculo').textContent = atual.qtdEmbalagem > 0
      ? `Sai a ${brl(preco)} o ${ref}. Nas fichas técnicas, a quantidade deste ingrediente vai em ${nomesBase[atual.unidade]}.`
      : 'Informe a quantidade que vem na embalagem.';
  }

  abrirJanela({
    titulo: existente ? ing.nome : 'Novo ingrediente',
    corpo,
    rodape: rodapeEditor({ podeExcluir: Boolean(existente) }),
    aoAbrir() {
      atualizar();
      if (!existente) $('#ing-nome').focus();
    },
    aoDigitar: atualizar,
    aoClicar(acao) {
      if (acao !== 'excluir') return;
      store.excluir('ingredientes', ing.id);
      for (const f of dados().fichas) {
        if ((f.itens || []).some((i) => i.ingredienteId === ing.id)) {
          store.salvar('fichas', { ...f, itens: f.itens.filter((i) => i.ingredienteId !== ing.id) });
        }
      }
      fecharJanela();
      aviso(usos.length ? `Ingrediente excluído e tirado de ${plural(usos.length, 'ficha', 'fichas')}` : 'Ingrediente excluído');
    },
    aoSalvar() {
      const novo = ler();
      if (!novo.nome) return erroNaJanela('Dê um nome ao ingrediente.');
      if (!(novo.qtdEmbalagem > 0)) return erroNaJanela('Informe a quantidade que vem na embalagem.');
      store.salvar('ingredientes', novo);
      fecharJanela();
      aviso('Ingrediente salvo');
    },
  });
}

// ---------- Lançamento financeiro ----------

function abrirLancamento(id, inicial = {}) {
  const existente = id ? dados().lancamentos.find((x) => x.id === id) : null;
  if (id && !existente) return;
  const tipoInicial = inicial.tipo || 'saida';
  const l = existente ? structuredClone(existente) : {
    id: novoId('l-'), data: hojeISO(), tipo: tipoInicial,
    categoria: inicial.categoria || CATEGORIAS_LANCAMENTO[tipoInicial][0], descricao: '', valor: 0,
  };

  const opcoesCategoria = (tipo, atual) => {
    const lista = [...new Set([...CATEGORIAS_LANCAMENTO[tipo], ...(atual && l.tipo === tipo ? [atual] : [])])];
    return lista.map((c) => `<option ${c === atual ? 'selected' : ''}>${esc(c)}</option>`).join('');
  };

  const corpo = `
    <div class="opcoes">
      <label class="opcao"><input type="radio" name="tipo" value="saida" ${l.tipo === 'saida' ? 'checked' : ''}> Saída</label>
      <label class="opcao"><input type="radio" name="tipo" value="entrada" ${l.tipo === 'entrada' ? 'checked' : ''}> Entrada</label>
    </div>
    <div class="grade-campos">
      <label class="campo"><span>Valor</span><span class="com-prefixo"><span>R$</span><input name="valor" id="lanc-valor" inputmode="decimal" value="${l.valor ? dinheiroInput(l.valor) : ''}" placeholder="0,00"></span></label>
      <label class="campo"><span>Data</span><input type="date" name="data" id="lanc-data" value="${esc(l.data)}"></label>
      <label class="campo campo-largo"><span>Categoria</span><select name="categoria" id="lanc-categoria">${opcoesCategoria(l.tipo, l.categoria)}</select></label>
      <label class="campo campo-largo"><span>Descrição</span><input name="descricao" id="lanc-descricao" value="${esc(l.descricao)}" maxlength="120" placeholder="Ex.: Atacadão: farinha e frango"></label>
    </div>
    <p class="nota" id="lanc-dica" hidden></p>`;

  function atualizarDica() {
    const cat = valor('categoria');
    const el = $('#lanc-dica');
    const dicas = {
      [RETIRADA]: 'A retirada é o seu salário. Ela não entra como despesa do negócio, mas sai do caixa.',
      [APORTE]: 'Aporte é dinheiro seu colocado no negócio. Ele entra no caixa, mas não conta como venda.',
      'Venda avulsa': 'Use para vendas que não foram registradas como pedido, como uma venda rápida no balcão.',
    };
    el.hidden = !dicas[cat];
    el.textContent = dicas[cat] || '';
  }

  const titulo = existente ? 'Editar lançamento'
    : inicial.categoria === RETIRADA ? 'Registrar retirada'
      : tipoInicial === 'entrada' ? 'Nova entrada' : 'Nova despesa';

  abrirJanela({
    titulo,
    corpo,
    rodape: rodapeEditor({ podeExcluir: Boolean(existente) }),
    aoAbrir() {
      atualizarDica();
      $('#lanc-valor').focus();
    },
    aoDigitar(e) {
      if (e.target.name === 'tipo') {
        campo('categoria').innerHTML = opcoesCategoria(e.target.value, CATEGORIAS_LANCAMENTO[e.target.value][0]);
      }
      atualizarDica();
    },
    aoClicar(acao) {
      if (acao !== 'excluir') return;
      store.excluir('lancamentos', l.id);
      fecharJanela();
      aviso('Lançamento excluído');
    },
    aoSalvar() {
      const v = lerNumero(valor('valor'));
      if (!(v > 0)) return erroNaJanela('Coloque o valor.');
      if (!valor('data')) return erroNaJanela('Escolha a data.');
      store.salvar('lancamentos', {
        ...l,
        tipo: valor('tipo'),
        valor: v,
        data: valor('data'),
        categoria: valor('categoria'),
        descricao: valor('descricao').trim(),
      });
      ui.mes = mesISO(valor('data'));
      fecharJanela();
      aviso('Lançamento salvo');
    },
  });
}

// ---------------------------------------------------------------------------
// Ações rápidas
// ---------------------------------------------------------------------------

function avancarStatus(id) {
  const p = dados().pedidos.find((x) => x.id === id);
  const prox = p && PROXIMO_STATUS[p.status];
  if (!prox) return;
  store.salvar('pedidos', { ...p, status: prox[0] });
  aviso(`${(p.cliente?.nome || 'Pedido').split(' ')[0]}: ${STATUS[prox[0]].toLowerCase()}`);
}

function marcarPago(id) {
  const p = dados().pedidos.find((x) => x.id === id);
  if (!p) return;
  store.salvar('pedidos', { ...p, pagamento: { ...p.pagamento, pago: true, pagoEm: hojeISO() } });
  aviso(`Pagamento de ${brl(p.total)} registrado`);
}

async function apagarExemplos() {
  const d = dados();
  await store.excluirVarios('pedidos', d.pedidos.filter((p) => p.exemplo).map((p) => p.id));
  await store.excluirVarios('lancamentos', d.lancamentos.filter((l) => l.exemplo).map((l) => l.id));
  aviso('Exemplos apagados');
}

// ---------------------------------------------------------------------------
// Eventos da página
// ---------------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  if (e.target.closest('#janela')) return;

  const ir = e.target.closest('[data-ir]');
  if (ir) {
    e.preventDefault();
    if (ir.dataset.filtro) {
      ui.filtroPedidos = ir.dataset.filtro;
      ui.abaPedidos = 'pedidos';
    }
    irPara(ir.dataset.ir);
    return;
  }
  const alvoPedido = e.target.closest('[data-abrir-pedido]');
  if (alvoPedido) return abrirPedido(alvoPedido.dataset.abrirPedido);
  const alvoProduto = e.target.closest('[data-abrir-produto]');
  if (alvoProduto) return abrirProduto(alvoProduto.dataset.abrirProduto);
  const alvoIngrediente = e.target.closest('[data-abrir-ingrediente]');
  if (alvoIngrediente) return abrirIngrediente(alvoIngrediente.dataset.abrirIngrediente);
  const alvoLancamento = e.target.closest('[data-abrir-lancamento]');
  if (alvoLancamento) return abrirLancamento(alvoLancamento.dataset.abrirLancamento);

  const botao = e.target.closest('[data-acao]');
  if (!botao) return;
  if (botao.dataset.confirmar && precisaConfirmar(botao)) return;
  const { acao, id, valor: v } = botao.dataset;

  switch (acao) {
    case 'novo-pedido': abrirPedido(); break;
    case 'avancar': avancarStatus(id); break;
    case 'recebi': marcarPago(id); break;
    case 'filtro-pedidos':
      ui.filtroPedidos = v;
      desenhar();
      break;
    case 'aba-pedidos':
      ui.abaPedidos = v;
      desenhar();
      break;
    case 'abrir-cliente':
      ui.abaPedidos = 'pedidos';
      ui.filtroPedidos = 'todos';
      ui.buscaPedidos = v;
      desenhar();
      break;
    case 'periodo-producao':
      ui.periodoProducao = v;
      desenhar();
      break;
    case 'copiar-compras':
      aviso(await copiarTexto(textoListaCompras()) ? 'Lista copiada. Cole no WhatsApp ou nas notas.' : 'Não deu para copiar neste aparelho.');
      break;
    case 'aba-cardapio':
      ui.abaCardapio = v;
      desenhar();
      break;
    case 'novo-produto': abrirProduto(); break;
    case 'novo-ingrediente': abrirIngrediente(); break;
    case 'mes':
      ui.mes = somarMeses(ui.mes, Number(v));
      desenhar();
      break;
    case 'novo-lancamento':
      abrirLancamento(null, { tipo: botao.dataset.tipo, categoria: botao.dataset.categoria });
      break;
    case 'usar-cardapio-exemplo':
      await store.comecarComCardapio();
      aviso('Cardápio de exemplo carregado');
      break;
    case 'apagar-exemplos': await apagarExemplos(); break;
    case 'baixar-backup': baixarBackup(); break;
    case 'copiar-backup':
      aviso(await copiarTexto(JSON.stringify(exportarDados(dados()))) ? 'Backup copiado. Cole num e-mail ou nas notas para guardar.' : 'Não deu para copiar neste aparelho.');
      break;
    case 'confirmar-restaurar':
      if (ui.backupPendente) {
        await store.substituirTudo(ui.backupPendente);
        ui.backupPendente = null;
        ui.ajustesSujo = false;
        desenhar();
        aviso('Backup restaurado');
      }
      break;
    case 'cancelar-restaurar':
      ui.backupPendente = null;
      $('#area-restaurar').innerHTML = '';
      break;
    case 'restaurar-exemplo':
      await store.restaurarExemplo();
      aviso('Dados de exemplo restaurados');
      break;
    case 'sair':
      await store.sair();
      break;
    default:
      break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.closest('#janela')) return;
  if (e.target.id === 'busca-pedidos') {
    ui.buscaPedidos = e.target.value;
    $('#lista-pedidos').innerHTML = htmlListaPedidos();
  } else if (e.target.id === 'data-producao') {
    if (!e.target.value) return;
    ui.dataProducao = e.target.value;
    ui.periodoProducao = 'data';
    desenhar();
  } else if (e.target.closest('#form-ajustes')) {
    ui.ajustesSujo = true;
    $('#barra-salvar').hidden = false;
    atualizarAjustesPagamento();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'arquivo-backup' && e.target.files?.[0]) lerArquivoBackup(e.target.files[0]);
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'form-ajustes') return;
  e.preventDefault();
  salvarAjustes();
});

// ---------- Entrar ----------

function mensagemErroLogin(err) {
  const codigo = err?.code || '';
  if (codigo === 'auth/invalid-email') return 'Este e-mail não parece certo.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(codigo)) {
    return 'E-mail ou senha incorretos.';
  }
  if (codigo === 'auth/too-many-requests') return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (codigo === 'auth/network-request-failed') return 'Sem conexão com a internet.';
  if (codigo === 'auth/user-disabled') return 'Este acesso foi desativado.';
  return 'Não foi possível entrar. Tente de novo.';
}

function mostrarMensagemLogin(texto, erro = true) {
  const el = $('#login-erro');
  el.textContent = texto;
  el.style.color = erro ? '' : 'var(--ok)';
  el.hidden = false;
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const senha = $('#login-senha').value;
  $('#login-erro').hidden = true;
  if (!email || !senha) return mostrarMensagemLogin('Preencha o e-mail e a senha.');
  const botao = $('#login-entrar');
  botao.disabled = true;
  botao.textContent = 'Entrando…';
  try {
    await store.entrar(email, senha);
    $('#login-senha').value = '';
  } catch (err) {
    mostrarMensagemLogin(mensagemErroLogin(err));
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

$('#login-esqueci').addEventListener('click', async () => {
  const email = $('#login-email').value.trim();
  if (!email) return mostrarMensagemLogin('Digite seu e-mail no campo acima e toque de novo em "Esqueci minha senha".');
  try {
    await store.esqueciSenha(email);
    mostrarMensagemLogin('Se este e-mail tiver acesso, chega nele um link para criar uma senha nova.', false);
  } catch (err) {
    mostrarMensagemLogin(mensagemErroLogin(err));
  }
});

iniciar();
