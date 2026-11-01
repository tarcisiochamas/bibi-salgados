# Bibi Salgados

Site gratuito da Bibi Salgados, com duas partes:

- **Página de vendas** (`index.html`): cardápio com foto de cada salgado, carrinho, ocasião do pedido com sugestão de quantidade e pedido que já vai escrito para o WhatsApp.
- **Apresentação** (`sobre.html`): página "Quem somos", com texto e fotos que o dono põe na gestão.
- **Gestão** (`gestao.html`): pedidos do dia, o que produzir, ingredientes da produção, estoque, lista de compras e simulação de compra, cardápio com ficha técnica e custo de cada salgado, finanças do mês com DRE, QR code para panfleto e ajustes do negócio.

Tudo roda de graça: o site fica no **GitHub Pages** e os dados no **Firebase** (plano Spark, gratuito).

## Como funciona

| Parte | Onde fica | Quem vê |
| --- | --- | --- |
| Cardápio e dados do negócio | Firestore (`produtos`, `config/negocio`) | Todo mundo |
| Página de apresentação | Firestore (`config/apresentacao`) | Todo mundo |
| Pedidos | Firestore (`pedidos`) | O site cria; só o dono lê |
| Ingredientes, fichas técnicas e finanças | Firestore (`ingredientes`, `fichas`, `lancamentos`) | Só o dono |

Quem protege os dados são as regras em [`firestore.rules`](firestore.rules). A gestão pede login com e-mail e senha (Firebase Authentication).

Sem Firebase configurado, o site roda em **modo local**: tudo fica guardado só no navegador, com dados de exemplo. Serve para testar.

## Cobrar antes da entrega

Em **Ajustes → Cobrar antes da entrega**, o dono liga e desliga quando quiser. Ligado, o cliente escolhe entre:

- **Pix**: depois de enviar o pedido, o site mostra o Pix copia e cola (e o QR Code, no computador) já com o valor e com o código do pedido como identificador. É gerado no próprio site (`assets/js/pix.js`), sem empresa de pagamento: o dinheiro cai direto na conta da chave Pix.
- **Cartão de crédito**, de um destes jeitos:
  - **Pelo próprio site**, quando a InfiniteTag da conta InfinitePay está em Ajustes. Depois de enviar o pedido, o cliente toca em **Pagar com cartão**, paga na página da InfinitePay (crédito em até 12x) e volta para o site, que confere o pagamento e mostra o comprovante. Na conta InfinitePay, é preciso ligar o **Checkout Integrado** (app → Vendas → Checkout → Configurações). Não precisa de servidor: o site cria a cobrança direto do navegador só com a InfiniteTag, que não é segredo (`assets/js/infinitepay.js`).
  - **Por link no WhatsApp**, sem InfiniteTag: o dono manda um link criado no app da maquininha ou do banco.

Com a InfiniteTag, o editor de pedidos da gestão também cria um link de pagamento no cartão para qualquer pedido, que entra na mensagem **Cobrar**.

Esses pedidos aparecem na gestão como **Aguardando pagamento** até serem marcados como pagos. A InfinitePay avisa o dono de cada venda no app, com o código do pedido.

## Estoque

A tela **Estoque** da gestão tem três abas:

- **Prontos**: salgados que ficam prontos esperando venda, como os congelados. Liga produto por produto. O pedido tira do estoque quando é confirmado e devolve se for cancelado. Quando acaba, o cliente ainda pode encomendar: o que passa do estoque vai marcado como **sob encomenda** no pedido e na mensagem, e o estoque fica negativo mostrando quanto falta produzir. Desligando em **Ajustes → Regras dos pedidos**, o site volta a mostrar **Esgotado** e não deixa pôr mais do que tem no carrinho. **Produzi mais** soma ao estoque e gasta os ingredientes pela ficha técnica.
- **Ingredientes**: ingredientes e embalagens (caixa, saquinho, etiqueta). Saem do estoque quando o pedido fica pronto, pela ficha técnica. Só entra nas baixas o que já foi contado uma vez. **Comprei** soma ao estoque e pode lançar o valor nas despesas.
- **Compras**: o que comprar para os pedidos em aberto dos próximos dias mais o estoque mínimo, menos o que já tem, arredondado para a embalagem de compra. **Comprei a lista** soma tudo de uma vez.

- **Simular**: "quero fazer 500 coxinhas". Mostra quanto a produção gasta de cada ingrediente, o custo por salgado e o que falta comprar, descontando o que já foi contado.

As embalagens entram na ficha técnica como os ingredientes, por receita, e ficam fora do acréscimo de gás, óleo e perdas. A tela **Hoje** avisa quando um salgado esgota ou um ingrediente fica abaixo do mínimo.

## Ocasião do pedido

O cliente escolhe a ocasião (aniversário, confraternização, reunião, outros) antes de enviar o pedido. Dizendo quantas pessoas vão, o site sugere quantos salgados pedir. As ocasiões e os salgados por pessoa ficam em **Ajustes → Ocasião do pedido**; com 0, a ocasião não sugere quantidade. A ocasião vai na mensagem do WhatsApp e aparece no pedido, na gestão.

## Fotos

A foto de cada salgado (no cadastro do produto) e as fotos da página de apresentação são reduzidas no próprio navegador e guardadas dentro do Firestore. O espaço de arquivos do Firebase (Storage) pede o plano pago; assim o site continua de graça. A página de apresentação aceita até 6 fotos.

## Finanças

Além do resumo do mês, a tela mostra o **DRE** (demonstrativo de resultado): vendas, menos taxas, menos ingredientes e embalagens, menos as outras despesas e os impostos, igual ao lucro do mês. Conta o dinheiro que entrou e saiu; retiradas e aportes do dono ficam de fora. **Copiar** leva o DRE em texto para o WhatsApp ou um e-mail.

Em **Ajustes → QR code para panfleto** dá para baixar o QR code do site ou do WhatsApp, em PNG grande, para imprimir.

## Ligar o Firebase

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto.
2. **Firestore Database**: crie o banco no modo de produção, local `southamerica-east1`.
3. **Authentication**: ative *E-mail/senha*, adicione o usuário do dono e, em *Configurações → Domínios autorizados*, inclua o domínio do site (ex.: `seuusuario.github.io`).
4. **Configurações do projeto → Seus apps → Web**: registre um app e copie o `firebaseConfig` para `assets/js/config.js`.
5. **Firestore → Regras**: cole o conteúdo de `firestore.rules`, trocando `dono@exemplo.com` pelo e-mail do dono, e publique. Sempre que `firestore.rules` mudar, publique as regras novas antes de pôr o site novo no ar. Se o site novo chegar antes, o pedido com ocasião é recusado e o site grava de novo com a ocasião nas observações.
6. Entre na gestão com o e-mail e a senha do dono, toque em **Usar cardápio de exemplo** e ajuste nomes, preços e o WhatsApp em **Ajustes**.

## Testar no computador

```bash
python3 -m http.server 8000
# abra http://localhost:8000 (vendas) e http://localhost:8000/gestao.html (gestão)
```

## Arquivos

```
index.html              página de vendas
sobre.html              página de apresentação ("Quem somos")
gestao.html             gestão
gestao.webmanifest      permite instalar a gestão na tela inicial do celular
firestore.rules         regras de segurança do banco
assets/css/             estilos (base.css é comum às duas páginas)
assets/js/config.js     configuração do Firebase
assets/js/store.js      onde os dados ficam (nuvem ou navegador)
assets/js/calculos.js   custo da ficha técnica, produção, resumo financeiro
assets/js/estoque.js    reservas, baixas e lista de compras do estoque
assets/js/pix.js        Pix copia e cola com valor (BR Code) e QR Code
assets/js/infinitepay.js  cartão pelo site, pela página de pagamento da InfinitePay
assets/js/vendor/       qrcode-generator (MIT), usado para desenhar o QR Code
assets/js/dados-exemplo.js  cardápio, ingredientes e fichas de exemplo
assets/js/fotos.js      reduz as fotos antes de guardar
assets/js/loja.js       página de vendas
assets/js/sobre.js      página de apresentação
assets/js/gestao.js     gestão
```
