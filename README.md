# Entrevistator

Aplicacao de estudo para entrevistas tecnicas com quiz interativo, feedback imediato e metricas de progresso por topico.

## O que o projeto faz

- Backend em Spring Boot para servir perguntas, registrar respostas e calcular analytics.
- Frontend em React + Vite para executar uma sessao de treino e visualizar progresso.
- Persistencia simples em JSON para facilitar desenvolvimento local sem banco de dados.

## Stack

- Java 21 + Spring Boot
- React 19 + TypeScript + Vite
- Tailwind CSS
- Recharts

## Estrutura

```text
src/                 Backend Spring Boot
frontend/            Frontend React/Vite
data/                Dados locais gerados em runtime (ignorado no Git)
examples/data/       Exemplos genericos de answers/runs
```

## Como rodar

### Backend

```powershell
mvn spring-boot:run
```

API padrao: `http://localhost:8080`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend padrao: `http://localhost:5173`

## Dados locais e privacidade

Os arquivos abaixo nao devem ser versionados porque representam uso pessoal/local:

- `data/answers.json`
- `data/runs.json`

Esses arquivos sao criados automaticamente pela aplicacao quando necessario. O repositorio inclui apenas exemplos anonimos em `examples/data/answers.example.json` e `examples/data/runs.example.json`.

## Endpoints principais

- `GET /quiz/session`
- `POST /answers`
- `POST /quiz/session/submit`
- `GET /analytics/topics`
- `GET /analytics/gaps`
- `GET /analytics/progress`

## Observacoes

- O frontend usa `VITE_API_BASE_URL` quando definido; sem isso, usa o mesmo host por padrao.
- O backend le perguntas de `src/main/resources/questions.json`.
- A persistencia atual e orientada a desenvolvimento local. Para producao, o proximo passo natural seria mover para banco relacional ou document store.

## Exemplos de dados

Use os arquivos em `examples/data/` como referencia de formato, nunca como base para armazenar seu historico real.
