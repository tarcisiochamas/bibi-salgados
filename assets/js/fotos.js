// Fotos dos salgados e da página de apresentação. O navegador reduz a foto
// antes de guardar: ela vai dentro do banco de dados gratuito (o espaço de
// arquivos do Firebase é pago) e precisa abrir rápido no celular do cliente.

// Devolve a foto em JPEG (data URL) com o lado maior em "lado" pixels.
export async function reduzirFoto(arquivo, { lado = 480, qualidade = 0.75 } = {}) {
  const imagem = await abrirImagem(arquivo);
  const largura = imagem.width || imagem.naturalWidth;
  const altura = imagem.height || imagem.naturalHeight;
  const escala = Math.min(1, lado / Math.max(largura, altura));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largura * escala));
  canvas.height = Math.max(1, Math.round(altura * escala));
  const ctx = canvas.getContext('2d');
  // PNG com fundo transparente vira fundo branco no JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close?.();
  return canvas.toDataURL('image/jpeg', qualidade);
}

// Quanto a foto ocupa no banco: o texto inteiro da data URL, em bytes.
export function tamanhoDaFoto(dataUrl) {
  return String(dataUrl || '').length;
}

async function abrirImagem(arquivo) {
  if (!arquivo || !String(arquivo.type || '').startsWith('image/')) {
    throw new Error('Escolha um arquivo de foto (JPG ou PNG).');
  }
  try {
    // Já vem na posição certa, mesmo foto de celular tirada "deitada".
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    return carregarImagem(arquivo);
  }
}

function carregarImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não deu para abrir essa foto. Use uma foto JPG ou PNG.'));
    };
    img.src = url;
  });
}
