# Definição do Produto — NANDS-ON

## Visão Geral

**NANDS-ON — From NAND to CPU** (em [nands-on.com](https://nands-on.com)) é uma
aplicação web em JavaScript/TypeScript para simulação de lógica digital, inspirada na
[versão 0 do Digital-Logic-Sim](https://github.com/SebLague/Digital-Logic-Sim/tree/Version-0)
de Sebastian Lague. A aplicação permite ao usuário montar circuitos a partir de portas
lógicas elementares, encapsulá-los em componentes reutilizáveis e, progressivamente,
construir blocos cada vez mais complexos — partindo da porta NAND até chegar a uma CPU.

## Problema

Aprender como uma CPU funciona a partir dos seus blocos mais fundamentais costuma exigir
ferramentas pesadas, instalação local ou conhecimento prévio. Este projeto resolve isso
oferecendo um **simulador simples de portas lógicas e criação de componentes**, com
interface web e banco de dados local no browser — **sem necessidade de backend ou
instalação**.

## Usuários

Os usuários principais são **usuários finais**: estudantes, entusiastas e curiosos que
querem entender, de forma prática e visual, como circuitos digitais e processadores são
construídos a partir de portas lógicas.

## Objetivos-Chave

- **Simplicidade didática** — ensinar como uma CPU é construída a partir de portas NAND,
  de forma acessível.
- **Funcionar 100% no browser** — sem backend e sem instalação; persistência via
  armazenamento local.
- **Criação de componentes** — permitir compor portas em chips reutilizáveis, com
  abstração hierárquica.
- **Performance fluida** — simulação em tempo real responsiva mesmo com muitos
  componentes.
- **Execução em smartphones e tablets** — interface utilizável em dispositivos móveis,
  não apenas desktop.

## Referência

- Inspiração principal: [Digital-Logic-Sim (Version-0)](https://github.com/SebLague/Digital-Logic-Sim/tree/Version-0)
