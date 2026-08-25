---
title: "[TR1L] Event Storming, DDD, Bounded Context, Domain Model 설계"
date: 2026-03-27
legacyUrl: "https://codekim3570.tistory.com/35"
---팀원들 모두 나를 포함해 도메인 모델링에 대한 이해도가 높지 않았기 때문에, 나는 공통 이해를 맞추기 위한 두 가지 방법을 제안했다.

첫째, Event Storming에 들어가기 전에 팀원 전원이 관련 강의를 먼저 수강하도록 했다. 특히 Microservice 설계(with EventStorming, DDD) 강의(진짜 도움 많이 됨 ㅜㅜ)는 개념을 처음 접하는 팀원들도 흐름을 잡는 데 큰 도움이 되었고, 이후 논의에서도 공통 언어를 맞추는 데 효과적이었다.

[Microservice 설계(with EventStorming,DDD)| han jeong heon - 인프런 강의

현재 평점 4.6점 수강생 1,037명인 강의를 만나보세요. 마이크로서비스 설계를 위한 도메인 주도 설계(Domain Driven Design)를 쉽게 설명하고, 실제로 활용하기 위한 구체적인 실천 방법을 소개합니다.

www.inflearn.com](https://www.inflearn.com/course/%EB%8F%84%EB%A9%94%EC%9D%B8%EC%A3%BC%EB%8F%84-%EC%84%A4%EA%B3%84-%EB%A7%88%EC%9D%B4%ED%81%AC%EB%A1%9C%EC%84%9C%EB%B9%84%EC%8A%A4/dashboard?cid=328422)

두 번째로, 실제 도메인 모델링 단계에서는 한 가지 자료만 보는 대신, DDD 관련 책과 여러 참고 자료를 함께 보며 이해의 기준을 맞추려고 했다. 도메인 주도 개발 시작하기 같은 자료를 참고했고, 팀 단톡방에서도 관련 레퍼런스를 계속 공유하면서 서로의 이해 포인트를 맞춰 나갔다.

[\[전자책\] 도메인 주도 개발 시작하기 | 최범균 | 한빛미디어 - 예스24

가장 쉽게 배우는 도메인 주도 설계 입문서!이 책은 도메인 주도 설계(DDD)를 처음 배우는 개발자를 위한 책이다. 실제 업무에 DDD를 적용할 수 있도록 기본적인 DDD의 핵심 개념을 익히고 구현을

www.yes24.com](https://www.yes24.com/product/goods/108791897)

추가로 실제 코드 구현 단계에서는 팀원마다 구현 방식이 달라지지 않도록, 도메인 구현에 대한 공통 가이드라인을 직접 작성해 팀원들과 공유했다.

[

TR1L-Project Structure-270326-203205.pdf

0.87MB

](https://blog.kakaocdn.net/dna/bZ478G/dJMcafe0adS/AAAAAAAAAAAAAAAAAAAAAJJM5Sn-aenOp5NNFrriqcLgLSvogEwFi18oryO_C4_j/TR1L-Project%20Structure-270326-203205.pdf?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=UYu5O9Z1bzSc3KCzhX3qpyDSJSU%3D&attach=1&knm=tfile.pdf)
