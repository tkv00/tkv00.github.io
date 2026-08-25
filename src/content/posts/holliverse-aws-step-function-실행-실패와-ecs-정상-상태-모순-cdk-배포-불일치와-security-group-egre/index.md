---
title: "[Holliverse] AWS Step Function 실행 실패와 ECS 정상 상태 모순: CDK 배포 불일치와 Security Group Egress 누락 추적기"
date: 2026-03-27
legacyUrl: "https://codekim3570.tistory.com/31"
---## 1\. 문제 발생

최근 변경된 On-Demand 워크플로우를 구현하며 운영환경에서 배포 이후, 실행 과정(KST 기준: 2026년 3월 14일 11시 2분 15.769초)에서 예상하지 못한 장애를 직면했다.

![](https://blog.kakaocdn.net/dna/dHG7u9/dJMcabjlPzB/AAAAAAAAAAAAAAAAAAAAAL2PR7NEW6rRyWLGos5XMjn6svs5Ma1AXRptxa0zdYzj/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=865NeD0QTscy%2BVtQMGFhbmejHXs%3D)

해당 워크플로우는 **EventBridge**에서 시작되어 **Step Functions**, **Lambda(Readiness Probe)**, **ECS RunTask**, **DynamoDB** **Lock**으로 이어지는 구조를 가진다. 워크플로우의 핵심 목적은 본격적인 배치 작업 실행 전에 대상 시스템인 analysis-server가 실제로 준비되었는지 /ready 및 /health 엔드포인트를 통해 확인하고, 검증이 완료된 후 후속 작업을 수행하는 것이다.

실패한 내역은 아래와 같다.

-   상태 머신: AnalysisBatchWorkflow
-   실행 시각: 2026-03-14 11:02:15 KST
-   종료 시각: 2026-03-14 11:06:56 KST
-   최종 상태: FAILED

* * *

## 2\. 가설 세우기

장애가 발생한 워크플로우는 AWS CDK in Java로 작성하였으며 **OnDemandWorkflowStack.java**에 정의되어 있다. 특히, Readiness Probe 역할을 수행하는 Lamda 함수는 어플리케이션 내부 로직이 아닌, CDK를 통해 주입받은 VPC, Subnet, Security Group(SG) 설정에 의해 네트워크 통신 경로가 결정된다.

![](https://blog.kakaocdn.net/dna/mMn0R/dJMcahqjM6j/AAAAAAAAAAAAAAAAAAAAAFfMm-M3Zg-i1nDdF5XR1ux-XWduyBvX0aG7CI1EiGJd/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=c1Xx7O3kWl2PaF7G5pPWeAiZvho%3D)

장애 발생 지점은 파악을 했으므로 해당 단계에서 발생할 수 있는 4가지 가설을 세웠다.

1.  analysis-server의 기동이 지연되어 /ready 응답에서의 timeout이 발생했을 가능성.
2.  응답은 정상적으로 수신했으나 릴리스 태그나 계약 조건이 불일치할 가능성
3.  Lamda가 analysis-server로의 네트워크 연결 자체를 못하는 가능성
4.  AWS CDK 의 코드 내용과 실제 AWS 인프라 환경의 배포 상태가 다를 가능성

* * *

## 3\. 가설 검증 및 원인 추적

### 1) Step Functions에서 실패 지점 파악

![](https://blog.kakaocdn.net/dna/KHb4B/dJMcadnR7vY/AAAAAAAAAAAAAAAAAAAAAI5gUpUBckkQYOJGQO7IoGHgX9aKyls3zAQo1zikcGX1/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=wcpiU5%2FsXSNwb3H%2FyRgcIx%2FNvGw%3D)

가장 먼저 AWS console - Step Functions 에서 실행 이력을 분석하여 실패 지점을 좁혔다. 전체 워크 플로우 중 배치 실행 단계가 아니라 준비 상태를 확인하는 **ProbeAnalysisServerReady** 단계에서 에러가 발생했음을 확인했다.

![](https://blog.kakaocdn.net/dna/zlKhO/dJMcadnR7yM/AAAAAAAAAAAAAAAAAAAAAG4uKRcDMgK96WyeYW67H1NY7Qn02mrF8FhS60vgp-bg/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=TMiuyp9cCaPRGtSKOVR2zg5LwzA%3D)

![](https://blog.kakaocdn.net/dna/0mGlD/dJMcaiCJlCN/AAAAAAAAAAAAAAAAAAAAALsqtC5wzPu84j2HVrqQQmkLTbPfARW6uuc3ew5qXarz/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=GH%2B%2F2IKA0UhCfu0lA7lAUQMrI%2FQ%3D)

해당 단계에서는**probeIntervalSeconds**와 **probeMaxAttempts** 설정에 따라 지정된 횟수만큼 재시도를 수행하도록 설계되어 있었으며, 설정된 재시도를 모두 소진한 후 최종 실패로 처리되고 있다.

### 2) Lamda 로그에서 timeout 패턴 확인

다음으로 정확한 실패 사유를 분석하기 위해 Readiness Probe Lamda 실행 로그를 분석했다. Lamda의 Python-urllib를 이용하여 대상 서버에 GET 요청을 보내고 HTTP 상태 코드 및 Payload의 정합성을 검증하도록 작성했다.

![](https://blog.kakaocdn.net/dna/d2CbXT/dJMcagEXCNe/AAAAAAAAAAAAAAAAAAAAANaiyVDsKxgEZtsVkgC1dNwrROp4o2SBtpKa6FQo76gl/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=gq1IoExefjUd2R7yqVWoE2bfo%2BI%3D)

로그 분석 결과, HTTP 500이나 404와 같은 서버 에러나 릴리즈 태그 불일치 에러는 발견되지 않았다. 다만 네트워크 레벨에서의 urlopen timeout 예외가 5초 간격으로 누적되어 발생하고 있었다. 이는 Lamdbda가 대상 서버로 연결조차 하지 못하는 상태임을 의한다. 이를 근거로 가설2는 배제했다.

실제로 오류가 발생하는 시점의 코드는 아래와 같다.

![](https://blog.kakaocdn.net/dna/3DCOh/dJMcaaxXMA8/AAAAAAAAAAAAAAAAAAAAAMZ4Jtv0p33f-inmsqH6L9zJRXZ-pTUahKqhxIDSzuXE/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=OQCUFjKzezykfefbhbRG2GVEUKo%3D)

### 3) Analysis ECS Service Task 상태 확인

이어서, 타겟 서버인 analysis-server 자체의 업-다운 여부 확인을 위해 ECS Task 상태를 확인했다. 확인 결과 ECS Task는 Step Functions가 실행하기 이전부터 정상적으로 기동되어 RUNNING 상태임을 확인했다.

![](https://blog.kakaocdn.net/dna/bxynZR/dJMcahDOVFW/AAAAAAAAAAAAAAAAAAAAAAkKtXd2ZZhGmOB1p12NiY9baC2tvP65TymZyHqgmASF/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=m3jE4uCQjfifdei0nJKTuOvKeXk%3D)

따라서, **Analysis Server task**가 늦게 기동되어 **timeout**이 발생했을 것이라는 첫 번째 가설은 아님을 입증했다.

### 4) Security Group 규칙 확인

네트워크 통신 간 보안 문제 확인을 위해 각각 할당된 Security Group의 규칙을 확인했다. 타겟 서버인 Analysis-Server의 인바운드 규칙은 올바르게 설정되어 접근을 허용하고 있었다.

![](https://blog.kakaocdn.net/dna/bRBQUB/dJMcacbsRWB/AAAAAAAAAAAAAAAAAAAAAKAigzghulZ7fNueR7fsf4ZR5IxB9rhjAp45bkKkCi_C/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=DD90ZH7rBY%2FbQb6FiW5ZxP9VcJo%3D)

하지만, **Security Group** 간 통신이 가능하려면 인바운드 뿐만 아니라 출발지의 아웃바운드 규칙 역시 설정되어있어야 한다. AWS CDK 코드상으로 Probe Lambda가 속한 **AnalysisServerSg**의 8000번 포트로 향하는 Egress 규칙이 명확히 정의되어 있었다. 하지만 실제 AWS 환경에 프로비저닝된 리소스를 확인해 보니 해당 아웃바운드 규칙이 누락되어 있었다. 이로 인해 **TCP 3-Way Handshake**조차 이루어지지 않아 타임아웃이 발생했던 것이다.

### 5) CloudFormation 스택 상태 확인

코드에는 존재하는 규칙이 실제 인프라에 반영되지 않은 이유를 찾기 위해 **CloudFormation**의 스택 배포 상태를 확인했다. 확인 결과, 워크플로우 로직을 담은 **OnDemandWorkflowStack**은 정상적으로 배포(UPDATE\_COMPLETE)되었으나, 네트워크 규칙 변경을 포함하는 **NetworkStack**은 모종의 이유로 롤백(UPDATE\_ROLLBACK\_COMPLETE)된 상태였다.

![](https://blog.kakaocdn.net/dna/bnl4wg/dJMcajuRFzt/AAAAAAAAAAAAAAAAAAAAADYfhwFA2KXGowLtXiDLM-hxJebyIo9oA8TtnkA4_DbC/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=anqxzdG6Nhhxv4sxV6ll8%2BZ9g8c%3D)

결과적으로 Readiness Probe 기능 자체는 추가되었으나, 해당 기능이 의존하는 네트워크 계층의 변경 사항이 반영되지 않아 코드와 실제 인프라 간의 드리프트(Drift)가 발생한 것이 장애의 근본 원인이었다.

* * *

## 4\. 해결 조치 및 회고

### 1) 해결 방법

![](https://blog.kakaocdn.net/dna/IRrGc/dJMcafTzrBq/AAAAAAAAAAAAAAAAAAAAAOf1WlFf2CFSEeMb9M4eSouEKi2cgSK3ksW3iBe5czZb/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=ZER10F%2B1BpKVc9fqv%2BWoiEqiRUM%3D)

운영 환경의 즉각적인 정상화를 위해, AWS 콘솔을 통해 **AdminApiSg**에 누락되었던 TCP 8000 아웃바운드 규칙을 수동으로 추가하는 임시 대응을 진행했다.

![](https://blog.kakaocdn.net/dna/bEs9TU/dJMcajax3I3/AAAAAAAAAAAAAAAAAAAAAPI0lXnSw1_fKbN6OniSS6IfdZkip6xR9FpdZq19GvO7/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=U%2FvvoMJyxG02xMzxBf644jAmPDs%3D)

조치 직후 **Readiness Probe**가 정상적으로 엔드포인트에 도달하며 워크플로우가 복구되었다.

### 2) 회고

### Security Group 설정 검토

이번 장애를 겪으면서 느낀 점은, Security Group을 설정할 때 목적지의 인바운드(Ingress)뿐만 아니라 출발지의 아웃바운드(Egress) 규칙도 반드시 함께 챙겨야 한다는 기본기이다.

사실 CDK로 인프라 코드를 작성하고 리뷰할 때는 아웃바운드가 누락되었다는 걸 전혀 눈치채지 못했다. 사람이 눈으로만 코드를 쫓다 보면 이런 사소한 실수는 정말 놓치기 쉽고, 이 작은 실수가 실제 운영 환경에서는 전체 워크플로우를 멈추게 만드는 큰 위험으로 돌아온다.

'테스트 코드가 중요하다'는 건 늘 머리로는 알고 있었지만, 애플리케이션 코드가 아닌 인프라(IaC) 영역에서도 그 중요성을 다시금 실감한 케이스였다. 아래와 같은 교훈을 마음 속에 새겼다.

> 사람의 코드를 믿지 말고 테스트 코드를 통해 시스템을 믿자

### 시스템 실행 중 ≠ 시스템 동작

장애 발생 직후 ECS 클러스터 콘솔을 열어봤을 때, Analysis Server는 아무 이상 없이 초록색 'RUNNING' 상태를 띄우고 있었다. 그걸 보고 당연히 분석 서버 쪽은 문제가 없다고 단정 지어버렸고, 배치 서버의 로그만 주구장창 파헤쳤다. 트러블슈팅의 방향이 처음부터 엇나갔었다.

하지만 결국 진짜 원인은 네트워크 단의 방화벽(SG) 문제였다. 즉, 컨테이너 프로세스가 잘 떠서 '실행 중'이라는 사실이, 곧 그 서비스가 외부 요청을 정상적으로 받고 '동작'한다는 것을 의미하지는 않는다는 걸 확실히 배웠다.

앞으로는 단순히 프로세스 생존 여부만 볼 것이 아니라, 실제로 네트워크 통신이 가능한지 실질적인 상태를 모니터링해야한다. 그리고 이렇게 서비스가 실질적인 정상 동작을 하지 못할 때, 개발자가 지체 없이 인지할 수 있도록 알림(Alert) 체계를 촘촘하게 보완할 예정이다.

[one-year-gap

one-year-gap has 10 repositories available. Follow their code on GitHub.

github.com](https://github.com/one-year-gap)

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 31 }

공유하기
