// Contas do negócio: custo da ficha técnica, preço sugerido, produção do dia
// e resumo financeiro. Funções puras, sem tela, para dar para testar.

import { RETIRADA, APORTE } from './dados-exemplo.js';
import { mesISO, deISO } from './util.js';
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
  return (itens || []).map((i) => {
    const encomenda = textoEncomenda(i);
    return `${textoQtd(i)} ${i.nome}${encomenda ? ` (${encomenda})` : ''}`;
  }).join(', ');
}

// Parte do item que passou do estoque pronto: "1 pacote sob encomenda",
// "sob encomenda" (o item todo) ou '' (nada).
export function textoEncomenda(item) {
  const n = Number(item.encomenda) || 0;
  if (!(n > 0)) return '';
  if (n >= (Number(item.qtd) || 0)) return 'sob encomenda';
  const qtd = (Number(item.rende) || 1) === 1
    ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un`
    : textoQtd({ ...item, qtd: n });
  return `${qtd} sob encomenda`;
}

export function unidadesDoPedido(itens) {
  return (itens || []).reduce((s, i) => s + unidadesDoItem(i), 0);
}

// ---------- Ocasião do pedido ----------

// "Aniversário · 30 pessoas"
export function textoOcasiao(ocasiao) {
  if (!ocasiao?.tipo) return '';
  const pessoas = Number(ocasiao.pessoas) || 0;
  return pessoas > 0 ? `${ocasiao.tipo} · ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}` : ocasiao.tipo;
}

// Quantos salgados sugerir para a ocasião e o número de pessoas; null sem sugestão.
export function sugestaoDeSalgados(ocasiao, ocasioes) {
  const porPessoa = Number((ocasioes || []).find((o) => o.nome === ocasiao?.tipo)?.porPessoa) || 0;
  const pessoas = Number(ocasiao?.pessoas) || 0;
  if (!(porPessoa > 0) || !(pessoas > 0)) return null;
  return { porPessoa, pessoas, total: porPessoa * pessoas };
}

// ---------- Prazo do pedido ----------

// Minutos que a cozinha precisa para o pedido: "1 hora a cada 50 salgados",
// proporcional e nunca menos que essa 1 hora, nos próximos 15 minutos.
// Zero em qualquer dos dois desliga.
export function minutosDePreparo(unidades, config) {
  const horas = Number(config?.preparoHoras) || 0;
  const aCada = Number(config?.preparoACada) || 0;
  if (!(horas > 0) || !(aCada > 0) || !(unidades > 0)) return 0;
  return Math.ceil(Math.max(1, unidades / aCada) * horas * 4 - 1e-9) * 15;
}

const QUINZE_MIN = 15 * 60000;
const nosProximos15 = (d) => new Date(Math.ceil(d.getTime() / QUINZE_MIN) * QUINZE_MIN);

// O primeiro horário que o cliente pode escolher: agora mais a antecedência
// mínima ou o tempo de preparo, o que for maior, nos próximos 15 minutos. Com
// horário de atendimento, a cozinha só frita com a Bibi aberta: o preparo corre
// dentro do horário e o pedido fica para quando ela atende (terça 22h40, 25
// salgados: quarta às 10:00).
export function primeiroHorario(unidades, config, agora = new Date()) {
  const antecedencia = (Number(config?.antecedenciaHoras) || 0) * 60000 * 60;
  const preparo = minutosDePreparo(unidades, config) * 60000;
  const a = atendimento(config);
  if (!a) return nosProximos15(new Date(agora.getTime() + Math.max(antecedencia, preparo)));
  const pronto = somarTempoAberto(agora, preparo, a);
  const comAntecedencia = proximoMomentoAberto(new Date(agora.getTime() + antecedencia), a);
  let quando = nosProximos15(pronto > comAntecedencia ? pronto : comAntecedencia);
  // Arredondar pode passar da hora de fechar: aí vale a abertura seguinte.
  for (let i = 0; i < 14 && !estaAberto(quando, a); i++) quando = nosProximos15(proximoMomentoAberto(quando, a));
  return quando;
}

// ---------- Horário de atendimento ----------

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// "09:00" vira 540 (minutos do dia); o que não for hora vira null.
function minutosDaHora(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora ?? '').trim());
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Dias (0 = domingo, 6 = sábado) e horas, em minutos do dia, em que a Bibi
// atende. Sem dia marcado ou com as horas trocadas não há regra: null.
export function atendimento(config) {
  const dias = [...new Set((config?.diasAtendimento || []).map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((x, y) => x - y);
  const abre = minutosDaHora(config?.abreAs);
  const fecha = minutosDaHora(config?.fechaAs);
  if (!dias.length || abre == null || fecha == null || fecha <= abre) return null;
  return { dias, abre, fecha };
}

const minutosDoDia = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const naHora = (d, minutos) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutos);

function estaAberto(d, a) {
  const m = minutosDoDia(d);
  return a.dias.includes(d.getDay()) && m >= a.abre && m <= a.fecha;
}

// O mesmo momento, se a Bibi estiver aberta; senão, a próxima abertura.
function proximoMomentoAberto(d, a) {
  if (estaAberto(d, a)) return d;
  let dia = minutosDoDia(d) < a.abre ? naHora(d, 0) : naHora(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), 0);
  for (let i = 0; i < 8 && !a.dias.includes(dia.getDay()); i++) dia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
  return naHora(dia, a.abre);
}

// Soma "ms" de trabalho a partir de "inicio", contando só o horário aberto.
function somarTempoAberto(inicio, ms, a) {
  let t = proximoMomentoAberto(inicio, a);
  let falta = ms;
  for (let i = 0; i < 400; i++) {
    const fim = naHora(t, a.fecha);
    if (falta <= fim - t) return new Date(t.getTime() + falta);
    falta -= fim - t;
    t = proximoMomentoAberto(new Date(fim.getTime() + 60000), a);
  }
  return t;
}

// "9h", "18h30"
function textoHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// "terça a sábado", "segunda e terça", "segunda, quarta e sexta", "todos os dias"
function textoDias(dias) {
  if (dias.length === 7) return 'todos os dias';
  // A semana começando na segunda, para "terça a domingo" sair seguido.
  const ordem = [...dias].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7));
  const seguidos = ordem.every((d, i) => i === 0 || (ordem[i - 1] + 1) % 7 === d);
  if (seguidos && ordem.length >= 3) return `${NOMES_DIAS[ordem[0]]} a ${NOMES_DIAS[ordem[ordem.length - 1]]}`;
  const nomes = ordem.map((d) => NOMES_DIAS[d]);
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

// "Terça a sábado, das 9h às 19h". Sem horário de atendimento, o texto livre
// dos Ajustes (versões antigas), se houver.
export function textoAtendimento(config) {
  const a = atendimento(config);
  if (!a) return String(config?.horario || '').trim();
  const dias = textoDias(a.dias);
  return `${dias[0].toUpperCase()}${dias.slice(1)}, das ${textoHora(a.abre)} às ${textoHora(a.fecha)}`;
}

// "no domingo", "na segunda"
const noDia = (d) => `${d === 0 || d === 6 ? 'no' : 'na'} ${NOMES_DIAS[d]}`;

// "de terça a sábado", "só no sábado", "segunda, quarta e sexta"
function quandoAtende(dias) {
  if (dias.length === 1) return `só ${noDia(dias[0])}`;
  const texto = textoDias(dias);
  return texto.includes(' a ') ? `de ${texto}` : texto;
}

// Dia ou horário em que a Bibi não atende: { data: '...' } ou { hora: '...' };
// {} quando está tudo certo ou não há horário de atendimento.
export function foraDoAtendimento(dataISO, hora, config) {
  const a = atendimento(config);
  if (!a || !dataISO) return {};
  const dia = deISO(dataISO).getDay();
  if (!a.dias.includes(dia)) return { data: `A Bibi não abre ${noDia(dia)}. Ela atende ${quandoAtende(a.dias)}.` };
  const m = minutosDaHora(hora);
  if (m != null && (m < a.abre || m > a.fecha)) {
    return { hora: `A Bibi atende das ${textoHora(a.abre)} às ${textoHora(a.fecha)}.` };
  }
  return {};
}

// "45 minutos", "1 hora", "1h30", "6 horas"
export function textoDuracao(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (!h) return `${m} minutos`;
  if (!m) return h === 1 ? '1 hora' : `${h} horas`;
  return `${h}h${String(m).padStart(2, '0')}`;
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

// ---------- DRE do mês ----------

// Despesas que o DRE mostra em linha própria. As outras entram em "Despesas".
export const TAXAS = 'Taxas (cartão, iFood)';
export const CUSTO_DOS_SALGADOS = ['Ingredientes', 'Embalagens'];
export const IMPOSTOS = 'Impostos (MEI)';

// DRE (demonstrativo de resultado) pelo dinheiro que entrou e saiu no mês, a
// partir do resumoDoMes: vendas, menos taxas, menos o que foi comprado para
// fazer os salgados, menos despesas e impostos. Retiradas e aportes do dono
// ficam de fora, então o lucro bate com o do resumo.
export function dreDoMes(r) {
  const entradas = (filtro) => r.lancamentos
    .filter((l) => l.tipo === 'entrada' && filtro(l.categoria))
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const gasto = Object.fromEntries(r.porCategoria);
  const vendas = r.vendasPedidos.reduce((s, p) => s + (Number(p.total) || 0), 0)
    + entradas((c) => c === 'Venda avulsa');
  const taxas = gasto[TAXAS] || 0;
  const custo = CUSTO_DOS_SALGADOS.reduce((s, c) => s + (gasto[c] || 0), 0);
  const impostos = gasto[IMPOSTOS] || 0;
  const separadas = new Set([TAXAS, IMPOSTOS, ...CUSTO_DOS_SALGADOS]);
  const despesas = r.porCategoria.filter(([c]) => !separadas.has(c));
  const totalDespesas = despesas.reduce((s, [, v]) => s + v, 0);
  const outrasEntradas = entradas((c) => !['Venda avulsa', APORTE].includes(c));
  const receitaLiquida = vendas - taxas;
  const lucroBruto = receitaLiquida - custo;
  const lucro = lucroBruto - totalDespesas - impostos + outrasEntradas;
  return {
    vendas, taxas, receitaLiquida, custo, lucroBruto, despesas, totalDespesas, impostos, outrasEntradas, lucro,
    margemBruta: receitaLiquida > 0 ? lucroBruto / receitaLiquida : null,
    margem: vendas > 0 ? lucro / vendas : null,
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
