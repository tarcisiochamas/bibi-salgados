// Pix copia e cola (o "BR Code" do Banco Central) já com o valor do pedido,
// para o cliente pagar antes da entrega. O código é montado aqui mesmo, sem
// empresa de pagamento no meio: o dinheiro cai direto na conta da chave Pix.

// Entende a chave do jeito que a pessoa digitou e devolve no formato do Pix.
// Retorna null quando não dá para saber que chave é.
export function lerChavePix(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { tipo: 'e-mail', chave: t.toLowerCase() };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return { tipo: 'chave aleatória', chave: t.toLowerCase() };
  }
  if (/[^\d\s().+\-/]/.test(t)) return null;

  const d = t.replace(/\D/g, '');
  const celular = (n) => n.length === 11 && n[2] === '9';
  if (t.startsWith('+') || d.length === 13) {
    return d.startsWith('55') && celular(d.slice(2)) ? { tipo: 'celular', chave: `+${d}` } : null;
  }
  if (d.length === 14) return { tipo: 'CNPJ', chave: d };
  if (d.length !== 11) return null;
  // 11 dígitos podem ser CPF ou celular com DDD: o jeito de escrever desempata.
  const escritoComoCelular = /[()]/.test(t);
  const escritoComoCpf = t.includes('.');
  if (!escritoComoCelular && cpfValido(d)) return { tipo: 'CPF', chave: d };
  if (!escritoComoCpf && celular(d)) return { tipo: 'celular', chave: `+55${d}` };
  return null;
}

function cpfValido(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    if ((soma * 10) % 11 % 10 !== Number(d[n])) return false;
  }
  return true;
}

// Monta o código copia e cola. "identificador" aparece no extrato de quem
// recebe em muitos bancos; usamos o código do pedido.
export function codigoPix({ chave, nome, cidade, valor, identificador }) {
  const txid = String(identificador || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const cidadeSemEstado = String(cidade || '').split(/\s+-\s+|,|\//)[0];
  const corpo = campo('00', '01')
    + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave))
    + campo('52', '0000')
    + campo('53', '986')
    + (valor > 0 ? campo('54', valor.toFixed(2)) : '')
    + campo('58', 'BR')
    + campo('59', textoPix(nome, 25) || 'RECEBEDOR')
    + campo('60', textoPix(cidadeSemEstado, 15) || 'BRASIL')
    + campo('62', campo('05', txid))
    + '6304';
  return corpo + crc16(corpo);
}

const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

// Nome e cidade vão sem acento e em maiúsculas, que é o que todo banco aceita.
function textoPix(texto, max) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    .toUpperCase().slice(0, max).trim();
}

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), o dígito verificador do BR Code.
function crc16(texto) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Desenha o QR Code do Pix. Se a biblioteca não carregar, o copia e cola continua valendo.
export async function desenharQrPix(alvo, codigo) {
  try {
    const { default: qrcode } = await import('./vendor/qrcode.js');
    const qr = qrcode(0, 'M');
    qr.addData(codigo);
    qr.make();
    alvo.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true, title: 'QR Code do Pix' });
  } catch (e) {
    console.warn('QR Code do Pix não carregou:', e);
    alvo.hidden = true;
  }
}
