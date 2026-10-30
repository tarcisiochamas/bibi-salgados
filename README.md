# Bibi Salgados

Site gratuito da Bibi Salgados, com duas partes:

- **Página de vendas** (`index.html`): cardápio, carrinho e pedido que já vai escrito para o WhatsApp.
- **Gestão** (`gestao.html`): pedidos do dia, o que produzir, ingredientes da produção, cardápio com ficha técnica e custo de cada salgado, finanças do mês e ajustes do negócio.

Tudo roda de graça: o site fica no **GitHub Pages** e os dados no **Firebase** (plano Spark, gratuito).

## Como funciona

| Parte | Onde fica | Quem vê |
| --- | --- | --- |
| Cardápio e dados do negócio | Firestore (`produtos`, `config`) | Todo mundo |
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

## Ligar o Firebase

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto.
2. **Firestore Database**: crie o banco no modo de produção, local `southamerica-east1`.
3. **Authentication**: ative *E-mail/senha*, adicione o usuário do dono e, em *Configurações → Domínios autorizados*, inclua o domínio do site (ex.: `seuusuario.github.io`).
4. **Configurações do projeto → Seus apps → Web**: registre um app e copie o `firebaseConfig` para `assets/js/config.js`.
5. **Firestore → Regras**: cole o conteúdo de `firestore.rules`, trocando `dono@exemplo.com` pelo e-mail do dono, e publique.
6. Entre na gestão com o e-mail e a senha do dono, toque em **Usar cardápio de exemplo** e ajuste nomes, preços e o WhatsApp em **Ajustes**.

## Testar no computador

```bash
python3 -m http.server 8000
# abra http://localhost:8000 (vendas) e http://localhost:8000/gestao.html (gestão)
```

## Arquivos

```
index.html              página de vendas
gestao.html             gestão
gestao.webmanifest      permite instalar a gestão na tela inicial do celular
firestore.rules         regras de segurança do banco
assets/css/             estilos (base.css é comum às duas páginas)
assets/js/config.js     configuração do Firebase
assets/js/store.js      onde os dados ficam (nuvem ou navegador)
assets/js/calculos.js   custo da ficha técnica, produção, resumo financeiro
assets/js/pix.js        Pix copia e cola com valor (BR Code) e QR Code
assets/js/infinitepay.js  cartão pelo site, pela página de pagamento da InfinitePay
assets/js/vendor/       qrcode-generator (MIT), usado para desenhar o QR Code
assets/js/dados-exemplo.js  cardápio, ingredientes e fichas de exemplo
assets/js/loja.js       página de vendas
assets/js/gestao.js     gestão
```
