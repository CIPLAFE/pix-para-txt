# Pix para TXT

App web para celular (PWA) que transforma o **Pix copia e cola** num arquivo
`.txt` para enviar pelo WhatsApp.

**Por que existe:** quando um código Pix é enviado como texto, o WhatsApp do
celular converte a mensagem num "Pix" especial, com o botão *Copiar código Pix*.
O WhatsApp Web não exibe esse tipo de mensagem e mostra *"Não foi possível
carregar a mensagem"*. Enviado como arquivo `.txt`, o código abre normalmente
no computador.

## O que faz

- Recebe o código pelo menu **Compartilhar** do Android (app do banco → Compartilhar
  → *Pix TXT*), pelo botão **Colar** ou digitado.
- Acha o código no meio de outro texto e valida o **dígito verificador (CRC16)**:
  código cortado ou alterado é recusado antes do envio.
- Mostra recebedor, cidade, valor (quando o código traz) e o tipo (estático,
  dinâmico, cobrança com vencimento).
- Gera `pix_<descricao>_<data>.txt` e abre o compartilhamento do celular
  (WhatsApp). O código fica na última linha do arquivo.
- **Vários Pix num arquivo só**: botão *+ Adicionar à lista e colar outro*
  (até 20). O arquivo sai como `pix_3-codigos_<data>.txt`, com um bloco
  numerado por Pix. A lista fica gravada no celular enquanto é montada, então
  dá para ir e voltar do app do banco compartilhando um código de cada vez.
- **Histórico local**: registra cada envio e avisa se o mesmo código já foi
  enviado antes (*"já enviado em 11/11/2026 10:21"*). Permite buscar, reenviar
  e excluir.

## Privacidade

- **Nenhum dado sai do celular.** Não há servidor, banco, CDN nem analytics.
  A página bloqueia qualquer conexão de rede pelo `Content-Security-Policy`
  (`connect-src 'none'`).
- O histórico fica no `localStorage` do Chrome **daquele celular**. Não
  sincroniza entre aparelhos.
- Limpar os dados do Chrome ou desinstalar o app **apaga o histórico**.
- O repositório público contém só o código do app, nenhum dado.
- O GitHub Pages registra o acesso à página (IP, como qualquer site), mas o
  código Pix nunca é enviado a ele: a página é lida do cache do próprio
  celular.
- No GitHub Pages, todos os repositórios do mesmo usuário ficam no mesmo
  endereço (`usuario.github.io`) e compartilham o `localStorage`. Não publique
  páginas de terceiros na mesma conta.

## Publicar no GitHub Pages

1. Em github.com, crie um repositório **público** chamado `pix-para-txt`.
2. Clique em **Add file → Upload files** e envie o conteúdo desta pasta,
   **incluindo a pasta `icons`**:
   `index.html`, `app.js`, `pix.js`, `style.css`, `sw.js`,
   `manifest.webmanifest`, `icons/`, `README.md`, `.gitignore`.
3. Em **Settings → Pages**: *Source* = **Deploy from a branch**,
   *Branch* = `main`, pasta `/ (root)` → **Save**.
4. Em 1 a 2 minutos o app fica em `https://<usuario>.github.io/pix-para-txt/`.

## Instalar no celular (Android)

1. Abra o endereço no **Chrome**.
2. Menu **⋮ → Instalar app** (ou *Adicionar à tela inicial*).
3. Pronto: o ícone *Pix TXT* aparece na tela inicial **e** na lista do
   **Compartilhar**. A lista do Compartilhar só aparece depois de instalar.

## Usar

1. No app do banco ou da guia: **Compartilhar** o código → *Pix TXT*
   (ou copie o código, abra o app e toque em **Colar**).
2. Opcional: escreva uma descrição (ex.: *FGTS outubro/2026*). Ela entra no
   nome do arquivo e no histórico.
3. Mais de um Pix? Toque em **+ Adicionar à lista e colar outro** e repita
   os passos 1 e 2 para cada código. Para um Pix só, pule este passo.
4. **Gerar TXT e compartilhar** → escolha o WhatsApp e o contato. O código
   que estiver no campo entra junto com a lista, sem precisar adicionar.
5. No computador, abra o `.txt`, clique 3 vezes no código, copie e cole no
   banco em *Pix → Pix Copia e Cola*. Com vários, pague um bloco por vez.

O histórico registra cada código separadamente quando o celular confirma o
compartilhamento, e a lista é esvaziada. Se cancelar, nada é registrado e a
lista continua montada.

## Atualizar o app

Depois de alterar qualquer arquivo, **aumente a versão em dois lugares**,
senão o celular continua usando a versão guardada em cache:

- `sw.js` → `const CACHE = 'pix-para-txt-v3';`
- `app.js` → `const VERSAO = '1.1.1';` (aparece no rodapé)

O celular baixa a versão nova na próxima abertura com internet. O rodapé
mostra a versão em uso.

## Testar no PC

```bash
python -m http.server 8765 --directory pix-para-txt
```

Abra `http://localhost:8765`. No PC o Chrome não compartilha arquivos, então
o app baixa o `.txt` (e registra no histórico como *baixado*).

## Arquivos

| Arquivo | Função |
| --- | --- |
| `pix.js` | Lê o código (formato EMV/BR Code) e confere o CRC16. Funções puras. |
| `app.js` | Tela, geração do `.txt`, compartilhamento e histórico. |
| `sw.js` | Cache para funcionar offline e abrir pelo Compartilhar. |
| `manifest.webmanifest` | Nome, ícones e registro no menu Compartilhar (`share_target`). |
