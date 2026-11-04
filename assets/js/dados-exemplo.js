// Dados iniciais: o cardápio da Bibi com as fotos dos salgados e uma lista de
// ingredientes com preços de mercado (2026). No modo local entram também
// fichas técnicas, pedidos e lançamentos marcados como exemplo, para a gestão
// abrir mostrando como funciona.

import { somarDias, hojeISO } from './util.js';

export const CONFIG_PADRAO = {
  nome: 'Bibi Salgados',
  slogan: 'A crocância que você merece, com o recheio que você ama. Salgadinhos fritos na hora, com qualidade artesanal e recheio de verdade.',
  cidade: 'São José do Rio Preto - SP',
  whatsapp: '5517996353077',
  instagram: 'bibisalgadosrp',
  horario: 'Terça a sábado, das 9h às 19h',
  // O mesmo horário, para o site conferir: dias (0 = domingo, 6 = sábado) e
  // horas em que a Bibi atende. O site só aceita pedido para esses dias e horas,
  // e o tempo de fritar corre dentro deles. O texto acima sai destes campos.
  diasAtendimento: [2, 3, 4, 5, 6],
  abreAs: '09:00',
  fechaAs: '19:00',
  areaEntrega: 'Entregamos em toda a cidade.',
  taxaEntrega: 8,
  // Pedidos a partir de 25 salgados, a R$ 1,40 cada.
  pedidoMinimo: 35,
  // Sem prazo mínimo por enquanto: o cliente pode pedir para o mesmo dia.
  antecedenciaHoras: 0,
  // Mas o horário respeita o tempo de fritar: 1 hora a cada 50 salgados, nunca
  // menos de 1 hora (o Evandro, em 03/11/2026: 300 não dá para fritar em 10 minutos).
  preparoHoras: 1,
  preparoACada: 50,
  aceitandoPedidos: true,
  // Quando um salgado de estoque acaba, o cliente ainda pode encomendar.
  encomendaQuandoEsgotar: true,
  // O cliente escolhe a ocasião ao pedir e o site sugere quantos salgados
  // pedir pelo número de pessoas. Zero não sugere.
  ocasioes: [
    { nome: 'Aniversário', porPessoa: 12 },
    { nome: 'Confraternização', porPessoa: 10 },
    { nome: 'Reunião', porPessoa: 6 },
    { nome: 'Outros', porPessoa: 0 },
  ],
  formasPagamento: ['Pix', 'Dinheiro', 'Cartão na entrega'],
  chavePix: '',
  // Cobrar antes da entrega: desligado até o dono ligar em Ajustes.
  cobrarAntes: false,
  cobrarAntesPix: true,
  cobrarAntesCartao: true,
  // Sem a InfiniteTag, o cartão é cobrado por link no WhatsApp.
  infiniteTag: '',
  cmvAlvo: 0.35,
};

export const CATEGORIAS_LANCAMENTO = {
  saida: [
    'Ingredientes', 'Embalagens', 'Gás e energia', 'Entrega e transporte',
    'Taxas (cartão, iFood)', 'Equipamentos', 'Impostos (MEI)', 'Divulgação',
    'Outras despesas', 'Retirada (seu salário)',
  ],
  entrada: ['Venda avulsa', 'Aporte do dono', 'Outras entradas'],
};

export const RETIRADA = 'Retirada (seu salário)';
export const APORTE = 'Aporte do dono';

const ingredientes = [
  ['farinha', 'Farinha de trigo', 'g', 1000, 5.49],
  ['leite', 'Leite integral', 'ml', 1000, 5.29],
  ['margarina', 'Margarina', 'g', 500, 9.9],
  ['caldo', 'Caldo de galinha (tablete)', 'un', 6, 3.49],
  ['frango', 'Peito de frango', 'g', 1000, 19.9],
  ['requeijao', 'Requeijão cremoso (bisnaga)', 'g', 1500, 44.9],
  ['cebola', 'Cebola', 'g', 1000, 5.99],
  ['ovos', 'Ovos', 'un', 12, 12.9],
  ['rosca', 'Farinha de rosca', 'g', 500, 6.49],
  ['trigo-kibe', 'Trigo para kibe', 'g', 500, 6.49],
  ['carne', 'Carne moída (acém)', 'g', 1000, 34.9],
  ['hortela', 'Hortelã (maço)', 'un', 1, 3],
  ['mucarela', 'Muçarela', 'g', 1000, 39.9],
  ['presunto', 'Presunto', 'g', 1000, 29.9],
  ['salsicha', 'Salsicha', 'g', 1000, 14.9],
].map(([id, nome, unidade, qtdEmbalagem, precoEmbalagem]) => ({
  id: `ing-${id}`, nome, unidade, qtdEmbalagem, precoEmbalagem,
}));

// Embalagens entram na ficha técnica como os ingredientes, na quantidade que a
// receita inteira usa. Assim elas também saem do estoque quando o pedido fica pronto.
const embalagens = [
  ['caixa-cento', 'Caixa para cento', 25, 62.5],
  ['saco-congelado', 'Saco para congelados com etiqueta', 100, 119.9],
  ['saquinho', 'Saquinho de papel', 100, 29.9],
].map(([id, nome, qtdEmbalagem, precoEmbalagem]) => ({
  id: `emb-${id}`, nome, unidade: 'un', qtdEmbalagem, precoEmbalagem, embalagem: true,
}));

// Cardápio da Bibi (29/10/2026): qualquer sabor a R$ 1,40 a unidade, pedidos a
// partir de 25 unidades. No site o cliente escolhe de 5 em 5 de cada sabor.
// As fotos foram feitas pela Bibi (03/11/2026).
const produtos = [
  ['bolinha-queijo', 'Bolinha de queijo', 'Salgados', ''],
  ['balaozinho-carne', 'Balãozinho de carne', 'Salgados', ''],
  ['coxinha-frango', 'Coxinha de frango', 'Salgados', ''],
  ['bolinha-milho', 'Bolinha de milho com Catupiry', 'Salgados', ''],
  ['charutinho', 'Charutinho de presunto e queijo', 'Salgados', ''],
  ['croquete-calabresa', 'Croquete de calabresa', 'Salgados', ''],
  ['kibe', 'Kibe', 'Salgados', 'Carne de primeira, temperada com especiarias, numa receita de família.'],
  ['salsichinha', 'Salsichinha', 'Salgados', ''],
  ['churros', 'Churros de doce de leite', 'Doces', 'Crocante por fora, macio por dentro e recheado com doce de leite.'],
].map(([id, nome, categoria, descricao], i) => ({
  id, nome, categoria, descricao, preco: 1.4, unidade: 'unidade', rende: 1, passo: 5,
  foto: `assets/img/salgados/${id}.jpg`, ativo: true, ordem: i + 1,
}));

const massaCoxinha = { 'ing-farinha': 500, 'ing-leite': 500, 'ing-margarina': 50, 'ing-caldo': 2 };
const empanar = (rosca) => ({ 'ing-ovos': 2, 'ing-rosca': rosca });

// Fichas técnicas de exemplo, só no modo local. As de verdade o dono cadastra
// com a receita dele.
const fichasExemplo = [
  ['coxinha-frango', 100, { ...massaCoxinha, 'ing-frango': 500, 'ing-requeijao': 150, 'ing-cebola': 150, ...empanar(300), 'emb-caixa-cento': 1 }],
  ['kibe', 100, { 'ing-trigo-kibe': 400, 'ing-carne': 500, 'ing-cebola': 150, 'ing-hortela': 1, 'emb-caixa-cento': 1 }],
  ['bolinha-queijo', 100, { ...massaCoxinha, 'ing-caldo': 1, 'ing-mucarela': 500, ...empanar(300), 'emb-caixa-cento': 1 }],
].map(([id, rendimento, itens]) => ({
  id,
  rendimento,
  embalagem: 0,
  outrosPct: 20,
  itens: Object.entries(itens).map(([ingredienteId, qtd]) => ({ ingredienteId, qtd })),
}));

// Cardápio inicial (sem pedidos): usado também para começar na nuvem.
export function cardapioInicial() {
  return {
    config: { ...CONFIG_PADRAO },
    produtos: structuredClone(produtos),
    ingredientes: structuredClone([...ingredientes, ...embalagens]),
    fichas: [],
  };
}

function item(id, qtd) {
  const p = produtos.find((x) => x.id === id);
  return { produtoId: id, nome: p.nome, preco: p.preco, qtd, rende: p.rende, unidade: p.unidade };
}

function pedido(dados) {
  const subtotal = dados.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const taxaEntrega = dados.entrega.tipo === 'entrega' ? CONFIG_PADRAO.taxaEntrega : 0;
  return {
    desconto: 0, obs: '', exemplo: true, ...dados,
    subtotal, taxaEntrega, total: subtotal + taxaEntrega - (dados.desconto || 0),
  };
}

export function dadosExemplo(hoje = hojeISO()) {
  const dia = (n) => somarDias(hoje, n);
  const criado = (n) => `${dia(n)}T12:00:00.000Z`;
  const retirada = { tipo: 'retirada', endereco: '' };
  const pago = (forma, n) => ({ forma, pago: true, pagoEm: dia(n) });
  const aPagar = (forma) => ({ forma, pago: false, pagoEm: '' });

  const pedidos = [
    pedido({
      id: 'ex-1', codigo: 'A3F7', criadoEm: criado(-2), origem: 'WhatsApp', status: 'producao',
      cliente: { nome: 'Ana Paula Ribeiro', telefone: '' }, entrega: retirada,
      dataEntrega: dia(0), hora: '15:00', itens: [item('coxinha-frango', 50), item('kibe', 25)],
      pagamento: pago('Pix', -2), obs: 'Aniversário de 6 anos. Separar em duas caixas.',
    }),
    pedido({
      id: 'ex-2', codigo: 'K8M2', criadoEm: criado(-1), origem: 'Instagram', status: 'confirmado',
      cliente: { nome: 'Marcos Vinícius', telefone: '' },
      entrega: { tipo: 'entrega', endereco: 'Rua Bernardino de Campos, 1200 - Centro' },
      dataEntrega: dia(0), hora: '19:00', itens: [item('coxinha-frango', 30), item('kibe', 20)],
      pagamento: aPagar('Dinheiro'), obs: 'Troco para R$ 100.',
    }),
    pedido({
      id: 'ex-3', codigo: 'Q2ZD', criadoEm: criado(0), origem: 'Site', status: 'novo',
      cliente: { nome: 'Escritório Contábil Nogueira', telefone: '' },
      entrega: { tipo: 'entrega', endereco: 'Av. Alberto Andaló, 3000, sala 12 - Centro' },
      dataEntrega: dia(1), hora: '10:00', itens: [item('coxinha-frango', 50), item('bolinha-queijo', 50)],
      pagamento: aPagar('Pix antecipado'), obs: 'Pode mandar guardanapos?',
    }),
    pedido({
      id: 'ex-4', codigo: 'R5TN', criadoEm: criado(-3), origem: 'WhatsApp', status: 'confirmado',
      cliente: { nome: 'Renata (festa da Clara)', telefone: '' }, entrega: retirada,
      dataEntrega: dia(1), hora: '17:30',
      itens: [item('coxinha-frango', 75), item('kibe', 50), item('salsichinha', 25)],
      pagamento: aPagar('Pix'),
    }),
    pedido({
      id: 'ex-9', codigo: 'P6VY', criadoEm: criado(0), origem: 'Site', status: 'novo',
      cliente: { nome: 'Patrícia Gomes', telefone: '' }, entrega: retirada,
      dataEntrega: dia(2), hora: '10:30', itens: [item('churros', 25), item('charutinho', 25)],
      pagamento: aPagar('Pix'),
    }),
    pedido({
      id: 'ex-5', codigo: 'J4WB', criadoEm: criado(-2), origem: 'WhatsApp', status: 'entregue',
      cliente: { nome: 'Juliana Castro', telefone: '' },
      entrega: { tipo: 'entrega', endereco: 'Rua Siqueira Campos, 455 - Boa Vista' },
      dataEntrega: dia(-1), hora: '12:00', itens: [item('coxinha-frango', 40)], pagamento: pago('Pix', -1),
    }),
    pedido({
      id: 'ex-6', codigo: 'C9PX', criadoEm: criado(-6), origem: 'Indicação', status: 'entregue',
      cliente: { nome: 'Carla Mendes', telefone: '' }, entrega: retirada,
      dataEntrega: dia(-3), hora: '16:00', itens: [item('coxinha-frango', 100), item('bolinha-queijo', 50)],
      pagamento: pago('Pix', -3),
    }),
    pedido({
      id: 'ex-7', codigo: 'L7HS', criadoEm: criado(-6), origem: 'Instagram', status: 'entregue',
      cliente: { nome: 'Lucas Oliveira', telefone: '' }, entrega: retirada,
      dataEntrega: dia(-6), hora: '11:00', itens: [item('charutinho', 30)],
      pagamento: pago('Dinheiro', -6),
    }),
    pedido({
      id: 'ex-8', codigo: 'F3GE', criadoEm: criado(-9), origem: 'WhatsApp', status: 'cancelado',
      cliente: { nome: 'Fernanda Lima', telefone: '' }, entrega: retirada,
      dataEntrega: dia(-8), hora: '18:00', itens: [item('coxinha-frango', 25)], pagamento: aPagar('Pix'),
      obs: 'Cliente desmarcou.',
    }),
  ];

  const lanc = (id, n, tipo, categoria, descricao, valor) => ({
    id: `ex-l${id}`, data: dia(n), tipo, categoria, descricao, valor, exemplo: true,
  });
  const lancamentos = [
    lanc(1, -9, 'entrada', APORTE, 'Dinheiro do próprio bolso para começar', 200),
    lanc(2, -8, 'saida', 'Ingredientes', 'Atacadão: farinha, frango, queijo e óleo', 186.4),
    lanc(3, -8, 'saida', 'Gás e energia', 'Botijão de gás 13 kg', 115),
    lanc(4, -5, 'saida', 'Embalagens', 'Caixas para cento e saquinhos', 62),
    lanc(5, -2, 'saida', 'Ingredientes', 'Sacolão: cebola, hortelã e ovos', 38.7),
    lanc(6, -1, 'saida', RETIRADA, 'Retirada da semana', 300),
  ];

  // Estoque de exemplo: churros prontos esperando venda e quase tudo já contado
  // (quantidade, mínimo). Presunto e salsicha ficam sem contagem.
  const base = cardapioInicial();
  base.fichas = structuredClone(fichasExemplo);
  const prontos = { churros: [40, 25] };
  for (const p of base.produtos) {
    if (prontos[p.id]) Object.assign(p, { controlarEstoque: true, estoque: prontos[p.id][0], estoqueMinimo: prontos[p.id][1] });
  }
  const contagem = {
    'ing-farinha': [3000, 2000], 'ing-leite': [2000, 1000], 'ing-margarina': [500, 500], 'ing-caldo': [12, 6],
    'ing-frango': [1500, 1000], 'ing-requeijao': [1500, 1500], 'ing-cebola': [2000, 500], 'ing-ovos': [18, 12],
    'ing-rosca': [1000, 500], 'ing-trigo-kibe': [500, 500], 'ing-carne': [1000, 1000], 'ing-hortela': [1, 1],
    'ing-mucarela': [1000, 1000], 'emb-caixa-cento': [8, 10], 'emb-saco-congelado': [30, 20], 'emb-saquinho': [60, 50],
  };
  for (const ing of base.ingredientes) {
    if (contagem[ing.id]) Object.assign(ing, { estoque: contagem[ing.id][0], estoqueMinimo: contagem[ing.id][1] });
  }

  return { ...base, pedidos, lancamentos };
}
