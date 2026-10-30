// Contas do negócio: custo da ficha técnica, preço sugerido, produção do dia
// e resumo financeiro. Funções puras, sem tela, para dar para testar.

import { RETIRADA, APORTE } from './dados-exemplo.js';
import { mesISO } from './util.js';
import { lerChavePix } from './pix.js';

export const STATUS = {
  novo: 'Novo',
  confirmado: 'Confirmado',
  producao: 'Em produção',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const STATUS_ABERTOS = ['novo', 'confirmado', 'producao', 'pronto'];
export const STATUS_A_PRODUZIR = ['novo', 'confirmado', 'producao'];

export const PROXIMO_STATUS = {
  novo: ['confirmado', 'Confirmar'],
  confirmado: ['producao', 'Começar produção'],
  producao: ['pronto', 'Marcar pronto'],
  pronto: ['entregue', 'Marcar entregue'],
};

export function porId(lista) {
  const m = {};
  for (const x of lista || []) m[x.id] = x;
  return m;
}

// ---------- Ficha técnica ----------

export function custoPorUnidadeBase(ing) {
  return ing && ing.qtdEmbalagem > 0 ? (Number(ing.precoEmbalagem) || 0) / ing.qtdEmbalagem : 0;
}

// Custo da receita inteira e de cada salgado que ela rende. As embalagens
// entram sem o acréscimo de gás, óleo e perdas.
export function calcularFicha(ficha, ingredientesPorId) {
  const linhas = (ficha?.itens || []).map((it) => {
    const ing = ingredientesPorId[it.ingredienteId];
    return { ...it, ingrediente: ing, custo: custoPorUnidadeBase(ing) * (Number(it.qtd) || 0) };
  });
  const custoIngredientes = linhas.reduce((s, l) => s + l.custo, 0);
  const custoEmbalagens = linhas.filter((l) => l.ingrediente?.embalagem).reduce((s, l) => s + l.custo, 0);
  const outros = 1 + (Number(ficha?.outrosPct) || 0) / 100;
  const custoReceita = (custoIngredientes - custoEmbalagens) * outros + custoEmbalagens;
  const rendimento = Number(ficha?.rendimento) || 0;
  const porSalgado = rendimento > 0 ? custoReceita / rendimento : 0;
  return { linhas, custoIngredientes, custoEmbalagens, custoReceita, porSalgado };
}

// Custo de uma unidade de venda do produto (1 salgado, 1 cento, 1 pacote...).
export function custoDoProduto(produto, ficha, ingredientesPorId) {
  if (!ficha || !(ficha.itens || []).length || !(Number(ficha.rendimento) > 0)) return null;
  const f = calcularFicha(ficha, ingredientesPorId);
  return f.porSalgado * (Number(produto.rende) || 1) + (Number(ficha.embalagem) || 0);
}

// CMV = quanto do preço vai em ingredientes e embalagem.
export function analisarPreco(preco, custo, cmvAlvo) {
  if (custo == null) return { nivel: 'sem', cmv: null, lucro: null, sugerido: null };
  const cmv = preco > 0 ? custo / preco : null;
  const sugerido = cmvAlvo > 0 ? custo / cmvAlvo : null;
  let nivel = 'ruim';
  if (cmv != null && cmv <= cmvAlvo + 0.005) nivel = 'bom';
  else if (cmv != null && cmv <= cmvAlvo + 0.1) nivel = 'atencao';
  return { nivel, cmv, lucro: preco - custo, sugerido };
}

// ---------- Pedidos ----------

export function totaisPedido(p) {
  const subtotal = (p.itens || []).reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qtd) || 0), 0);
  const taxaEntrega = p.entrega?.tipo === 'entrega' ? Number(p.taxaEntrega) || 0 : 0;
  const desconto = Number(p.desconto) || 0;
  return { subtotal, taxaEntrega, desconto, total: Math.max(0, subtotal + taxaEntrega - desconto) };
}

export function unidadesDoItem(item) {
  return (Number(item.qtd) || 0) * (Number(item.rende) || 1);
}

// "6×" (unidade), "150 un" (cento) ou "2 pacotes" (pacote com 50)
export function textoQtd(item) {
  const qtd = Number(item.qtd) || 0;
  const rende = Number(item.rende) || 1;
  const fmt = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (rende === 1) return `${fmt(qtd)}×`;
  const unidade = String(item.unidade || '').trim();
  if (!unidade || unidade === 'cento' || !Number.isInteger(qtd)) return `${fmt(qtd * rende)} un`;
  const palavra = unidade.split(' ')[0];
  return `${fmt(qtd)} ${qtd === 1 ? palavra : palavra + 's'}`;
}

export function resumoItens(itens) {
  return (itens || []).map((i) => `${textoQtd(i)} ${i.nome}`).join(', ');
}

// Soma por produto o que precisa ser produzido para os pedidos das datas pedidas.
export function producaoDasDatas(pedidos, datas) {
  const alvo = new Set(datas);
  const mapa = new Map();
  for (const p of pedidos) {
    if (!alvo.has(p.dataEntrega) || !STATUS_A_PRODUZIR.includes(p.status)) continue;
    for (const it of p.itens || []) {
      const chave = it.produtoId || it.nome;
      const atual = mapa.get(chave) || { produtoId: it.produtoId, nome: it.nome, unidades: 0, pedidos: new Set() };
      atual.unidades += unidadesDoItem(it);
      atual.pedidos.add(p.id);
      mapa.set(chave, atual);
    }
  }
  return [...mapa.values()]
    .map((x) => ({ ...x, pedidos: x.pedidos.size }))
    .sort((a, b) => b.unidades - a.unidades);
}

// Quanto de cada ingrediente a produção vai gastar, pelas fichas técnicas.
export function ingredientesDaProducao(producao, fichasPorId, ingredientesPorId) {
  const mapa = new Map();
  const semFicha = [];
  for (const linha of producao) {
    const ficha = fichasPorId[linha.produtoId];
    if (!ficha || !(Number(ficha.rendimento) > 0) || !(ficha.itens || []).length) {
      semFicha.push(linha.nome);
      continue;
    }
    const fator = linha.unidades / Number(ficha.rendimento);
    for (const it of ficha.itens) {
      const ing = ingredientesPorId[it.ingredienteId];
      if (!ing) continue;
      const atual = mapa.get(ing.id) || { ingrediente: ing, qtd: 0, custo: 0 };
      atual.qtd += (Number(it.qtd) || 0) * fator;
      atual.custo = custoPorUnidadeBase(ing) * atual.qtd;
      mapa.set(ing.id, atual);
    }
  }
  const lista = [...mapa.values()].sort((a, b) => b.custo - a.custo);
  return { lista, semFicha, custoTotal: lista.reduce((s, l) => s + l.custo, 0) };
}

// "1,25 kg", "300 g", "2 un", "1,5 L"
export function quantidadeLegivel(qtd, unidade) {
  const fmt = (n, casas = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  if (unidade === 'g') return qtd >= 1000 ? `${fmt(qtd / 1000)} kg` : `${fmt(qtd, 0)} g`;
  if (unidade === 'ml') return qtd >= 1000 ? `${fmt(qtd / 1000)} L` : `${fmt(qtd, 0)} ml`;
  return `${fmt(Math.ceil(qtd - 1e-9), 0)} un`;
}

// ---------- Financeiro ----------

export function dataDoRecebimento(p) {
  return p.pagamento?.pagoEm || p.dataEntrega;
}

export function resumoDoMes(mes, pedidos, lancamentos) {
  const vendasPedidos = pedidos.filter((p) =>
    p.status !== 'cancelado' && p.pagamento?.pago && mesISO(dataDoRecebimento(p)) === mes);
  const doMes = lancamentos.filter((l) => mesISO(l.data) === mes);

  const somar = (lista, f = (x) => x.valor) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const vendasAvulsas = doMes.filter((l) => l.tipo === 'entrada' && l.categoria === 'Venda avulsa');
  const outrasEntradas = doMes.filter((l) => l.tipo === 'entrada' && !['Venda avulsa', APORTE].includes(l.categoria));
  const aportes = doMes.filter((l) => l.tipo === 'entrada' && l.categoria === APORTE);
  const despesas = doMes.filter((l) => l.tipo === 'saida' && l.categoria !== RETIRADA);
  const retiradas = doMes.filter((l) => l.tipo === 'saida' && l.categoria === RETIRADA);

  const vendas = somar(vendasPedidos, (p) => p.total) + somar(vendasAvulsas) + somar(outrasEntradas);
  const totalDespesas = somar(despesas);
  const lucro = vendas - totalDespesas;
  const totalRetiradas = somar(retiradas);
  const totalAportes = somar(aportes);

  const porCategoria = {};
  for (const d of despesas) porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + (Number(d.valor) || 0);

  return {
    vendas, vendasPedidos, totalDespesas, lucro, totalRetiradas, totalAportes,
    caixa: lucro - totalRetiradas + totalAportes,
    margem: vendas > 0 ? lucro / vendas : null,
    porCategoria: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]),
    lancamentos: doMes,
  };
}

export function aReceber(pedidos) {
  return pedidos.filter((p) => p.status !== 'cancelado' && !p.pagamento?.pago);
}

// ---------- Pagamento antes da entrega ----------

// Formas em que o cliente paga antes de receber. O nome fica gravado no pedido.
export const PIX_ANTECIPADO = 'Pix antecipado';
export const CARTAO_PELO_LINK = 'Cartão pelo link';
export const CARTAO_NO_SITE = 'Cartão pelo site';

// O que o site oferece quando "Cobrar antes da entrega" está ligado em Ajustes.
// O Pix só entra com uma chave válida; sem nenhuma forma, o site volta ao normal.
// Com a InfiniteTag em Ajustes, o cartão é pago no próprio site; sem ela, por link.
export function formasAntecipadas(config) {
  if (!config.cobrarAntes) return [];
  const formas = [];
  if (config.cobrarAntesPix && lerChavePix(config.chavePix)) formas.push(PIX_ANTECIPADO);
  if (config.cobrarAntesCartao) formas.push(config.infiniteTag ? CARTAO_NO_SITE : CARTAO_PELO_LINK);
  return formas;
}

export function aguardandoPagamento(p) {
  return p.status !== 'cancelado' && !p.pagamento?.pago
    && [PIX_ANTECIPADO, CARTAO_PELO_LINK, CARTAO_NO_SITE].includes(p.pagamento?.forma);
}

export function clientesDosPedidos(pedidos) {
  const mapa = new Map();
  for (const p of pedidos) {
    if (p.status === 'cancelado') continue;
    const nome = (p.cliente?.nome || '').trim();
    if (!nome) continue;
    const tel = (p.cliente?.telefone || '').replace(/\D/g, '');
    const chave = tel || nome.toLowerCase();
    const c = mapa.get(chave) || { nome, telefone: p.cliente?.telefone || '', pedidos: 0, total: 0, ultimo: '' };
    c.pedidos += 1;
    c.total += Number(p.total) || 0;
    if (p.dataEntrega > c.ultimo) {
      c.ultimo = p.dataEntrega;
      c.nome = nome;
      if (p.cliente?.telefone) c.telefone = p.cliente.telefone;
    }
    mapa.set(chave, c);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
