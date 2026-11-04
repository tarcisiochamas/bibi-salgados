// Estoque: salgados prontos esperando venda (como os congelados) e
// ingredientes e embalagens. Funções puras, sem tela, para dar para testar.
//
// - Salgados prontos: o pedido segura o que pediu a partir da confirmação e
//   devolve se for cancelado. Produzir para o estoque gasta os ingredientes.
// - Ingredientes: saem quando o pedido fica pronto, pela ficha técnica, e só
//   para os ingredientes que já foram contados.

import { STATUS_A_PRODUZIR, porId, unidadesDoItem, custoPorUnidadeBase } from './calculos.js';

export const STATUS_COM_RESERVA = ['confirmado', 'producao', 'pronto', 'entregue'];
export const STATUS_PRODUZIDO = ['pronto', 'entregue'];

const arred = (n) => Math.round(n * 1000) / 1000;

export function controlaEstoque(produto) {
  return Boolean(produto?.controlarEstoque);
}

// Ingrediente que já foi contado alguma vez. Os outros ficam de fora das baixas.
export function foiContado(ingrediente) {
  return typeof ingrediente?.estoque === 'number' && isFinite(ingrediente.estoque);
}

// O máximo que o cliente pode pôr no carrinho; null quando não há limite.
export function maximoParaVender(produto) {
  if (!controlaEstoque(produto)) return null;
  const passo = Number(produto.passo) || 1;
  return Math.max(0, Math.floor((Number(produto.estoque) || 0) / passo + 1e-9) * passo);
}

export function esgotado(produto) {
  return controlaEstoque(produto) && maximoParaVender(produto) <= 0;
}

// Salgado de estoque que o cliente ainda pode encomendar depois que os prontos
// acabam (ligado em Ajustes). O pedido segura tudo na confirmação, então o
// estoque fica negativo e a tela de estoque mostra quanto falta produzir.
export function aceitaEncomenda(produto, config) {
  return controlaEstoque(produto) && config?.encomendaQuandoEsgotar !== false;
}

// O máximo que o site deixa pôr no carrinho; null quando não há limite.
export function limiteNoSite(produto, config) {
  return aceitaEncomenda(produto, config) ? null : maximoParaVender(produto);
}

// Quanto do item passa do que está pronto e fica sob encomenda.
export function parteEncomendada(produto, qtd) {
  const max = maximoParaVender(produto);
  return max == null ? 0 : Math.max(0, arred((Number(qtd) || 0) - max));
}

// Situação para a tela de estoque: 'esgotado', 'acabando', 'ok' ou 'sem' (sem contagem).
export function situacaoProduto(produto) {
  if (!controlaEstoque(produto)) return 'sem';
  if (esgotado(produto)) return 'esgotado';
  const minimo = Number(produto.estoqueMinimo) || 0;
  return minimo > 0 && Number(produto.estoque) <= minimo ? 'acabando' : 'ok';
}

export function situacaoIngrediente(ing) {
  if (!foiContado(ing)) return 'sem';
  if (ing.estoque <= 0) return 'esgotado';
  const minimo = Number(ing.estoqueMinimo) || 0;
  return minimo > 0 && ing.estoque < minimo ? 'acabando' : 'ok';
}

// ---------- Pedidos ----------

function somarPorProduto(itens, filtro) {
  const r = {};
  for (const it of itens || []) {
    if (!filtro(it)) continue;
    r[it.produtoId] = arred((r[it.produtoId] || 0) + (Number(it.qtd) || 0));
  }
  return r;
}

// Quanto o pedido segura dos salgados prontos, na unidade de venda.
export function reservaDoPedido(pedido, produtosPorId) {
  if (!STATUS_COM_RESERVA.includes(pedido.status)) return {};
  return somarPorProduto(pedido.itens, (it) => controlaEstoque(produtosPorId[it.produtoId]));
}

// Quanto cada ingrediente gasta para produzir os itens, pelas fichas técnicas.
export function gastoDosItens(itens, fichasPorId) {
  const gasto = {};
  for (const it of itens) {
    const ficha = fichasPorId[it.produtoId];
    const rendimento = Number(ficha?.rendimento) || 0;
    if (!(rendimento > 0)) continue;
    const fator = unidadesDoItem(it) / rendimento;
    for (const fi of ficha.itens || []) {
      gasto[fi.ingredienteId] = (gasto[fi.ingredienteId] || 0) + (Number(fi.qtd) || 0) * fator;
    }
  }
  for (const id of Object.keys(gasto)) gasto[id] = arred(gasto[id]);
  return gasto;
}

function soContados(gasto, ingredientesPorId) {
  return Object.fromEntries(Object.entries(gasto).filter(([id, q]) => q > 0 && foiContado(ingredientesPorId[id])));
}

// Ingredientes que a produção do pedido gasta. Salgados de estoque não entram:
// eles já gastaram quando foram produzidos.
export function baixaDoPedido(pedido, { produtosPorId, fichasPorId, ingredientesPorId }) {
  const itens = (pedido.itens || []).filter((it) => !controlaEstoque(produtosPorId[it.produtoId]));
  return soContados(gastoDosItens(itens, fichasPorId), ingredientesPorId);
}

function mesmosItens(a, b) {
  const chave = (itens) => JSON.stringify((itens || []).map((it) => `${it.produtoId || it.nome}:${Number(it.qtd) || 0}`).sort());
  return chave(a) === chave(b);
}

function diferenca(antes, depois) {
  const ids = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...ids]
    .map((id) => [id, arred((depois[id] || 0) - (antes[id] || 0))])
    .filter(([, d]) => d !== 0);
}

export function contexto({ produtos, fichas, ingredientes }) {
  return { produtosPorId: porId(produtos), fichasPorId: porId(fichas), ingredientesPorId: porId(ingredientes) };
}

// O que muda no estoque quando um pedido é salvo, ou excluído (depois = null).
// Devolve o pedido com o que ele segura agora e as somas a fazer nos estoques,
// no formato [coleção, id, campo, quanto].
//
// Só recalcula quando o pedido muda de fase ou de itens. Assim, marcar como
// pago um pedido antigo não mexe no estoque contado depois dele.
export function movimentoDoPedido(antes, depois, ctx) {
  const reservaAntes = antes?.estoqueReservado || {};
  const baixaAntes = antes?.ingredientesBaixados || {};
  const mesmos = Boolean(antes && depois && mesmosItens(antes.itens, depois.itens));
  let reserva = {};
  let baixa = baixaAntes;

  if (!depois) {
    // Excluir desfaz o pedido, menos o que já foi entregue e os ingredientes já usados.
    if (antes?.status === 'entregue') reserva = reservaAntes;
  } else {
    if (STATUS_COM_RESERVA.includes(depois.status)) {
      reserva = mesmos && STATUS_COM_RESERVA.includes(antes.status)
        ? reservaAntes : reservaDoPedido(depois, ctx.produtosPorId);
    }
    if (STATUS_PRODUZIDO.includes(depois.status)) {
      baixa = mesmos && STATUS_PRODUZIDO.includes(antes.status) ? baixaAntes : baixaDoPedido(depois, ctx);
    } else if (depois.status !== 'cancelado') {
      // Voltou para antes de ficar pronto: os ingredientes voltam.
      baixa = {};
    }
  }

  const somar = [
    ...diferenca(reservaAntes, reserva).map(([id, d]) => ['produtos', id, 'estoque', -d]),
    ...diferenca(baixaAntes, baixa).map(([id, d]) => ['ingredientes', id, 'estoque', -d]),
  ];
  return {
    pedido: depois ? { ...depois, estoqueReservado: reserva, ingredientesBaixados: baixa } : null,
    somar,
  };
}

// Ligar o estoque de um salgado que já está em pedidos confirmados e ainda não
// entregues: esses pedidos passam a segurar o salgado, como se tivessem sido
// confirmados agora. Devolve os pedidos com a reserva nova, quanto eles
// seguram ao todo, para tirar de uma contagem nova, e quanto passam a segurar
// agora ("novos"), para tirar do estoque guardado. Ao religar, o guardado já
// descontou os pedidos que seguravam o salgado antes de desligar. Contar de
// novo com o estoque ligado usa o mesmo total: a contagem inclui o que esses
// pedidos ainda vão levar.
export function reservasAoLigar(produto, pedidos) {
  const mudados = [];
  let total = 0;
  let novos = 0;
  for (const p of pedidos) {
    if (!STATUS_COM_RESERVA.includes(p.status) || p.status === 'entregue') continue;
    const qtd = somarPorProduto(p.itens, (it) => it.produtoId === produto.id)[produto.id] || 0;
    if (!(qtd > 0)) continue;
    total = arred(total + qtd);
    if (p.estoqueReservado?.[produto.id] !== qtd) {
      novos = arred(novos + qtd - (Number(p.estoqueReservado?.[produto.id]) || 0));
      mudados.push({ ...p, estoqueReservado: { ...(p.estoqueReservado || {}), [produto.id]: qtd } });
    }
  }
  return { pedidos: mudados, total, novos };
}

// Produzir salgados para o estoque soma no produto e gasta os ingredientes da ficha.
export function movimentoDaProducao(produto, quantidade, ctx) {
  const somar = [['produtos', produto.id, 'estoque', quantidade]];
  const item = { produtoId: produto.id, qtd: quantidade, rende: produto.rende };
  const gasto = soContados(gastoDosItens([item], ctx.fichasPorId), ctx.ingredientesPorId);
  for (const [id, q] of Object.entries(gasto)) somar.push(['ingredientes', id, 'estoque', -q]);
  return somar;
}

// Quanto dos salgados de estoque está em pedidos novos, ainda sem confirmar.
export function emPedidosNovos(pedidos, produtosPorId) {
  const r = {};
  for (const p of pedidos) {
    if (p.status !== 'novo') continue;
    for (const [id, q] of Object.entries(somarPorProduto(p.itens, (it) => controlaEstoque(produtosPorId[it.produtoId])))) {
      r[id] = arred((r[id] || 0) + q);
    }
  }
  return r;
}

// Avisa quais salgados de estoque o pedido deixou faltando.
export function faltasDepois(somar, produtosPorId) {
  return somar
    .filter(([colecao, id, , delta]) => colecao === 'produtos' && delta < 0
      && (Number(produtosPorId[id]?.estoque) || 0) + delta < 0)
    .map(([, id]) => produtosPorId[id]?.nome)
    .filter(Boolean);
}

// ---------- Lista de compras ----------

// O que comprar para os pedidos em aberto até a data "ate" e para não ficar
// abaixo do estoque mínimo. Cada linha já vem em embalagens de compra.
export function listaDeCompras({ pedidos, produtos, fichas, ingredientes }, ate) {
  const produtosPorId = porId(produtos);
  const fichasPorId = porId(fichas);
  const itens = [];
  const novosDeEstoque = {};

  for (const p of pedidos) {
    if (!STATUS_A_PRODUZIR.includes(p.status) || !p.dataEntrega || p.dataEntrega > ate) continue;
    for (const it of p.itens || []) {
      if (!controlaEstoque(produtosPorId[it.produtoId])) itens.push(it);
      else if (p.status === 'novo') novosDeEstoque[it.produtoId] = (novosDeEstoque[it.produtoId] || 0) + (Number(it.qtd) || 0);
    }
  }
  // Salgados de estoque que vão faltar: o que já falta e os pedidos novos que o estoque não cobre.
  for (const prod of produtos) {
    if (!controlaEstoque(prod)) continue;
    const tem = Number(prod.estoque) || 0;
    const falta = Math.max(0, (novosDeEstoque[prod.id] || 0) - Math.max(0, tem)) + Math.max(0, -tem);
    if (falta > 0) itens.push({ produtoId: prod.id, qtd: falta, rende: prod.rende });
  }

  const gasto = gastoDosItens(itens, fichasPorId);
  const linhas = [];
  for (const ing of ingredientes) {
    const usa = gasto[ing.id] || 0;
    const contado = foiContado(ing);
    const minimo = Number(ing.estoqueMinimo) || 0;
    const tem = contado ? Math.max(0, ing.estoque) : 0;
    const falta = arred(usa + minimo - tem);
    if (falta <= 0 || (!contado && !usa)) continue;
    linhas.push({ ingrediente: ing, usa, minimo, tem, contado, falta, ...emEmbalagens(ing, falta) });
  }
  linhas.sort(ingredientesPrimeiro);
  return { linhas, custoTotal: linhas.reduce((s, l) => s + l.custo, 0) };
}

// Quantas embalagens de compra cobrem a falta, e quanto custam.
function emEmbalagens(ing, falta) {
  const embalagem = Number(ing.qtdEmbalagem) || 0;
  const embalagens = embalagem > 0 && falta > 0 ? Math.ceil(falta / embalagem - 1e-9) : 0;
  return { embalagens, custo: embalagens * (Number(ing.precoEmbalagem) || 0) };
}

function ingredientesPrimeiro(a, b) {
  return Number(Boolean(a.ingrediente.embalagem)) - Number(Boolean(b.ingrediente.embalagem))
    || a.ingrediente.nome.localeCompare(b.ingrediente.nome, 'pt-BR');
}

// ---------- Simulação de compra ----------

// "Quero fazer 500 coxinhas": o que a produção gasta de cada ingrediente pelas
// fichas técnicas, quanto custa e o que falta comprar, descontando o que já
// foi contado. "linhas" vem em salgados: [{ produtoId, unidades }].
export function simularCompra(linhas, { produtos, fichas, ingredientes }) {
  const produtosPorId = porId(produtos);
  const fichasPorId = porId(fichas);
  const itens = [];
  const semFicha = [];
  let unidades = 0;
  for (const l of linhas) {
    const qtd = Number(l.unidades) || 0;
    const prod = produtosPorId[l.produtoId];
    if (!(qtd > 0) || !prod) continue;
    const ficha = fichasPorId[prod.id];
    if (!ficha || !(Number(ficha.rendimento) > 0) || !(ficha.itens || []).length) {
      semFicha.push(prod.nome);
      continue;
    }
    itens.push({ produtoId: prod.id, qtd, rende: 1 });
    unidades += qtd;
  }

  const gasto = gastoDosItens(itens, fichasPorId);
  const resultado = [];
  for (const ing of ingredientes) {
    const usa = gasto[ing.id] || 0;
    if (!(usa > 0)) continue;
    const contado = foiContado(ing);
    const tem = contado ? Math.max(0, ing.estoque) : 0;
    const falta = arred(Math.max(0, usa - tem));
    resultado.push({
      ingrediente: ing, usa, tem, contado, falta, ...emEmbalagens(ing, falta),
      custoUso: custoPorUnidadeBase(ing) * usa,
    });
  }
  resultado.sort(ingredientesPrimeiro);
  const custoUso = resultado.reduce((s, l) => s + l.custoUso, 0);
  return {
    linhas: resultado, unidades, semFicha, custoUso,
    custoCompra: resultado.reduce((s, l) => s + l.custo, 0),
    porSalgado: unidades > 0 ? custoUso / unidades : 0,
  };
}
