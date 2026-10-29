// Dados iniciais: um cardápio de exemplo com fichas técnicas e preços de
// mercado (2026), mais alguns pedidos e lançamentos marcados como exemplo
// para a gestão abrir mostrando como funciona.

import { somarDias, hojeISO } from './util.js';

export const CONFIG_PADRAO = {
  nome: 'Bibi Salgados',
  slogan: 'Salgados feitos em casa: fritos na hora, para a sua festa ou congelados para fritar quando quiser.',
  cidade: 'São José do Rio Preto - SP',
  whatsapp: '',
  instagram: '',
  horario: 'Terça a sábado, das 9h às 19h',
  areaEntrega: 'Entregamos em toda a cidade.',
  taxaEntrega: 8,
  pedidoMinimo: 30,
  antecedenciaHoras: 24,
  aceitandoPedidos: true,
  formasPagamento: ['Pix', 'Dinheiro', 'Cartão na entrega'],
  chavePix: '',
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

const produtos = [
  ['coxinha', 'Coxinha de frango com requeijão', 'Salgados fritos',
    'Massa macia e recheio de frango desfiado temperado com requeijão cremoso.', 7, 'unidade', 1, 1],
  ['kibe', 'Kibe recheado com queijo', 'Salgados fritos',
    'Kibe de carne com hortelã e muçarela derretida por dentro.', 7, 'unidade', 1, 1],
  ['risole', 'Risole de presunto e queijo', 'Salgados fritos',
    'Massa fininha e crocante, recheio cremoso de presunto e muçarela.', 6.5, 'unidade', 1, 1],
  ['enroladinho', 'Enroladinho de salsicha', 'Salgados fritos',
    'Salsicha inteira envolvida em massa dourada.', 6, 'unidade', 1, 1],
  ['bolinha', 'Bolinha de queijo', 'Salgados fritos',
    'Casquinha crocante e muçarela que estica.', 6.5, 'unidade', 1, 1],
  ['mini-coxinha', 'Mini coxinha de frango', 'Para festas',
    'O clássico das festas, no tamanho de uma mordida.', 110, 'cento', 100, 0.5],
  ['mini-kibe', 'Mini kibe', 'Para festas',
    'Kibe de carne com hortelã, sequinho e bem temperado.', 100, 'cento', 100, 0.5],
  ['mini-risole', 'Mini risole de presunto e queijo', 'Para festas',
    'Meia-lua crocante com recheio cremoso.', 105, 'cento', 100, 0.5],
  ['mini-bolinha', 'Mini bolinha de queijo', 'Para festas',
    'Muçarela derretida em uma casquinha dourada.', 125, 'cento', 100, 0.5],
  ['mini-enroladinho', 'Mini enroladinho de salsicha', 'Para festas',
    'O favorito das crianças.', 95, 'cento', 100, 0.5],
  ['mini-coxinha-congelada', 'Mini coxinha congelada', 'Congelados',
    'Pacote com 50 unidades para fritar em casa. Dura até 3 meses no freezer.', 55, 'pacote com 50', 50, 1],
  ['mini-kibe-congelado', 'Mini kibe congelado', 'Congelados',
    'Pacote com 50 unidades para fritar em casa. Dura até 3 meses no freezer.', 50, 'pacote com 50', 50, 1],
].map(([id, nome, categoria, descricao, preco, unidade, rende, passo], i) => ({
  id, nome, categoria, descricao, preco, unidade, rende, passo, ativo: true, ordem: i + 1,
}));

const massaCoxinha = { 'ing-farinha': 500, 'ing-leite': 500, 'ing-margarina': 50, 'ing-caldo': 2 };
const empanar = (rosca) => ({ 'ing-ovos': 2, 'ing-rosca': rosca });

const fichas = [
  ['coxinha', 22, 0.3, { ...massaCoxinha, 'ing-frango': 700, 'ing-requeijao': 250, 'ing-cebola': 150, ...empanar(400) }],
  ['mini-coxinha', 100, 2.5, { ...massaCoxinha, 'ing-frango': 500, 'ing-requeijao': 150, 'ing-cebola': 150, ...empanar(300) }],
  ['mini-coxinha-congelada', 100, 1.2, { ...massaCoxinha, 'ing-frango': 500, 'ing-requeijao': 150, 'ing-cebola': 150, ...empanar(300) }],
  ['kibe', 20, 0.3, { 'ing-trigo-kibe': 400, 'ing-carne': 600, 'ing-mucarela': 300, 'ing-cebola': 150, 'ing-hortela': 1 }],
  ['mini-kibe', 100, 2.5, { 'ing-trigo-kibe': 400, 'ing-carne': 500, 'ing-cebola': 150, 'ing-hortela': 1 }],
  ['bolinha', 25, 0.3, { ...massaCoxinha, 'ing-caldo': 1, 'ing-mucarela': 600, ...empanar(400) }],
  ['mini-bolinha', 100, 2.5, { ...massaCoxinha, 'ing-caldo': 1, 'ing-mucarela': 500, ...empanar(300) }],
].map(([id, rendimento, embalagem, itens]) => ({
  id,
  rendimento,
  embalagem,
  outrosPct: 20,
  itens: Object.entries(itens).map(([ingredienteId, qtd]) => ({ ingredienteId, qtd })),
}));

// Cardápio inicial (sem pedidos): usado também para começar na nuvem.
export function cardapioInicial() {
  return {
    config: { ...CONFIG_PADRAO },
    produtos: structuredClone(produtos),
    ingredientes: structuredClone(ingredientes),
    fichas: structuredClone(fichas),
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
      dataEntrega: dia(0), hora: '15:00', itens: [item('mini-coxinha', 1), item('mini-kibe', 0.5)],
      pagamento: pago('Pix', -2), obs: 'Aniversário de 6 anos. Separar em duas caixas.',
    }),
    pedido({
      id: 'ex-2', codigo: 'K8M2', criadoEm: criado(-1), origem: 'Instagram', status: 'confirmado',
      cliente: { nome: 'Marcos Vinícius', telefone: '' },
      entrega: { tipo: 'entrega', endereco: 'Rua Bernardino de Campos, 1200 - Centro' },
      dataEntrega: dia(0), hora: '19:00', itens: [item('coxinha', 6), item('kibe', 4)],
      pagamento: aPagar('Dinheiro'), obs: 'Troco para R$ 100.',
    }),
    pedido({
      id: 'ex-3', codigo: 'Q2ZD', criadoEm: criado(0), origem: 'Site', status: 'novo',
      cliente: { nome: 'Escritório Contábil Nogueira', telefone: '' },
      entrega: { tipo: 'entrega', endereco: 'Av. Alberto Andaló, 3000, sala 12 - Centro' },
      dataEntrega: dia(1), hora: '10:00', itens: [item('mini-coxinha', 1), item('mini-bolinha', 1)],
      pagamento: aPagar('Pix'), obs: 'Pode mandar guardanapos?',
    }),
    pedido({
      id: 'ex-4', codigo: 'R5TN', criadoEm: criado(-3), origem: 'WhatsApp', status: 'confirmado',
      cliente: { nome: 'Renata (festa da Clara)', telefone: '' }, entrega: retirada,
      dataEntrega: dia(1), hora: '17:30',
      itens: [item('mini-coxinha', 1.5), item('mini-kibe', 1), item('mini-enroladinho', 0.5)],
      pagamento: aPagar('Pix'),
    }),
    pedido({
      id: 'ex-5', codigo: 'J4WB', criadoEm: criado(-2), origem: 'WhatsApp', status: 'entregue',
      cliente: { nome: 'Juliana Castro', telefone: '' },
      entrega: { tipo: 'entrega', endereco: 'Rua Siqueira Campos, 455 - Boa Vista' },
      dataEntrega: dia(-1), hora: '12:00', itens: [item('coxinha', 10)], pagamento: pago('Pix', -1),
    }),
    pedido({
      id: 'ex-6', codigo: 'C9PX', criadoEm: criado(-6), origem: 'Indicação', status: 'entregue',
      cliente: { nome: 'Carla Mendes', telefone: '' }, entrega: retirada,
      dataEntrega: dia(-3), hora: '16:00', itens: [item('mini-coxinha', 2), item('mini-bolinha', 1)],
      pagamento: pago('Pix', -3),
    }),
    pedido({
      id: 'ex-7', codigo: 'L7HS', criadoEm: criado(-6), origem: 'Instagram', status: 'entregue',
      cliente: { nome: 'Lucas Oliveira', telefone: '' }, entrega: retirada,
      dataEntrega: dia(-6), hora: '11:00', itens: [item('mini-coxinha-congelada', 2)],
      pagamento: pago('Dinheiro', -6),
    }),
    pedido({
      id: 'ex-8', codigo: 'F3GE', criadoEm: criado(-9), origem: 'WhatsApp', status: 'cancelado',
      cliente: { nome: 'Fernanda Lima', telefone: '' }, entrega: retirada,
      dataEntrega: dia(-8), hora: '18:00', itens: [item('coxinha', 5)], pagamento: aPagar('Pix'),
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

  return { ...cardapioInicial(), pedidos, lancamentos };
}
