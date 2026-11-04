// Página de vendas: cardápio, carrinho e pedido pronto para o WhatsApp.

import { abrirStore } from './store.js';
import { FIREBASE_SDK } from './config.js';
import { CONFIG_PADRAO, cardapioInicial } from './dados-exemplo.js';
import {
  brl, esc, num, linkWhats, telefoneBonito, telefoneWhats, codigoPedido, isoLocal, horaLocal,
  dataComDia, dataCurta, dataRelativa, hojeISO, somarDias, lerLocal, gravarLocal, copiarTexto,
} from './util.js';
import {
  textoQtd, totaisPedido, formasAntecipadas, PIX_ANTECIPADO, CARTAO_PELO_LINK, CARTAO_NO_SITE,
  textoEncomenda, textoOcasiao, sugestaoDeSalgados, unidadesDoPedido,
  minutosDePreparo, primeiroHorario, textoDuracao, atendimento, textoAtendimento, foraDoAtendimento,
} from './calculos.js';
import { lerChavePix, codigoPix, desenharQrPix } from './pix.js';
import { criarCobranca, lerRetorno, conferirPagamento } from './infinitepay.js';
import { maximoParaVender, esgotado, aceitaEncomenda, limiteNoSite, parteEncomendada } from './estoque.js';
import { icone } from './icones.js';

const CHAVE_CARRINHO = 'bibi-salgados:carrinho';
const CHAVE_CLIENTE = 'bibi-salgados:cliente';
// O que o cliente já preencheu na janela do pedido. Volta ao reabrir a janela e
// ao recarregar a página; some depois que o pedido é enviado.
const CHAVE_RASCUNHO = 'bibi-salgados:rascunho-pedido';
// O último cardápio e os ajustes que vieram do banco. Se o banco não responder,
// a página abre com eles (a página Sobre e a de endereço errado também leem).
const CHAVE_GUARDADO = 'bibi-salgados:cardapio-guardado';
// Códigos dos pedidos enviados deste aparelho, para conferir quem volta da
// página de pagamento.
const CHAVE_ENVIADOS = 'bibi-salgados:pedidos-enviados';
// Quando a página recarregou sozinha e onde ela estava (veja recarregarQuandoPuder).
const CHAVE_RECARGA = 'bibi-salgados:recarregou';
const CHAVE_POSICAO = 'bibi-salgados:posicao';
const LIMITE_OBS = 500;

let store;
let config;
let produtos = [];
let carrinho = lerLocal(CHAVE_CARRINHO, {}) || {};
let rascunho = lerLocal(CHAVE_RASCUNHO, null);
let codigo = codigoPedido();
let pedidoEnviado = null;
let semBanco = false;
let enviadoEm = 0;
let passoDaJanela = 0;
let obsColouDemais = false;

const $ = (sel, raiz = document) => raiz.querySelector(sel);

// ---------- Início ----------

async function iniciar() {
  const banco = abrirStore({ publico: true });
  // Banco muito lento: a página abre com o cardápio guardado e troca quando ele responder.
  const demorou = setTimeout(() => entrarSemBanco(new Error('O banco demorou para responder.')), 12000);
  try {
    const aberto = await banco;
    clearTimeout(demorou);
    if (!store) usarBanco(aberto);
  } catch (e) {
    clearTimeout(demorou);
    entrarSemBanco(e);
  }
}

function usarBanco(aberto) {
  store = aberto;
  semBanco = false;
  clearTimeout(proximaTentativa);
  mostrarInstavel(false);
  atualizar(store.dados);
  if (store.modo === 'nuvem') guardarCardapio(store.dados);
  store.aoMudar(atualizar);
  voltarAPosicao();
  verRetornoDoPagamento();
  voltarAoPassoDaJanela();
}

// Sem o banco, a página abre com o último cardápio guardado neste aparelho (ou o
// que vem no código) e o pedido vai só pelo WhatsApp. O banco é tentado de novo
// por trás.
function entrarSemBanco(erro) {
  if (store || semBanco) return;
  console.warn('O banco não respondeu; a página abriu com o cardápio guardado.', erro);
  semBanco = true;
  mostrarInstavel(true);
  atualizar(dadosDeReserva());
  voltarAPosicao();
  verRetornoDoPagamento();
  voltarAoPassoDaJanela();
  tentarDeNovoDepois();
}

// O aviso pode faltar se o navegador ainda tiver a página antiga guardada.
function mostrarInstavel(sim) {
  const aviso = $('#instavel');
  if (aviso) aviso.hidden = !sim;
}

function guardarCardapio(dados) {
  gravarLocal(CHAVE_GUARDADO, { config: dados.config, produtos: dados.produtos, guardadoEm: new Date().toISOString() });
}

function dadosDeReserva() {
  const guardado = lerLocal(CHAVE_GUARDADO, null);
  if (guardado?.config && Array.isArray(guardado.produtos)) {
    return { config: { ...CONFIG_PADRAO, ...guardado.config }, produtos: guardado.produtos };
  }
  const inicial = cardapioInicial();
  return { config: inicial.config, produtos: inicial.produtos };
}

// Espera entre as tentativas de falar com o banco: 5 s, 15 s, 30 s e depois de
// minuto em minuto, enquanto a página estiver aberta.
const ESPERAS = [5, 15, 30, 60];
let tentativas = 0;
let proximaTentativa = null;
let tentando = false;

function tentarDeNovoDepois() {
  clearTimeout(proximaTentativa);
  const segundos = ESPERAS[Math.min(tentativas, ESPERAS.length - 1)];
  tentativas += 1;
  proximaTentativa = setTimeout(tentarOBanco, segundos * 1000);
}

async function tentarOBanco() {
  if (store || tentando || recarregar) return;
  tentando = true;
  try {
    const aberto = await abrirStore({ publico: true });
    if (!store) usarBanco(aberto);
  } catch (e) {
    console.warn('O banco ainda não respondeu.', e?.message || e);
    if (faltouArquivo(e) && await arquivosVoltaram()) recarregarQuandoPuder();
    else tentarDeNovoDepois();
  } finally {
    tentando = false;
  }
}

window.addEventListener('online', () => {
  if (semBanco) tentarOBanco();
});

// Se o que falhou foi baixar os arquivos do Firebase, o navegador guarda a falha
// e não baixa de novo nesta página. Quando eles voltam a responder, a página
// recarrega num momento tranquilo (com a janela do pedido fechada) e volta ao
// mesmo lugar; o carrinho e o rascunho já ficam guardados no aparelho.
let recarregar = false;
const faltouArquivo = (e) => e instanceof TypeError && /module|import/i.test(e.message);

// Os arquivos respondem do mesmo jeito que o navegador os baixa (com CORS)?
async function arquivosVoltaram() {
  try {
    return (await fetch(`${FIREBASE_SDK}/firebase-app.js`, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

function recarregarQuandoPuder() {
  recarregar = true;
  if (!$('#janela-pedido').open) recarregarAgora();
}

// No máximo uma vez a cada 5 minutos, para a página nunca ficar recarregando
// sem parar; fora disso, continua tentando por trás.
function recarregarAgora() {
  // A janela abriu de novo: espera ela fechar (o fechar chama outra vez).
  if ($('#janela-pedido').open) return;
  // O voltar que desfaz o passo da janela ainda não terminou: recarregar ali
  // abriria a janela de novo. Espera mais um pouco.
  if (history.state?.janelaPedido) {
    setTimeout(recarregarAgora, 300);
    return;
  }
  let pode = false;
  try {
    pode = Date.now() - (Number(sessionStorage.getItem(CHAVE_RECARGA)) || 0) > 5 * 60000;
    if (pode) {
      sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
      sessionStorage.setItem(CHAVE_POSICAO, String(Math.round(scrollY)));
    }
  } catch {
    pode = false;
  }
  if (pode) {
    location.reload();
    return;
  }
  recarregar = false;
  tentarDeNovoDepois();
}

function voltarAPosicao() {
  let y = null;
  try {
    y = sessionStorage.getItem(CHAVE_POSICAO);
    sessionStorage.removeItem(CHAVE_POSICAO);
  } catch {
    return;
  }
  if (y != null) scrollTo(0, Number(y) || 0);
}

function atualizar(dados) {
  const devolverFoco = lembrarFoco();
  config = dados.config;
  produtos = dados.produtos
    .filter((p) => p.ativo !== false)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  for (const id of Object.keys(carrinho)) {
    if (!produtos.some((p) => p.id === id)) delete carrinho[id];
  }
  ajustarAoEstoque();
  document.title = config.nome;
  desenharLetreiro();
  desenharCardapio();
  desenharRodape();
  desenharBarra();
  if ($('#janela-pedido').open && !$('#janela-pedido').dataset.enviado) desenharFinalizar();
  devolverFoco();
}

// "Terça a sábado, das 9h às 19h": o horário de atendimento dos Ajustes ou, nas
// versões antigas, o texto livre.
function horarioDaLoja() {
  return textoAtendimento(config) || String(config.horario || '').trim();
}

// ---------- Letreiro e rodapé ----------

function desenharLetreiro() {
  $('#letreiro-local').textContent = config.cidade || '';
  $('#letreiro-local').hidden = !config.cidade;
  $('#letreiro-nome').textContent = config.nome;
  $('#letreiro-slogan').textContent = config.slogan || '';
  const info = [];
  if (config.antecedenciaHoras > 0) {
    info.push(['calendario', `Encomendas com ${num(config.antecedenciaHoras)}h de antecedência`]);
  }
  if (config.pedidoMinimo > 0) info.push(['pedidos', `Pedido mínimo ${brl(config.pedidoMinimo)}`]);
  if (config.taxaEntrega > 0) info.push(['entrega', `Entrega ${brl(config.taxaEntrega)}`]);
  else info.push(['entrega', 'Entrega grátis']);
  const horario = horarioDaLoja();
  if (horario) info.push(['relogio', horario]);
  $('#letreiro-info').innerHTML = info
    .map(([ic, txt]) => `<li>${icone(ic)}<span>${esc(txt)}</span></li>`)
    .join('');
  $('#letreiro-sobre').hidden = !config.apresentacaoPronta;
  $('#pausado').hidden = config.aceitandoPedidos !== false;
}

function desenharRodape() {
  const partes = [`<strong>${esc(config.nome)}</strong>`];
  if (config.cidade) partes.push(`<p>${esc(config.cidade)}${config.areaEntrega ? ` · ${esc(config.areaEntrega)}` : ''}</p>`);
  const horario = horarioDaLoja();
  if (horario) partes.push(`<p>${esc(horario)}</p>`);
  if (config.whatsapp) {
    partes.push(`<p>WhatsApp: <a href="${esc(linkWhats(config.whatsapp))}" target="_blank" rel="noopener">${esc(telefoneBonito(config.whatsapp))}</a></p>`);
  }
  if (config.instagram) {
    const user = config.instagram.replace(/^@/, '').trim();
    partes.push(`<p>Instagram: <a href="https://instagram.com/${encodeURIComponent(user)}" target="_blank" rel="noopener">@${esc(user)}</a></p>`);
  }
  if (config.apresentacaoPronta) partes.push(`<p><a href="sobre.html">Conheça a ${esc(config.nome)}</a></p>`);
  partes.push('<p class="rodape-vendedor"><a href="gestao.html">Área do vendedor</a></p>');
  $('#rodape').innerHTML = partes.join('');
}

// ---------- Cardápio ----------

function categorias() {
  const grupos = new Map();
  for (const p of produtos) {
    const c = p.categoria || 'Cardápio';
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(p);
  }
  return [...grupos.entries()];
}

const slug = (t) => 'cat-' + t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

function dicaDaCategoria(lista) {
  if (lista.every((p) => p.unidade === 'cento')) {
    const minimo = Math.min(...lista.map((p) => (Number(p.passo) || 1) * 100));
    return `Vendidos por cento. Você pode pedir a partir de ${num(minimo)} unidades de cada sabor.`;
  }
  const passo = Number(lista[0].passo) || 1;
  if (passo > 1 && lista.every((p) => (Number(p.rende) || 1) <= 1 && Number(p.passo) === passo)) {
    return `Escolha de ${num(passo)} em ${num(passo)} unidades de cada sabor.`;
  }
  return '';
}

// Categoria em que todo salgado tem foto vira vitrine, com as fotos grandes.
let vitrines = new Set();
const categoriaDe = (p) => p?.categoria || 'Cardápio';
const produtoDe = (id) => produtos.find((x) => x.id === id);
const passoDe = (p) => Number(p.passo) || 1;

function rotuloUnidade(p) {
  const rende = Number(p.rende) || 1;
  if (rende <= 1) return 'por unidade';
  if (p.unidade === 'cento') return 'o cento (100 un)';
  return `o ${p.unidade}`;
}

// "3 pacotes", "150 un", "6 un"
function textoDisponivel(p, qtd) {
  const rende = Number(p.rende) || 1;
  if (rende <= 1 || p.unidade === 'cento' || !Number.isInteger(qtd)) return `${num(qtd * rende)} un`;
  const palavra = String(p.unidade || 'pacote').split(' ')[0];
  return `${num(qtd)} ${qtd === 1 ? palavra : `${palavra}s`}`;
}

function qtdNoSeletor(p, qtd) {
  if (p.unidade === 'cento' || !Number.isInteger(qtd)) return `${num(qtd * (Number(p.rende) || 1))} un`;
  return num(qtd);
}

// Para o leitor de tela: "5 unidades", "50 unidades" (meio cento), "1 pacote".
function qtdFalada(p, qtd) {
  const rende = Number(p.rende) || 1;
  if (rende > 1 && p.unidade !== 'cento' && Number.isInteger(qtd)) return textoDisponivel(p, qtd);
  const n = qtd * rende;
  return `${num(n)} ${n === 1 ? 'unidade' : 'unidades'}`;
}

// O passo do − e do + no nome dos botões: "Pôr mais 5 Kibe", "Tirar 1 pacote de Kibe".
function passoFalado(p) {
  const passo = passoDe(p);
  const rende = Number(p.rende) || 1;
  if (rende > 1 && p.unidade !== 'cento' && Number.isInteger(passo)) return `${textoDisponivel(p, passo)} de`;
  return num(passo * rende);
}

function htmlSeletor(p, qtd) {
  if (!qtd) {
    if (esgotado(p) && !aceitaEncomenda(p, config)) return '<span class="item-esgotado">Esgotado</span>';
    const verbo = esgotado(p) ? 'Encomendar' : 'Adicionar';
    return `<button type="button" class="btn btn-pequeno btn-contorno" data-acao="mais" data-id="${esc(p.id)}" aria-label="${esc(`${verbo} ${p.nome} (${qtdFalada(p, passoDe(p))})`)}">${icone('mais')} ${verbo}</button>`;
  }
  const max = limiteNoSite(p, config);
  const noLimite = max != null && qtd + passoDe(p) > max + 1e-9;
  const passo = passoFalado(p);
  return `
    <div class="qtd" role="group" aria-label="Quantidade de ${esc(p.nome)}">
      <button type="button" data-acao="menos" data-id="${esc(p.id)}" aria-label="${esc(`Tirar ${passo} ${p.nome}`)}">−</button>
      <output aria-live="polite">${esc(qtdNoSeletor(p, qtd))}</output>
      <button type="button" data-acao="mais" data-id="${esc(p.id)}" aria-label="${esc(`Pôr mais ${passo} ${p.nome}`)}"${noLimite ? ' aria-disabled="true"' : ''}>+</button>
    </div>`;
}

function htmlItem(p) {
  if (vitrines.has(categoriaDe(p))) return htmlCartao(p);
  const qtd = carrinho[p.id] || 0;
  const semPronto = esgotado(p);
  const encomenda = semPronto && aceitaEncomenda(p, config);
  const classes = ['item', qtd && 'no-pedido', semPronto && !encomenda && 'esgotado', p.foto && 'com-foto'];
  return `
    <article class="${classes.filter(Boolean).join(' ')}" data-item="${esc(p.id)}">
      ${p.foto ? `<img class="item-foto" src="${esc(p.foto)}" alt="" width="96" height="96" loading="lazy" decoding="async">` : ''}
      <div class="item-corpo">
        <div class="item-linha">
          <h3>${esc(p.nome)}</h3>
          <span class="item-pontilhado" aria-hidden="true"></span>
          <span class="item-preco">${brl(p.preco)}</span>
        </div>
        ${p.descricao ? `<p class="item-desc">${esc(p.descricao)}</p>` : ''}
        ${encomenda ? '<p class="item-aviso">Os prontos acabaram: fica sob encomenda.</p>' : ''}
        <div class="item-acoes">
          <span class="item-unidade">${esc(rotuloUnidade(p))}</span>
          ${htmlSeletor(p, qtd)}
        </div>
      </div>
    </article>`;
}

// O mesmo salgado na vitrine: foto grande em cima, nome, preço e quantidade embaixo.
function htmlCartao(p) {
  const qtd = carrinho[p.id] || 0;
  const semPronto = esgotado(p);
  const encomenda = semPronto && aceitaEncomenda(p, config);
  const classes = ['cartao', qtd && 'no-pedido', semPronto && !encomenda && 'esgotado'];
  return `
    <article class="${classes.filter(Boolean).join(' ')}" data-item="${esc(p.id)}">
      <img class="cartao-foto" src="${esc(p.foto)}" alt="" width="320" height="320" loading="lazy" decoding="async">
      <div class="cartao-corpo">
        <h3>${esc(p.nome)}</h3>
        <p class="cartao-preco"><span class="item-preco">${brl(p.preco)}</span> <span class="item-unidade">${esc(rotuloUnidade(p))}</span></p>
        ${p.descricao ? `<p class="item-desc">${esc(p.descricao)}</p>` : ''}
        ${encomenda ? '<p class="item-aviso">Os prontos acabaram: fica sob encomenda.</p>' : ''}
        <div class="cartao-acoes">${htmlSeletor(p, qtd)}</div>
      </div>
    </article>`;
}

function desenharCardapio() {
  const grupos = categorias();
  $('#categorias-lista').innerHTML = grupos
    .map(([nome]) => `<a href="#${slug(nome)}" data-categoria="${slug(nome)}">${esc(nome)}</a>`)
    .join('');
  $('#categorias').hidden = grupos.length < 2;

  if (!grupos.length) {
    $('#cardapio').innerHTML = '<p class="vazio-cardapio">O cardápio está sendo preparado. Volte daqui a pouco!</p>';
    return;
  }
  vitrines = new Set(grupos.filter(([, lista]) => lista.every((p) => p.foto)).map(([nome]) => nome));
  // O título da seção aceita foco: os atalhos do topo levam o teclado até ele.
  $('#cardapio').innerHTML = grupos.map(([nome, lista]) => {
    const dica = dicaDaCategoria(lista);
    const itens = lista.map(htmlItem).join('');
    return `
      <section class="secao" id="${slug(nome)}" aria-labelledby="${slug(nome)}-titulo">
        <h2 id="${slug(nome)}-titulo" tabindex="-1">${esc(nome)}</h2>
        ${dica ? `<p class="secao-dica">${esc(dica)}</p>` : ''}
        ${vitrines.has(nome) ? `<div class="vitrine">${itens}</div>` : itens}
      </section>`;
  }).join('');
}

function redesenharItem(id) {
  const p = produtoDe(id);
  const atual = document.querySelector(`[data-item="${CSS.escape(id)}"]`);
  if (p && atual) atual.outerHTML = htmlItem(p);
}

// ---------- Foco e leitor de tela ----------

// Redesenhar troca os botões e os campos, e o foco do teclado se perde. Guarda
// onde ele estava (o mesmo campo, ou a mesma ação no mesmo salgado) e devolve
// depois. Se o botão sumiu ("Adicionar" virou − e +), vai para o + do mesmo salgado.
function lembrarFoco() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return () => {};
  const acao = el.dataset?.acao;
  const id = el.dataset?.id || '';
  const noResumo = Boolean(el.closest('#resumo-itens'));
  const naBarra = Boolean(el.closest('#barra-pedido'));
  const noCardapio = Boolean(el.closest('#cardapio'));
  const linhas = noResumo ? [...$('#resumo-itens').querySelectorAll('.resumo-item')] : [];
  const indice = linhas.indexOf(el.closest('.resumo-item'));
  const campo = { id: el.id, nome: el.name, valor: el.value, inicio: el.selectionStart, fim: el.selectionEnd };
  return () => {
    if (el.isConnected && document.activeElement === el) return;
    let alvo = null;
    if (acao && noResumo) {
      const resumo = $('#resumo-itens');
      const botao = (a) => resumo?.querySelector(`[data-acao="${a}"][data-id="${CSS.escape(id)}"]`);
      const agora = resumo ? [...resumo.querySelectorAll('.resumo-item')] : [];
      const vizinha = agora[Math.min(Math.max(indice, 0), agora.length - 1)];
      // Se o sabor saiu da lista, o foco vai para o nome do sabor que ficou no
      // lugar, nunca para o − ou o + dele: um Enter a mais não tira nada.
      alvo = botao(acao) || botao('mais') || vizinha?.querySelector('.nome') || resumo;
    } else if (acao && naBarra) {
      alvo = $(`#barra-pedido [data-acao="${acao}"]`);
    } else if (acao && noCardapio) {
      const cartao = $('#cardapio').querySelector(`[data-item="${CSS.escape(id)}"]`);
      alvo = cartao?.querySelector(`[data-acao="${acao}"]`) || cartao?.querySelector('[data-acao="mais"]');
    } else if (campo.id) {
      alvo = document.getElementById(campo.id);
    } else if (campo.nome) {
      alvo = [...document.querySelectorAll(`#form-pedido [name="${CSS.escape(campo.nome)}"]`)].find((x) => x.value === campo.valor);
    }
    if (!alvo?.isConnected || alvo.closest('[hidden]')) return;
    alvo.focus({ preventScroll: true });
    if (campo.inicio != null && alvo.setSelectionRange) {
      try { alvo.setSelectionRange(campo.inicio, campo.fim); } catch { /* campo sem seleção */ }
    }
  };
}

// Aviso falado, sem mexer no foco. Com a janela aberta o resto da página fica
// fora do alcance do leitor de tela, então o aviso vai na região de dentro dela.
let anuncios = [];
let anuncioTimer = null;
function anunciar(texto) {
  if (!texto) return;
  anuncios.push(texto);
  // As regiões podem faltar se o navegador ainda tiver a página antiga guardada.
  const fora = $('#anuncio');
  const dentro = $('#anuncio-janela');
  if (fora) fora.textContent = '';
  if (dentro) dentro.textContent = '';
  clearTimeout(anuncioTimer);
  anuncioTimer = setTimeout(() => {
    const regiao = $('#janela-pedido').open ? dentro : fora;
    if (regiao) regiao.textContent = anuncios.join(' ');
    anuncios = [];
  }, 120);
}

// ---------- Carrinho ----------

function mudarQtd(id, direcao) {
  const p = produtoDe(id);
  if (!p) return;
  const passo = passoDe(p);
  const antes = carrinho[id] || 0;
  const nova = Math.max(0, Math.round((antes + direcao * passo) * 100) / 100);
  const max = limiteNoSite(p, config);
  if (direcao > 0 && max != null && nova > max + 1e-9) {
    avisoRapido(max > 0 ? `Só temos ${textoDisponivel(p, max)} de ${p.nome} agora.` : `${p.nome} esgotou.`);
    return;
  }
  if (nova > 0) carrinho[id] = nova; else delete carrinho[id];
  gravarLocal(CHAVE_CARRINHO, carrinho);
  redesenharItem(id);
  desenharBarra();
  anunciar(nova > 0 ? `${p.nome}: ${qtdFalada(p, nova)} no pedido.` : `${p.nome} saiu do pedido.`);
  // Passou do que tem pronto: avisa uma vez que o resto fica sob encomenda.
  if (direcao > 0 && aceitaEncomenda(p, config) && parteEncomendada(p, nova) > 0 && !(parteEncomendada(p, antes) > 0)) {
    const tem = maximoParaVender(p);
    avisoRapido(tem > 0
      ? `Temos ${textoDisponivel(p, tem)} de ${p.nome} prontos. O resto fica sob encomenda.`
      : `${p.nome} fica sob encomenda.`);
  }
}

// O estoque mudou (ou o carrinho ficou guardado de outro dia): tira do
// carrinho o que passou do que tem pronto, se o salgado não aceita encomenda.
function ajustarAoEstoque() {
  const ajustados = [];
  for (const [id, qtd] of Object.entries(carrinho)) {
    const p = produtoDe(id);
    const max = limiteNoSite(p, config);
    if (max == null || qtd <= max + 1e-9) continue;
    if (max > 0) carrinho[id] = max; else delete carrinho[id];
    ajustados.push([p, max]);
  }
  if (!ajustados.length) return;
  gravarLocal(CHAVE_CARRINHO, carrinho);
  const [p, max] = ajustados[0];
  if (ajustados.length > 1) avisoRapido('Alguns salgados acabaram. Ajustamos seu pedido.');
  else if (max > 0) avisoRapido(`Só temos ${textoDisponivel(p, max)} de ${p.nome} agora. Ajustamos seu pedido.`);
  else avisoRapido(`${p.nome} esgotou e saiu do seu pedido.`);
}

function itensDoCarrinho() {
  return Object.entries(carrinho)
    .map(([id, qtd]) => {
      const p = produtoDe(id);
      if (!p || !(qtd > 0)) return null;
      const item = { produtoId: p.id, nome: p.nome, preco: Number(p.preco) || 0, qtd, rende: Number(p.rende) || 1, unidade: p.unidade || 'unidade' };
      const encomenda = aceitaEncomenda(p, config) ? parteEncomendada(p, qtd) : 0;
      if (encomenda > 0) item.encomenda = encomenda;
      return item;
    })
    .filter(Boolean);
}

// O pedido só tem salgados? (Categoria com "salgado" no nome.)
function soSalgados(itens) {
  return itens.every((it) => /salgad/i.test(categoriaDe(produtoDe(it.produtoId))));
}

// "20 salgados"; com doces no pedido, "45 unidades".
function textoUnidades(itens) {
  const n = unidadesDoPedido(itens);
  const palavra = soSalgados(itens) ? ['salgado', 'salgados'] : ['unidade', 'unidades'];
  return `${num(n)} ${n === 1 ? palavra[0] : palavra[1]}`;
}

// "salgados e doces", "a, b e c"
function juntar(lista) {
  return lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

// O que a sugestão contou: '' quando o pedido só tem salgados; " (salgados e
// doces juntos)" ou " (só doces)" quando entra outra categoria.
function oQueEntraNaConta(itens) {
  if (!itens.length || soSalgados(itens) || categorias().length < 2) return '';
  const presentes = new Set(itens.map((it) => categoriaDe(produtoDe(it.produtoId))));
  const nomes = categorias().map(([nome]) => nome).filter((nome) => presentes.has(nome)).map((nome) => nome.toLowerCase());
  return nomes.length > 1 ? ` (${juntar(nomes)} juntos)` : ` (só ${nomes[0]})`;
}

// A bolinha mostra quantos salgados (unidades) tem o pedido, não quantos sabores.
function desenharBarra() {
  const itens = itensDoCarrinho();
  const barra = $('#barra-pedido');
  barra.hidden = !itens.length;
  if (!itens.length) return;
  const { subtotal } = totaisPedido({ itens });
  barra.innerHTML = `
    <button type="button" class="btn" data-acao="abrir-pedido" aria-label="${esc(`Ver pedido: ${textoUnidades(itens)}, ${brl(subtotal)}`)}">
      <span><span class="barra-contagem">${num(unidadesDoPedido(itens))}</span>Ver pedido</span>
      <span class="num">${brl(subtotal)}</span>
    </button>`;
}

// ---------- Finalizar pedido ----------

// O primeiro dia e horário que dá para pedir, pelos salgados do carrinho.
function prazoMinimo() {
  const quando = primeiroHorario(unidadesDoPedido(itensDoCarrinho()), config);
  return { data: isoLocal(quando), hora: horaLocal(quando) };
}

// Dá para pedir com até um ano de antecedência.
const ultimoDia = () => somarDias(hojeISO(), 365);

// 540 vira "09:00".
function hhmm(minutos) {
  const m = Math.min(minutos, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// "hoje às 16:45", "amanhã às 04:45" ou "quarta, 05/11 às 10:00"
function textoPrazo(prazo) {
  return `${dataRelativa(prazo.data).toLowerCase()} às ${prazo.hora}`;
}

// Por que o primeiro horário é aquele; vazio quando não há regra nenhuma.
// Com doces no pedido, conta "unidades", como a barra.
function motivoPrazo(itens) {
  const preparo = minutosDePreparo(unidadesDoPedido(itens), config);
  const antecedencia = (Number(config.antecedenciaHoras) || 0) * 60;
  if (preparo > 0 && preparo >= antecedencia) {
    return `Para ${textoUnidades(itens)}, a gente precisa de ${textoDuracao(preparo)} para preparar`;
  }
  if (antecedencia > 0) return `Encomendas com ${num(config.antecedenciaHoras)}h de antecedência`;
  return '';
}

// Agora está fora do horário de atendimento?
function fechadaAgora() {
  if (!atendimento(config)) return false;
  const agora = new Date();
  return Object.keys(foraDoAtendimento(isoLocal(agora), horaLocal(agora), config)).length > 0;
}

// "A Bibi está fechada agora: para 25 salgados, o primeiro horário é amanhã às
// 10:00." ou "Para 300 salgados, a gente precisa de 6 horas para preparar: o
// primeiro horário é hoje às 16:45." Vazio quando não há regra nenhuma.
function textoDoPrazo(itens, prazo) {
  const quando = `<strong>${esc(textoPrazo(prazo))}</strong>`;
  if (fechadaAgora()) {
    return itens.length
      ? `A Bibi está fechada agora: para ${esc(textoUnidades(itens))}, o primeiro horário é ${quando}.`
      : `A Bibi está fechada agora: o primeiro horário é ${quando}.`;
  }
  const motivo = motivoPrazo(itens);
  return motivo ? `${esc(motivo)}: o primeiro horário é ${quando}.` : '';
}

// Dia ou horário fora do possível: faltando, antes do primeiro horário (o tempo
// de fritar), mais de um ano à frente ou com a Bibi fechada.
function errosDoPrazo(form) {
  const prazo = prazoMinimo();
  const ultimo = ultimoDia();
  if (!form.data) return { data: 'Escolha o dia.' };
  if (form.data < prazo.data) return { data: `O primeiro dia possível é ${dataRelativa(prazo.data).toLowerCase()}.` };
  if (form.data > ultimo) return { data: `Confira o ano: dá para pedir até ${dataCurta(ultimo)}/${ultimo.slice(0, 4)}.` };
  const fora = foraDoAtendimento(form.data, form.hora, config);
  if (fora.data) return { data: fora.data };
  if (!form.hora) return { hora: 'Escolha o horário.' };
  if (form.data === prazo.data && form.hora < prazo.hora) return { hora: `Escolha a partir das ${prazo.hora}.` };
  if (fora.hora) return { hora: fora.hora };
  return {};
}

function lerFormulario() {
  const f = $('#form-pedido');
  const v = (nome) => (f.elements[nome]?.value || '').trim();
  return {
    nome: v('nome'),
    telefone: v('telefone'),
    tipo: f.elements.tipo?.value || 'retirada',
    endereco: v('endereco'),
    data: v('data'),
    hora: v('hora'),
    forma: f.elements.forma?.value || '',
    obs: v('obs'),
    ocasiao: f.elements.ocasiao?.value || '',
    pessoas: v('pessoas'),
  };
}

// ---------- Rascunho do pedido ----------

const CAMPOS = ['nome', 'telefone', 'tipo', 'endereco', 'data', 'hora', 'forma', 'obs', 'ocasiao', 'pessoas'];

function guardarRascunho() {
  if (!$('#form-pedido').elements.nome) return;
  rascunho = lerFormulario();
  gravarLocal(CHAVE_RASCUNHO, rascunho);
}

function apagarRascunho() {
  rascunho = null;
  try {
    localStorage.removeItem(CHAVE_RASCUNHO);
  } catch {
    // Navegador sem espaço guardado: não há o que apagar.
  }
}

// O rascunho guardado; um dia que já passou volta para o primeiro possível.
function doRascunho(prazo) {
  if (!rascunho || typeof rascunho !== 'object') return null;
  const form = Object.fromEntries(CAMPOS.map((c) => [c, String(rascunho[c] ?? '')]));
  if (!form.data || form.data < hojeISO()) form.data = prazo.data;
  return form;
}

function ocasioesDoSite() {
  return (config.ocasioes || []).filter((o) => o?.nome);
}

// "Quantas pessoas?" é opcional e aceita só número inteiro, de 1 a 10.000
// ("1.000" também vale). Devolve { pessoas } (0 se vazio) ou { erro }.
function lerPessoas(texto) {
  const t = String(texto || '').trim();
  if (!t) return { pessoas: 0 };
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(t)) return { erro: 'Escreva só o número de pessoas, por exemplo 30.' };
  const n = Number(t.replace(/\./g, ''));
  if (n < 1) return { erro: 'Escreva um número de pessoas a partir de 1.' };
  if (n > 10000) return { erro: 'O máximo aqui é 10.000 pessoas. Para mais, fale com a gente no WhatsApp.' };
  return { pessoas: n };
}

// O WhatsApp do cliente é opcional; preenchido, precisa do DDD (10 ou 11
// números, sem contar o 0 do interurbano e o 55).
function erroTelefone(texto) {
  if (!texto) return '';
  if (/^55\d{10,11}$/.test(telefoneWhats(texto))) return '';
  // O exemplo fica numa linha só: espaço fixo e um sinal invisível que segura o hífen.
  return 'Escreva com DDD, como (17)\u00a099123-\u20604567, ou deixe em branco.';
}

function montarPedido(form) {
  const itens = itensDoCarrinho();
  const base = {
    itens,
    entrega: { tipo: form.tipo, endereco: form.tipo === 'entrega' ? form.endereco : '' },
    taxaEntrega: Number(config.taxaEntrega) || 0,
    desconto: 0,
  };
  const t = totaisPedido(base);
  const pessoas = lerPessoas(form.pessoas).pessoas || 0;
  return {
    ...(form.ocasiao ? { ocasiao: { tipo: form.ocasiao, ...(pessoas > 0 ? { pessoas } : {}) } } : {}),
    id: `site-${codigo}-${Date.now().toString(36)}`,
    codigo,
    criadoEm: new Date().toISOString(),
    origem: 'Site',
    status: 'novo',
    cliente: { nome: form.nome, telefone: form.telefone },
    entrega: base.entrega,
    dataEntrega: form.data,
    hora: form.hora,
    itens,
    subtotal: t.subtotal,
    taxaEntrega: t.taxaEntrega,
    desconto: 0,
    total: t.total,
    pagamento: { forma: form.forma, pago: false, pagoEm: '' },
    obs: form.obs,
  };
}

function montarMensagem(pedido) {
  const l = [`Olá, ${config.nome}! Quero fazer um pedido:`, ''];
  for (const it of pedido.itens) {
    const encomenda = textoEncomenda(it);
    l.push(`• ${textoQtd(it)} ${it.nome}${encomenda ? ` (${encomenda})` : ''} = ${brl(it.preco * it.qtd)}`);
  }
  l.push('');
  if (pedido.taxaEntrega > 0) {
    l.push(`Subtotal: ${brl(pedido.subtotal)}`);
    l.push(`Entrega: ${brl(pedido.taxaEntrega)}`);
  }
  l.push(`*Total: ${brl(pedido.total)}*`, '');
  l.push(`*Nome:* ${pedido.cliente.nome || '(não informado)'}`);
  if (pedido.ocasiao) l.push(`*Ocasião:* ${textoOcasiao(pedido.ocasiao)}`);
  l.push(pedido.entrega.tipo === 'entrega' ? `*Entrega em:* ${pedido.entrega.endereco}` : '*Vou retirar*');
  if (pedido.dataEntrega) l.push(`*Para:* ${dataComDia(pedido.dataEntrega)}${pedido.hora ? ` às ${pedido.hora}` : ''}`);
  if (pedido.pagamento.forma) l.push(`*Pagamento:* ${textoPagamento(pedido.pagamento.forma, pedido.entrega.tipo)}`);
  if (pedido.obs) l.push(`*Obs.:* ${pedido.obs}`);
  l.push('', `Pedido #${pedido.codigo} (feito pelo site)`);
  return l.join('\n');
}

// Para quem vai buscar, "na entrega" e "antes da entrega" viram "na retirada" e
// "antes da retirada". O nome gravado no pedido continua o dos Ajustes.
const paraRetirada = (texto, tipo) => (tipo === 'entrega' ? texto : String(texto).replace(/\b(na|antes da) entrega\b/gi, '$1 retirada'));

// Como a forma de pagamento aparece no WhatsApp: nas formas antecipadas, o
// cliente já diz o que vai fazer.
function textoPagamento(forma, tipo) {
  if (forma === PIX_ANTECIPADO) return paraRetirada('Pix antes da entrega (mando o comprovante por aqui)', tipo);
  if (forma === CARTAO_PELO_LINK) return paraRetirada('Cartão de crédito antes da entrega (pode me mandar o link de pagamento)', tipo);
  if (forma === CARTAO_NO_SITE) return 'Cartão de crédito pelo site (vou pagar agora)';
  return paraRetirada(forma, tipo);
}

function rotuloForma(forma, tipo) {
  return paraRetirada(ROTULO_FORMA[forma] || forma, tipo);
}

function validar(form, pedido) {
  const erros = {};
  const minimo = Number(config.pedidoMinimo) || 0;
  if (!pedido.itens.length) erros.itens = 'Escolha pelo menos um salgado no cardápio.';
  else if (pedido.subtotal < minimo) erros.itens = `O pedido mínimo é de ${brl(minimo)}.`;
  if (ocasioesDoSite().length && !form.ocasiao) erros.ocasiao = 'Escolha a ocasião do pedido.';
  const { erro: erroPessoas } = lerPessoas(form.pessoas);
  if (erroPessoas) erros.pessoas = erroPessoas;
  if (!form.nome) erros.nome = 'Diga seu nome para a gente saber de quem é o pedido.';
  if (erroTelefone(form.telefone)) erros.telefone = erroTelefone(form.telefone);
  if (form.tipo === 'entrega' && form.endereco.length < 6) erros.endereco = 'Informe rua, número e bairro.';
  Object.assign(erros, errosDoPrazo(form));
  for (const it of pedido.itens) {
    const p = produtoDe(it.produtoId);
    const max = limiteNoSite(p, config);
    if (max != null && it.qtd > max + 1e-9) {
      erros.itens = max > 0 ? `Só temos ${textoDisponivel(p, max)} de ${p.nome}.` : `${p.nome} esgotou. Tire do pedido para continuar.`;
    }
  }
  return erros;
}

function desenharFinalizar() {
  const janela = $('#janela-pedido');
  delete janela.dataset.enviado;
  const salvo = lerLocal(CHAVE_CLIENTE, {}) || {};
  const antecipadas = formasAntecipadas(config);
  const formas = antecipadas.length ? antecipadas
    : (config.formasPagamento?.length ? config.formasPagamento : ['Pix', 'Dinheiro']);
  const prazo = prazoMinimo();
  // O que já está na janela; senão, o rascunho guardado; senão, os dados do
  // último pedido feito neste aparelho.
  const naTela = $('#form-pedido').elements.nome ? lerFormulario() : null;
  // Avisos de campo que já estavam na tela voltam depois de redesenhar (o
  // cardápio pode mudar com a janela aberta). Dia e horário são conferidos de novo.
  const avisosNaTela = naTela
    ? [...document.querySelectorAll('#form-pedido [data-erro]')]
      .filter((el) => !el.hidden && !['data', 'hora', 'itens'].includes(el.dataset.erro))
      .map((el) => [el.dataset.erro, el.textContent])
    : [];
  const form = naTela || doRascunho(prazo) || {
    nome: salvo.nome || '', telefone: salvo.telefone || '', tipo: salvo.tipo || 'retirada',
    endereco: salvo.endereco || '', data: prazo.data, hora: '', forma: formas[0], obs: '',
    ocasiao: '', pessoas: '',
  };
  if (!formas.includes(form.forma)) form.forma = formas[0];
  const itens = itensDoCarrinho();
  const ocasioes = ocasioesDoSite();
  const a = atendimento(config);
  const horario = horarioDaLoja();
  const sobreHorario = horario ? ' data-descricao="horario-atendimento"' : '';

  // Cada campo é nomeado só pelo seu rótulo (aria-labelledby) e ganha o aviso
  // de erro como descrição quando ele aparece (veja marcarErro).
  $('#titulo-pedido').textContent = 'Seu pedido';
  $('#corpo-pedido').innerHTML = `
    <div class="resumo-itens" id="resumo-itens" tabindex="-1">${htmlResumo(itens)}</div>
    <p class="erro-campo" data-erro="itens" id="erro-itens" role="alert" tabindex="-1" hidden></p>

    ${ocasioes.length ? `
      <fieldset class="bloco" style="border:0;padding:0;margin:0">
        <legend class="rotulo" style="margin-bottom:.6rem">Qual é a ocasião?</legend>
        <div class="opcoes">
          ${ocasioes.map((o) => `<label class="opcao"><input type="radio" name="ocasiao" value="${esc(o.nome)}" ${form.ocasiao === o.nome ? 'checked' : ''}> ${esc(o.nome)}</label>`).join('')}
        </div>
        <span class="erro-campo" data-erro="ocasiao" id="erro-ocasiao" role="alert" hidden></span>
        <label class="campo campo-pessoas"><span id="rotulo-pessoas">Quantas pessoas? (opcional)</span>
          <input name="pessoas" id="pessoas" inputmode="numeric" autocomplete="off" maxlength="9" value="${esc(form.pessoas)}" placeholder="Ex.: 30" aria-labelledby="rotulo-pessoas">
          <span class="erro-campo" data-erro="pessoas" id="erro-pessoas" role="alert" hidden></span>
        </label>
        <p class="sugestao" id="sugestao" aria-live="polite" hidden></p>
      </fieldset>` : ''}

    <fieldset class="bloco" style="border:0;padding:0;margin:0">
      <legend class="rotulo" style="margin-bottom:.6rem">Como você quer receber?</legend>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="tipo" value="retirada" ${form.tipo !== 'entrega' ? 'checked' : ''}> Vou retirar</label>
        <label class="opcao"><input type="radio" name="tipo" value="entrega" ${form.tipo === 'entrega' ? 'checked' : ''}> Entregar ${config.taxaEntrega > 0 ? `(+ ${brl(config.taxaEntrega)})` : '(grátis)'}</label>
      </div>
      <label class="campo" id="campo-endereco" ${form.tipo === 'entrega' ? '' : 'hidden'}>
        <span id="rotulo-endereco">Endereço de entrega</span>
        <textarea name="endereco" id="endereco" rows="2" maxlength="300" autocomplete="street-address" placeholder="Rua, número, bairro e complemento" aria-labelledby="rotulo-endereco"${config.areaEntrega ? ' aria-describedby="area-entrega" data-descricao="area-entrega"' : ''}>${esc(form.endereco)}</textarea>
        ${config.areaEntrega ? `<small id="area-entrega">${esc(config.areaEntrega)}</small>` : ''}
        <span class="erro-campo" data-erro="endereco" id="erro-endereco" role="alert" hidden></span>
      </label>
      <p class="suave" id="nota-retirada" ${form.tipo === 'entrega' ? 'hidden' : ''}>O endereço para retirar a gente passa pelo WhatsApp.</p>
    </fieldset>

    <div class="bloco">
      <h3>Para quando?</h3>
      <div class="duas-colunas">
        <label class="campo"><span id="rotulo-data">Dia</span>
          <input type="date" name="data" id="data" min="${prazo.data}" max="${ultimoDia()}" value="${esc(form.data || prazo.data)}" aria-labelledby="rotulo-data"${horario ? ' aria-describedby="horario-atendimento"' : ''}${sobreHorario}>
          <span class="erro-campo" data-erro="data" id="erro-data" role="alert" hidden></span>
        </label>
        <label class="campo"><span id="rotulo-hora">Horário</span>
          <input type="time" name="hora" id="hora" value="${esc(form.hora)}" step="900"${a ? ` min="${hhmm(a.abre)}" max="${hhmm(a.fecha)}"` : ''} aria-labelledby="rotulo-hora"${horario ? ' aria-describedby="horario-atendimento"' : ''}${sobreHorario}>
          <span class="erro-campo" data-erro="hora" id="erro-hora" role="alert" hidden></span>
        </label>
      </div>
      <p class="sugestao" id="prazo" aria-live="polite" hidden></p>
      ${horario ? `<small class="suave" id="horario-atendimento">${esc(horario)}</small>` : ''}
    </div>

    <div class="bloco">
      <h3>Seus dados</h3>
      <div class="duas-colunas">
        <label class="campo"><span id="rotulo-nome">Nome</span>
          <input name="nome" id="nome" autocomplete="name" value="${esc(form.nome)}" maxlength="80" aria-labelledby="rotulo-nome">
          <span class="erro-campo" data-erro="nome" id="erro-nome" role="alert" hidden></span>
        </label>
        <label class="campo"><span id="rotulo-telefone">WhatsApp (opcional)</span>
          <input name="telefone" id="telefone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(form.telefone)}" placeholder="(17) 99999-9999" maxlength="20" aria-labelledby="rotulo-telefone">
          <span class="erro-campo" data-erro="telefone" id="erro-telefone" role="alert" hidden></span>
        </label>
      </div>
    </div>

    <fieldset class="bloco" style="border:0;padding:0;margin:0">
      <legend class="rotulo" style="margin-bottom:.6rem" id="legenda-pagamento">${esc(legendaPagamento(antecipadas, form.tipo))}</legend>
      <div class="opcoes">
        ${formas.map((f) => `<label class="opcao"><input type="radio" name="forma" value="${esc(f)}" ${form.forma === f ? 'checked' : ''}> <span data-rotulo-forma>${esc(rotuloForma(f, form.tipo))}</span></label>`).join('')}
      </div>
      ${antecipadas.length ? `<small class="suave dica-pagamento" id="dica-pagamento">${esc(DICA_FORMA[form.forma])}</small>` : ''}
    </fieldset>

    <label class="campo"><span id="rotulo-obs">Observações (opcional)</span>
      <textarea name="obs" id="obs" rows="2" maxlength="${LIMITE_OBS}" placeholder="Ex.: separar em duas caixas, sem cebola…" aria-labelledby="rotulo-obs" aria-describedby="obs-conta" data-descricao="obs-conta">${esc(form.obs)}</textarea>
      <small id="obs-conta" hidden></small>
      <span class="erro-campo" id="obs-limite" role="status" hidden></span>
    </label>

    <div class="totais" id="totais"></div>`;

  $('#rodape-pedido').innerHTML = config.aceitandoPedidos === false
    ? '<p class="alerta-minimo" style="margin-right:auto">Os pedidos pelo site estão pausados no momento.</p>'
    : `<a class="btn btn-whats btn-largo" id="enviar-whats" href="#" target="_blank" rel="noopener">${icone('conversa')} Enviar pedido pelo WhatsApp</a>`;
  obsColouDemais = false;
  desenharContaObs();
  atualizarFinalizar();
  // Um rascunho de outro dia pode trazer escolhas que não valem mais: já avisa.
  if (!naTela) {
    const { erro } = lerPessoas(form.pessoas);
    if (erro) marcarErro('pessoas', erro);
    if (erroTelefone(form.telefone)) marcarErro('telefone', erroTelefone(form.telefone));
  }
  for (const [nome, msg] of avisosNaTela) marcarErro(nome, msg);
}

const ROTULO_FORMA = { [PIX_ANTECIPADO]: 'Pix', [CARTAO_PELO_LINK]: 'Cartão de crédito', [CARTAO_NO_SITE]: 'Cartão de crédito' };
const DICA_FORMA = {
  [PIX_ANTECIPADO]: 'Depois de enviar o pedido, aparece o código Pix com o valor certo. O pedido é confirmado quando o pagamento cai.',
  [CARTAO_PELO_LINK]: 'A gente manda o link para pagar no cartão pelo WhatsApp. O pedido é confirmado depois do pagamento.',
  [CARTAO_NO_SITE]: 'Depois de enviar o pedido, você paga aqui mesmo, na página segura da InfinitePay, no crédito em até 12x.',
};

function legendaPagamento(antecipadas, tipo) {
  return antecipadas.length ? paraRetirada('Pagamento antes da entrega', tipo) : 'Pagamento';
}

function htmlResumo(itens) {
  if (!itens.length) return '<p class="suave">Seu pedido está vazio. Escolha um salgado no cardápio.</p>';
  return itens.map((it) => {
    const p = produtoDe(it.produtoId);
    const encomenda = textoEncomenda(it);
    return `
      <div class="resumo-item">
        <span class="nome" tabindex="-1">${esc(it.nome)}</span>
        <span class="preco">${brl(it.preco * it.qtd)}</span>
        <span class="unit">${brl(it.preco)} ${esc(rotuloUnidade(p))}${encomenda ? `<span class="resumo-encomenda">${esc(encomenda)}</span>` : ''}</span>
        ${htmlSeletor(p, it.qtd)}
      </div>`;
  }).join('');
}

function atualizarFinalizar() {
  const form = lerFormulario();
  const pedido = montarPedido(form);
  const t = pedido;
  const minimo = Number(config.pedidoMinimo) || 0;
  // "Subtotal", o mesmo nome da mensagem do WhatsApp. Pedido vazio não fala de mínimo.
  $('#totais').innerHTML = `
    ${t.taxaEntrega > 0 ? `<div><span>Subtotal</span><span>${brl(t.subtotal)}</span></div><div><span>Entrega</span><span>${brl(t.taxaEntrega)}</span></div>` : ''}
    <div class="total"><span>Total</span><span>${brl(t.total)}</span></div>
    ${t.itens.length && t.subtotal < minimo ? `<p class="alerta-minimo">Pedido mínimo: ${brl(minimo)}. Faltam ${brl(minimo - t.subtotal)}.</p>` : ''}`;
  const botao = $('#enviar-whats');
  if (botao) {
    botao.href = config.whatsapp ? linkWhats(config.whatsapp, montarMensagem(pedido)) : '#';
  }
  desenharSugestao(pedido);
  desenharPrazo(form, pedido);
}

// Troca o texto de um aviso só quando ele muda, para o leitor de tela não
// repetir o mesmo aviso a cada letra digitada em outro campo.
function trocarAviso(el, html) {
  el.hidden = !html;
  if (el.dataset.texto === html) return;
  el.dataset.texto = html;
  el.innerHTML = html;
}

// "Para 300 salgados, a gente precisa de 6 horas para preparar: o primeiro
// horário é hoje às 16:45." Muda com os salgados do pedido; com dia ou horário
// escolhidos, já avisa se não dá.
function desenharPrazo(form, pedido) {
  const el = $('#prazo');
  if (!el) return;
  const prazo = prazoMinimo();
  // Mexer no min ou no max do Dia apaga a data que o cliente está digitando
  // (no Chrome): só troca quando o limite muda.
  const dia = $('#data');
  if (dia.min !== prazo.data) dia.min = prazo.data;
  if (dia.max !== ultimoDia()) dia.max = ultimoDia();
  trocarAviso(el, textoDoPrazo(pedido.itens, prazo));
  // Ao vivo, só confere o que o cliente já escolheu; o que falta é cobrado no
  // Enviar. Ano que começa com 0 (0002, 0020...) ainda está sendo digitado.
  const erros = errosDoPrazo(form);
  if (form.data && !form.data.startsWith('0')) marcarErro('data', erros.data);
  if (form.hora) marcarErro('hora', erros.hora);
}

// "Para 30 pessoas, a gente sugere uns 360 salgados", pela ocasião escolhida.
// "Dá certinho" só até 20% acima da sugestão; mais que isso, diz quanto passou.
function desenharSugestao(pedido) {
  const el = $('#sugestao');
  if (!el) return;
  const s = sugestaoDeSalgados(pedido.ocasiao, config.ocasioes);
  if (!s) {
    trocarAviso(el, '');
    return;
  }
  const tem = unidadesDoPedido(pedido.itens);
  const conta = oQueEntraNaConta(pedido.itens);
  let situacao = '';
  if (tem > 0 && tem < s.total) situacao = ` Seu pedido tem ${num(tem)}${conta}: faltam uns ${num(s.total - tem)}.`;
  else if (tem > s.total * 1.2) situacao = ` Seu pedido tem ${num(tem)}${conta}: passa uns ${num(tem - s.total)} da sugestão.`;
  else if (tem >= s.total) situacao = ` Seu pedido tem ${num(tem)}${conta}: dá certinho.`;
  trocarAviso(el, `Para ${num(s.pessoas)} ${s.pessoas === 1 ? 'pessoa' : 'pessoas'}, a gente sugere uns <strong>${num(s.total)} salgados</strong> (${num(s.porPessoa)} por pessoa).${esc(situacao)}`);
}

// Observação: até 500 letras (regra do banco). Perto do fim mostra quantas
// faltam; no limite, ou quando um texto colado não coube, avisa.
function desenharContaObs() {
  const campo = $('#obs');
  const conta = $('#obs-conta');
  const limite = $('#obs-limite');
  if (!campo || !conta || !limite) return;
  const faltam = LIMITE_OBS - campo.value.length;
  conta.hidden = faltam > 100 || faltam <= 0 || obsColouDemais;
  conta.textContent = conta.hidden ? '' : faltam === 1 ? 'Falta 1 letra.' : `Faltam ${num(faltam)} letras.`;
  let aviso = '';
  if (obsColouDemais) aviso = `O texto colado passou de ${LIMITE_OBS} letras e o fim ficou de fora. Confira antes de enviar.`;
  else if (faltam <= 0) aviso = `Você chegou ao limite de ${LIMITE_OBS} letras.`;
  limite.hidden = !aviso;
  if (limite.textContent !== aviso) limite.textContent = aviso;
}

// Mostra ou tira o aviso de um campo: texto, cor, aria-invalid e
// aria-describedby, para o leitor de tela dizer o que está errado.
function marcarErro(nome, msg) {
  const aviso = document.querySelector(`#form-pedido [data-erro="${nome}"]`);
  if (aviso) {
    aviso.hidden = !msg;
    if (aviso.textContent !== (msg || '')) aviso.textContent = msg || '';
  }
  const elemento = $('#form-pedido').elements[nome];
  const campos = elemento instanceof RadioNodeList ? [...elemento] : elemento ? [elemento] : [];
  for (const c of campos) {
    if (c.type !== 'radio') c.classList.toggle('campo-invalido', Boolean(msg));
    if (msg) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid');
    const descricao = [c.dataset.descricao, msg && aviso?.id].filter(Boolean).join(' ');
    if (descricao) c.setAttribute('aria-describedby', descricao); else c.removeAttribute('aria-describedby');
  }
}

function mostrarErros(erros) {
  const avisos = [...document.querySelectorAll('#form-pedido [data-erro]')];
  for (const el of avisos) marcarErro(el.dataset.erro, erros[el.dataset.erro]);
  // O foco vai para o primeiro campo com erro, na ordem da tela. No pedido
  // mínimo, vai para o próprio aviso, que aceita foco.
  const primeiro = avisos.find((el) => !el.hidden);
  if (!primeiro) return;
  let alvo = $('#form-pedido').elements[primeiro.dataset.erro] || primeiro;
  if (alvo instanceof RadioNodeList) alvo = [...alvo].find((r) => r.checked) || alvo[0];
  alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
  alvo.focus({ preventScroll: true });
}

function enviar(evento) {
  const form = lerFormulario();
  const pedido = montarPedido(form);
  const erros = validar(form, pedido);
  if (Object.keys(erros).length) {
    evento.preventDefault();
    mostrarErros(erros);
    return;
  }
  const mensagem = montarMensagem(pedido);
  if (!config.whatsapp) evento.preventDefault();

  gravarLocal(CHAVE_CLIENTE, { nome: form.nome, telefone: form.telefone, tipo: form.tipo, endereco: form.endereco });
  guardarEnviado(pedido);
  apagarRascunho();
  salvarNaGestao(pedido);

  carrinho = {};
  gravarLocal(CHAVE_CARRINHO, carrinho);
  codigo = codigoPedido();
  // Espera o link do WhatsApp abrir antes de trocar a tela.
  setTimeout(() => {
    desenharCardapio();
    desenharBarra();
    mostrarEnviado(pedido, mensagem);
  }, 60);
}

// Guarda o pedido na gestão. Se o banco ainda estiver com as regras antigas,
// que não conhecem a ocasião, tenta de novo com a ocasião nas observações.
// Sem o banco (sistema instável), o pedido vai só pelo WhatsApp.
async function salvarNaGestao(pedido) {
  if (!store) {
    console.warn('Sem o banco agora: o pedido foi só pelo WhatsApp.');
    return;
  }
  try {
    await store.criarPedidoSite(pedido);
  } catch (e) {
    if (!pedido.ocasiao) {
      console.warn('Pedido não foi salvo na gestão:', e);
      return;
    }
    const { ocasiao, ...resto } = pedido;
    const obs = [`Ocasião: ${textoOcasiao(ocasiao)}`, pedido.obs].filter(Boolean).join(' · ').slice(0, LIMITE_OBS);
    store.criarPedidoSite({ ...resto, obs }).catch((e2) => console.warn('Pedido não foi salvo na gestão:', e2));
  }
}

// Os pedidos enviados deste aparelho nos últimos 60 dias (no máximo 20).
function guardarEnviado(pedido) {
  const prazo = Date.now() - 60 * 86400000;
  const lista = (lerLocal(CHAVE_ENVIADOS, []) || []).filter((x) => x?.codigo && x.em > prazo);
  lista.push({ codigo: pedido.codigo, em: Date.now() });
  gravarLocal(CHAVE_ENVIADOS, lista.slice(-20));
}

function enviadoDesteAparelho(cod) {
  const lista = lerLocal(CHAVE_ENVIADOS, []);
  return Array.isArray(lista) && lista.some((x) => x?.codigo === cod);
}

function mostrarEnviado(pedido, mensagem) {
  const janela = $('#janela-pedido');
  janela.dataset.enviado = '1';
  enviadoEm = Date.now();
  $('#titulo-pedido').textContent = `Pedido #${pedido.codigo}`;
  const temWhats = Boolean(config.whatsapp);
  const forma = pedido.pagamento.forma;
  const chave = lerChavePix(config.chavePix);
  const pix = forma === PIX_ANTECIPADO && chave
    ? codigoPix({ chave: chave.chave, nome: config.nome, cidade: config.cidade, valor: pedido.total, identificador: pedido.codigo })
    : '';
  let pagamento = '';
  if (pix) pagamento = htmlPagarPix(pedido, pix);
  else if (forma === CARTAO_NO_SITE) pagamento = htmlPagarCartao(pedido);
  else if (forma === CARTAO_PELO_LINK) {
    pagamento = '<p class="aviso-pagamento">A gente te manda o link para pagar no cartão pelo WhatsApp. O pedido é confirmado depois do pagamento.</p>';
  } else if (forma === 'Pix' && config.chavePix) {
    pagamento = `<p>Chave Pix: <strong>${esc(config.chavePix)}</strong>. Pague depois que confirmarmos o pedido.</p>`;
  }
  // O telefone fica numa linha só, para dar para copiar ou digitar.
  $('#corpo-pedido').innerHTML = `
    <div class="enviado">
      <h3 id="titulo-enviado" tabindex="-1">Quase lá!</h3>
      ${temWhats
        ? `<p>Abrimos o WhatsApp com o seu pedido escrito. É só tocar em <strong>enviar</strong> por lá. A gente responde para confirmar o horário e o pagamento.</p>
           <p class="suave">O WhatsApp não abriu? Use o botão abaixo ou copie a mensagem e mande para <span style="white-space:nowrap">${esc(telefoneBonito(config.whatsapp))}</span>.</p>`
        : '<p>Este site ainda não tem um número de WhatsApp configurado. Veja abaixo a mensagem que seria enviada.</p>'}
      ${pagamento}
      <pre class="mensagem-previa" id="mensagem-previa">${esc(mensagem)}</pre>
      <div class="acoes-linha">
        ${temWhats ? `<a class="btn btn-whats" href="${esc(linkWhats(config.whatsapp, mensagem))}" target="_blank" rel="noopener">${icone('conversa')} Abrir WhatsApp</a>` : ''}
        <button type="button" class="btn btn-contorno" data-acao="copiar">${icone('copiar')} Copiar mensagem</button>
      </div>
    </div>`;
  $('#rodape-pedido').innerHTML = '<button type="button" class="btn btn-contorno btn-largo" data-acao="fechar">Voltar ao cardápio</button>';
  $('#corpo-pedido').scrollTop = 0;
  janela.scrollTop = 0;
  // O foco do teclado vai para o título da tela nova.
  if (janela.open) $('#titulo-enviado').focus({ preventScroll: true });
  if (pix) desenharQrPix($('#pix-qr'), pix);
  if (forma === CARTAO_NO_SITE) {
    pedidoEnviado = pedido;
    prepararCartao();
  }
}

function htmlPagarPix(pedido, codigo) {
  return `
    <section class="pagar-antes" aria-labelledby="pix-titulo">
      <h4 id="pix-titulo">Pague ${brl(pedido.total)} com Pix</h4>
      <p>No app do seu banco, escolha <strong>Pix copia e cola</strong> e cole o código abaixo. O valor já vem preenchido.</p>
      <div class="pix-qr" id="pix-qr"></div>
      <textarea class="pix-codigo" id="pix-codigo" rows="4" readonly aria-label="Código Pix copia e cola">${esc(codigo)}</textarea>
      <button type="button" class="btn" data-acao="copiar-pix">${icone('copiar')} Copiar código Pix</button>
      <p class="suave">Depois de pagar, mande o comprovante no WhatsApp. O pedido é confirmado quando o pagamento cai.</p>
    </section>`;
}

function htmlPagarCartao(pedido) {
  return `
    <section class="pagar-antes" aria-labelledby="cartao-titulo">
      <h4 id="cartao-titulo">Pague ${brl(pedido.total)} no cartão</h4>
      <p>O pagamento abre na página segura da InfinitePay, no crédito em até 12x. Depois você volta para cá.</p>
      <div class="cartao-acao" id="cartao-acao" aria-live="polite"></div>
    </section>`;
}

function enderecoDaLoja() {
  return `${location.origin}${location.pathname}`;
}

// Cria a cobrança na InfinitePay enquanto o cliente manda a mensagem no WhatsApp.
async function prepararCartao() {
  const pedido = pedidoEnviado;
  const alvo = () => $('#cartao-acao');
  if (!pedido || !alvo()) return;
  alvo().innerHTML = '<button type="button" class="btn" disabled>Preparando o pagamento…</button>';
  try {
    const url = await criarCobranca({ tag: config.infiniteTag, pedido, voltarPara: enderecoDaLoja() });
    if (alvo() && pedidoEnviado === pedido) {
      alvo().innerHTML = `<a class="btn" href="${esc(url)}">${icone('cartao')} Pagar com cartão</a>`;
    }
  } catch (e) {
    console.warn('A página de pagamento não abriu:', e);
    if (alvo() && pedidoEnviado === pedido) {
      alvo().innerHTML = `
        <p class="aviso-pagamento">Não conseguimos abrir o pagamento agora. Tente de novo ou peça o link pelo WhatsApp.</p>
        <button type="button" class="btn btn-contorno" data-acao="tentar-cartao">Tentar de novo</button>`;
    }
  }
}

// Tira do endereço o que a InfinitePay pôs na volta, sem mexer no resto.
function limparRetornoDoEndereco() {
  const u = new URL(location.href);
  const nomes = ['order_nsu', 'transaction_nsu', 'slug', 'capture_method', 'receipt_url'];
  if (!nomes.some((n) => u.searchParams.has(n))) return;
  nomes.forEach((n) => u.searchParams.delete(n));
  history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

// Cliente voltando da página de pagamento da InfinitePay. A tela de pagamento só
// abre com o pagamento pelo site ligado nos Ajustes e para um pedido enviado
// deste aparelho; senão, o endereço é limpo e a página segue normal.
let retornoVisto = false;
function verRetornoDoPagamento() {
  if (retornoVisto) return;
  retornoVisto = true;
  const retorno = lerRetorno(location.search);
  limparRetornoDoEndereco();
  if (!retorno) return;
  if (!formasAntecipadas(config).includes(CARTAO_NO_SITE) || !enviadoDesteAparelho(retorno.codigo)) return;
  mostrarRetorno(retorno);
}

// O que o cliente manda no WhatsApp ao voltar do pagamento: "paguei" só depois
// que a InfinitePay confirmou.
function avisoDoRetorno(retorno, confirmado) {
  const comprovante = retorno.comprovante ? ` Comprovante: ${retorno.comprovante}` : '';
  return confirmado
    ? `Olá! Paguei o pedido #${retorno.codigo} pelo site.${comprovante}`
    : `Olá! Voltei da página de pagamento do pedido #${retorno.codigo}. Vocês podem conferir se o pagamento entrou?${comprovante}`;
}

// Volta da InfinitePay: confere o pagamento e oferece mandar o comprovante.
async function mostrarRetorno(retorno) {
  const janela = $('#janela-pedido');
  janela.dataset.enviado = '1';
  $('#titulo-pedido').textContent = `Pedido #${retorno.codigo}`;
  $('#corpo-pedido').innerHTML = `
    <div class="enviado">
      <h3>Pagamento</h3>
      <p class="aviso-pagamento" id="retorno-situacao" role="status">Conferindo o pagamento com a InfinitePay…</p>
      <p class="suave" id="retorno-texto"></p>
      <div class="acoes-linha">
        ${retorno.comprovante ? `<a class="btn btn-contorno" href="${esc(retorno.comprovante)}" target="_blank" rel="noopener">Ver comprovante</a>` : ''}
        ${config.whatsapp ? `<a class="btn btn-whats" id="retorno-whats" href="${esc(linkWhats(config.whatsapp, avisoDoRetorno(retorno, false)))}" target="_blank" rel="noopener">${icone('conversa')} Mandar comprovante no WhatsApp</a>` : ''}
      </div>
    </div>`;
  $('#rodape-pedido').innerHTML = '<button type="button" class="btn btn-contorno btn-largo" data-acao="fechar">Voltar ao cardápio</button>';
  abrirJanela();

  let resultado = null;
  if (config.infiniteTag) {
    try {
      resultado = await conferirPagamento({ tag: config.infiniteTag, retorno });
    } catch (e) {
      console.warn('Não deu para conferir o pagamento:', e);
    }
  }
  const situacao = $('#retorno-situacao');
  if (!situacao) return;
  if (resultado?.pago) {
    const parcelas = resultado.parcelas > 1 ? ` em ${resultado.parcelas}x` : '';
    const meio = resultado.meio === 'pix' ? ' no Pix' : ' no cartão';
    situacao.className = 'pagamento-ok';
    situacao.textContent = resultado.valor > 0
      ? `Pagamento aprovado: ${brl(resultado.valor)}${meio}${parcelas}.`
      : `Pagamento aprovado${meio}${parcelas}.`;
    $('#retorno-texto').textContent = 'Obrigado! A loja já recebeu o aviso do pagamento e confirma o pedido pelo WhatsApp.';
    const whats = $('#retorno-whats');
    if (whats) whats.href = linkWhats(config.whatsapp, avisoDoRetorno(retorno, true));
  } else if (resultado) {
    situacao.textContent = 'O pagamento ainda não aparece como aprovado.';
    $('#retorno-texto').textContent = 'Se você concluiu o pagamento, mande o comprovante no WhatsApp que a gente confere.';
  } else {
    situacao.textContent = 'Você voltou da página de pagamento.';
    $('#retorno-texto').textContent = 'Se o pagamento foi concluído, a loja recebe o aviso. Se quiser, mande o comprovante no WhatsApp.';
  }
}

// ---------- Janela e botão voltar ----------

// O voltar do navegador fecha a janela do pedido em vez de sair da página: ao
// abrir, a janela ganha um passo no histórico; fechada pelo X ou pelo Esc, esse
// passo é desfeito. Nada do que foi digitado se perde (fica no rascunho).
function abrirJanela() {
  const janela = $('#janela-pedido');
  if (janela.open) return;
  janela.showModal();
  // Já está no passo da janela (a página recarregou com ela aberta, ou o
  // avançar voltou para ele): usa esse passo, sem criar outro.
  if (history.state?.janelaPedido) {
    passoDaJanela = history.state.janelaPedido;
    return;
  }
  passoDaJanela = Date.now();
  try {
    history.pushState({ janelaPedido: passoDaJanela }, '');
  } catch {
    // Sem o passo no histórico, o voltar só não fecha a janela.
    passoDaJanela = 0;
  }
}

function abrirFinalizar() {
  desenharFinalizar();
  abrirJanela();
}

// A página está no passo da janela, mas com ela fechada: recarregou com a
// janela aberta, ou o cliente voltou e avançou. Sem isso, o voltar seguinte
// não faria nada na tela. Com salgados no pedido, a janela abre de novo, com o
// rascunho; sem nada (o pedido já foi enviado), o passo é desfeito.
function voltarAoPassoDaJanela() {
  if ($('#janela-pedido').open || !history.state?.janelaPedido) return;
  if (itensDoCarrinho().length) abrirFinalizar();
  else history.back();
}

window.addEventListener('popstate', (e) => {
  const janela = $('#janela-pedido');
  if (!janela.open) {
    // O cardápio ainda não chegou: quem cuida é o início da página.
    if (config) voltarAoPassoDaJanela();
    return;
  }
  if (e.state?.janelaPedido === passoDaJanela) return;
  passoDaJanela = 0;
  janela.close();
});

$('#janela-pedido').addEventListener('close', () => {
  if (passoDaJanela && history.state?.janelaPedido === passoDaJanela) history.back();
  passoDaJanela = 0;
  // O botão que abriu a janela foi redesenhado enquanto ela estava aberta: o
  // foco, perdido ou ainda preso na janela fechada, volta para o novo "Ver pedido".
  const ativo = document.activeElement;
  const perdido = !ativo || ativo === document.body || $('#janela-pedido').contains(ativo);
  if (perdido && !$('#barra-pedido').hidden) {
    $('#barra-pedido [data-acao="abrir-pedido"]')?.focus({ preventScroll: true });
  }
  // Os arquivos do Firebase voltaram enquanto a janela estava aberta: recarrega
  // agora, depois que o passo do histórico foi desfeito.
  if (recarregar) setTimeout(recarregarAgora, 300);
});

// Aviso rápido embaixo da tela. Fica uns 5 segundos (texto comprido, mais). O
// texto entra logo depois da bolha, para o leitor de tela perceber e ler.
function avisoRapido(texto) {
  document.querySelectorAll('.aviso-rapido').forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = 'aviso-rapido';
  el.setAttribute('role', 'status');
  el.style.opacity = '0';
  // Com a janela do pedido aberta, o aviso vai dentro dela para não ficar por trás.
  ($('#janela-pedido').open ? $('#janela-pedido') : document.body).appendChild(el);
  setTimeout(() => {
    el.textContent = texto;
    el.style.opacity = '';
  }, 50);
  setTimeout(() => el.remove(), Math.min(10000, Math.max(4500, texto.length * 75)));
}

// ---------- Eventos ----------

document.addEventListener('click', async (e) => {
  const alvo = e.target.closest('[data-acao], [data-categoria], #enviar-whats');
  if (!alvo) return;

  if (alvo.id === 'enviar-whats') {
    enviar(e);
    return;
  }
  if (alvo.dataset.categoria) {
    e.preventDefault();
    const secao = document.getElementById(alvo.dataset.categoria);
    secao?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // O teclado vai junto: o próximo Tab segue a partir da seção escolhida.
    secao?.querySelector('h2')?.focus({ preventScroll: true });
    return;
  }

  const { acao, id } = alvo.dataset;
  if (acao === 'mais' || acao === 'menos') {
    const devolverFoco = lembrarFoco();
    mudarQtd(id, acao === 'mais' ? 1 : -1);
    if ($('#janela-pedido').open && !$('#janela-pedido').dataset.enviado) {
      $('#resumo-itens').innerHTML = htmlResumo(itensDoCarrinho());
      marcarErro('itens', '');
      atualizarFinalizar();
    }
    devolverFoco();
  } else if (acao === 'abrir-pedido') {
    abrirFinalizar();
  } else if (acao === 'tentar-cartao') {
    prepararCartao();
  } else if (acao === 'fechar') {
    // Clique duplo no Enviar: o segundo clique cairia no "Voltar ao cardápio",
    // que aparece no mesmo lugar. Por 1 segundo ele não fecha a tela.
    if (alvo.closest('#rodape-pedido') && Date.now() - enviadoEm < 1000) return;
    $('#janela-pedido').close();
  } else if (acao === 'copiar-pix') {
    const campo = $('#pix-codigo');
    if (await copiarTexto(campo.value)) avisoRapido('Código Pix copiado');
    else {
      campo.select();
      avisoRapido('Selecionamos o código: é só copiar');
    }
  } else if (acao === 'copiar') {
    const texto = $('#mensagem-previa')?.textContent || '';
    if (await copiarTexto(texto)) avisoRapido('Mensagem copiada');
    else {
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents($('#mensagem-previa'));
      sel.removeAllRanges();
      sel.addRange(r);
      avisoRapido('Selecionamos a mensagem: é só copiar');
    }
  }
});

// Texto colado na observação que passa do limite é cortado pelo navegador: avisa.
document.addEventListener('paste', (e) => {
  const campo = e.target;
  if (campo?.id !== 'obs') return;
  const colado = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n/g, '\n');
  const cabe = LIMITE_OBS - (campo.value.length - (campo.selectionEnd - campo.selectionStart));
  obsColouDemais = colado.length > cabe;
});

document.addEventListener('input', (e) => {
  if (!e.target.closest('#form-pedido')) return;
  const nome = e.target.name;
  if (nome === 'tipo') {
    const tipo = e.target.value;
    const entrega = tipo === 'entrega';
    $('#campo-endereco').hidden = !entrega;
    $('#nota-retirada').hidden = entrega;
    // "Cartão na entrega" vira "Cartão na retirada" para quem vai buscar.
    document.querySelectorAll('#form-pedido [name="forma"]').forEach((r) => {
      const rotulo = r.parentElement.querySelector('[data-rotulo-forma]');
      if (rotulo) rotulo.textContent = rotuloForma(r.value, tipo);
    });
    $('#legenda-pagamento').textContent = legendaPagamento(formasAntecipadas(config), tipo);
  }
  if (nome === 'forma' && $('#dica-pagamento')) {
    $('#dica-pagamento').textContent = DICA_FORMA[e.target.value] || '';
  }
  if (nome === 'obs') {
    if (e.inputType !== 'insertFromPaste') obsColouDemais = false;
    desenharContaObs();
  }
  // Corrigiu o campo: o aviso sai (ou muda, se ainda estiver errado). Dia e
  // horário são conferidos de novo em atualizarFinalizar.
  if (e.target.getAttribute('aria-invalid') === 'true') {
    if (nome === 'pessoas') marcarErro('pessoas', lerPessoas(e.target.value).erro);
    else if (nome === 'telefone') marcarErro('telefone', erroTelefone(e.target.value.trim()));
    else marcarErro(nome, '');
  }
  atualizarFinalizar();
  guardarRascunho();
});

// Pessoas e WhatsApp são conferidos ao sair do campo, sem trocar o que foi digitado.
document.addEventListener('change', (e) => {
  if (e.target.id === 'pessoas') marcarErro('pessoas', lerPessoas(e.target.value).erro);
  if (e.target.id === 'telefone') marcarErro('telefone', erroTelefone(e.target.value.trim()));
});

$('#form-pedido').addEventListener('submit', (e) => e.preventDefault());

iniciar();
