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

## Tempo para fritar

O cliente precisa escolher dia e horário, e o site não deixa marcar antes de a cozinha dar conta: 1 hora a cada 50 salgados, nunca menos de 1 hora (25 salgados: 1 hora; 100: 2 horas; 300: 6 horas), contando de agora e arredondando para os próximos 15 minutos. Enquanto o cliente monta o pedido, aparece qual é o primeiro horário possível. Os dois números ficam em **Ajustes → Regras dos pedidos** (**Tempo para fritar** e **A cada**); 0 desliga. Se a **Antecedência mínima** for maior, vale ela.

## Cardápio da Bibi

O site já vem com o cardápio da Bibi (de 29/10/2026): 8 salgados e o churros de doce de leite, qualquer sabor a R$ 1,40 a unidade, pedidos a partir de 25 unidades (pedido mínimo de R$ 35,00). No site, o cliente escolhe de 5 em 5 unidades de cada sabor; isso muda no cadastro do produto, em **No site, de quantas em quantas**.

Enquanto o banco não tem nenhum produto, a página de vendas mostra esse cardápio sozinha. Na gestão, **Carregar o cardápio da Bibi** grava os 9 sabores no banco, com as fotos, para o dono poder mudar preços, fotos e estoque. A partir daí vale o que está no banco. Fichas técnicas não vêm junto: cada uma é cadastrada com a receita de verdade.

## Fotos

As fotos dos 9 sabores do cardápio da Bibi ficam no próprio site, em `assets/img/salgados/` (640 × 640, feitas pela Bibi em 03/11/2026). Quando todos os salgados de uma categoria têm foto, a categoria aparece em vitrine, com as fotos grandes; senão, cada foto aparece pequena ao lado do nome.

A foto que o dono põe ou troca no cadastro do produto e as fotos da página de apresentação são reduzidas no próprio navegador e guardadas dentro do Firestore. O espaço de arquivos do Firebase (Storage) pede o plano pago; assim o site continua de graça. A página de apresentação aceita até 6 fotos.

## Finanças

Além do resumo do mês, a tela mostra o **DRE** (demonstrativo de resultado): vendas, menos taxas, menos ingredientes e embalagens, menos as outras despesas e os impostos, igual ao lucro do mês. Conta o dinheiro que entrou e saiu; retiradas e aportes do dono ficam de fora. **Copiar** leva o DRE em texto para o WhatsApp ou um e-mail.

Em **Ajustes → QR code para panfleto** dá para baixar o QR code do site ou do WhatsApp, em PNG grande, para imprimir.

## Endereço do site

O site atende em **https://bibisalgados.com**, domínio comprado na Hostinger em 03/11/2026, na conta do Tarcisio (dá para passar para a conta da Bibi depois). O arquivo `CNAME` diz ao GitHub Pages qual é o domínio. O DNS do domínio, na Hostinger, aponta para o GitHub: registros A de `@` para 185.199.108.153, 185.199.109.153, 185.199.110.153 e 185.199.111.153, e CNAME de `www` para `tarcisiochamas.github.io`. O endereço antigo, `tarcisiochamas.github.io/bibi-salgados`, leva sozinho para o novo.

## Ligar o Firebase

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto.
2. **Firestore Database**: crie o banco no modo de produção, local `southamerica-east1`.
3. **Authentication**: ative *E-mail/senha*, adicione o usuário do dono e, em *Configurações → Domínios autorizados*, inclua os domínios do site (ex.: `seuusuario.github.io` e `bibisalgados.com`).
4. **Configurações do projeto → Seus apps → Web**: registre um app e copie o `firebaseConfig` para `assets/js/config.js`.
5. **Firestore → Regras**: cole o conteúdo de `firestore.rules`, trocando `dono@exemplo.com` pelo e-mail do dono, e publique. Sempre que `firestore.rules` mudar, publique as regras novas antes de pôr o site novo no ar. Se o site novo chegar antes, o pedido com ocasião é recusado e o site grava de novo com a ocasião nas observações.
6. Entre na gestão com o e-mail e a senha do dono, toque em **Carregar o cardápio da Bibi** e confira o WhatsApp em **Ajustes**.

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
assets/js/dados-exemplo.js  cardápio da Bibi, ingredientes e dados de exemplo do modo local
assets/img/salgados/    fotos dos sabores do cardápio da Bibi
assets/js/fotos.js      reduz as fotos antes de guardar
assets/js/loja.js       página de vendas
assets/js/sobre.js      página de apresentação
assets/js/gestao.js     gestão
```
