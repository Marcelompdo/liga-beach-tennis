# Areia — Organizador de Ligas de Beach Tennis

## O que é esta aplicação

Uma aplicação web com API REST para organizar ligas de Beach Tennis. Participantes podem criar uma conta e entrar em ligas; organizadores podem cadastrar ligas e sortear grupos equilibrados.

## Como instalar

Requisitos: Node.js 20 ou superior e npm.

```bash
npm install
```

Na primeira execução, `mongodb-memory-server` pode baixar os binários do MongoDB. O banco é mantido somente na memória durante a execução e volta a ser semeado ao reiniciar o servidor.

## Como executar

```bash
npm start
```

A aplicação inicia em `http://localhost:3000`. Para desenvolvimento com reinício automático, use `npm run dev`.

## Dados de teste incluídos

Quinze usuários de exemplo (3 organizadores e 12 participantes) são criados automaticamente. A senha para todas as contas é `Beach2026!`.

| Perfil | Nome | Email |
| --- | --- | --- |
| Organizador | Ana Organiza | `ana.organizadora@beachliga.com` |
| Organizador | Bruno Organiza | `bruno.organizador@beachliga.com` |
| Organizador | Fernanda Prado | `fernanda.organizadora@beachliga.com` |
| Participante | Carla Costa | `carla.participante@beachliga.com` |
| Participante | Diego Silva | `diego.participante@beachliga.com` |
| Participante | Elisa Martins | `elisa.participante@beachliga.com` |
| Participante | Felipe Rocha | `felipe.participante@beachliga.com` |
| Participante | Gabriela Lima | `gabriela.participante@beachliga.com` |
| Participante | Henrique Alves | `henrique.participante@beachliga.com` |
| Participante | Isabela Nunes | `isabela.participante@beachliga.com` |
| Participante | João Pedro | `joao.participante@beachliga.com` |
| Participante | Larissa Melo | `larissa.participante@beachliga.com` |
| Participante | Marcos Vieira | `marcos.participante@beachliga.com` |
| Participante | Nina Carvalho | `nina.participante@beachliga.com` |
| Participante | Otávio Santos | `otavio.participante@beachliga.com` |

Também são criadas três ligas de exemplo: **Copa Areia de Verão**, com 8 participantes inscritos, **Desafio das Dunas** e **Liga Pôr do Sol**, ambas abertas sem participantes.

## Regras de negócio

- Existem os perfis `organizador` e `participante`.
- Qualquer pessoa pode se cadastrar; o email é único e a senha deve ter pelo menos 8 caracteres.
- Apenas organizadores autenticados podem criar ligas.
- Uma liga recém-criada fica em `aguardando_participantes`.
- Apenas participantes autenticados podem entrar em ligas que aguardam participantes. Cada pessoa pode entrar uma vez.
- O sorteio fica disponível a partir de 4 participantes e só o organizador daquela liga pode iniciá-lo.
- O algoritmo embaralha os participantes, cria grupos de 4 sempre que possível e distribui o excedente com diferença máxima de 1 pessoa entre os grupos. Por exemplo, 10 participantes formam grupos de 4, 3 e 3.
- Após o sorteio, a liga muda para `grupos_sorteados` e as inscrições são encerradas.

## URLs importantes

- Site: `http://localhost:3000`
- API de saúde: `http://localhost:3000/api/health`
- Lista de ligas: `http://localhost:3000/api/leagues`
- Especificação OpenAPI/Swagger em YAML: `http://localhost:3000/api-docs.yaml`

## Endpoints REST

- `POST /api/auth/register` — cadastro
- `POST /api/auth/login` — login (retorna token Bearer)
- `GET /api/leagues` — listar ligas
- `POST /api/leagues` — criar liga (organizador)
- `POST /api/leagues/{id}/join` — entrar na liga (participante)
- `POST /api/leagues/{id}/draw` — sortear grupos (organizador da liga)

O contrato completo está em [`openapi.yaml`](./openapi.yaml) e também é servido por `/api-docs.yaml`.
