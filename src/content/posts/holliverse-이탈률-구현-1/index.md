---
title: "[Holliverse] 이탈률 구현 (1)"
date: 2026-03-31
legacyUrl: "https://codekim3570.tistory.com/38"
---## **1\. 개요**

**Holliverse**의 이탈률의 정의와 오케스트레이션 계산 엔진 설계는 아래의 포스팅에서 확인할 수 있다.

[\[Holliverse\] 이탈률 구현 설계 (1) - 이탈률의 생명주기

우리 서비스가 이탈률 시스템을 도입하게 된 계기와 파이프 라인의 당위성은 아래 문서에서 확인할 수 있다.이탈률 도입 이탈률 설계 | Holliverse Wiki안녕하세요. 저희 프로젝트는 크게 두 축으로

codekim3570.tistory.com](https://codekim3570.tistory.com/entry/Holliverse-%EC%9D%B4%ED%83%88%EB%A5%A0-%EA%B5%AC%ED%98%84-%EC%84%A4%EA%B3%84-1-%EC%9D%B4%ED%83%88%EB%A5%A0%EC%9D%98-%EC%83%9D%EB%AA%85%EC%A3%BC%EA%B8%B0)

[\[Holliverse\] 이탈률 구현 설계 (2) - 오케스트레이션 구축

1\. 개요해당 글에서는 이전 글에서 정리한 이탈률 생명주기를 바탕으로, 각 이벤트가 어떤 방식으로 이탈률 계산에 반영되는지, 그리고 이탈률 임계치에 도달한 이유를 기록하기 위해 어떤 파이

codekim3570.tistory.com](https://codekim3570.tistory.com/entry/Holliverse-%EC%9D%B4%ED%83%88%EB%A5%A0-%EA%B5%AC%ED%98%84-%EC%84%A4%EA%B3%84-2-%EC%98%A4%EC%BC%80%EC%8A%A4%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%85%98-%EA%B5%AC%EC%B6%95)

이번 포스팅에서는 이탈률이 정상적으로 우리가 의도한 대로 적용이 되는지 여러 환경에서의 테스트를 통해 검증하려고 한다. 현재 클라이언트에서부터 사용자 로그를 받는 API는 **POST /api/v1/customer/user-logs**가 202 Accepted를 반환하는 API로 이 중 아래 3개의 로그만이 이탈률 계산에 반영된다. 

-   **요금제 변경 클릭 - click\_change**
-   **요금제 비교 클릭 - click\_compare**
-   **위약금 확인 클릭 - click\_change\_success**

운영 단계에서의 이탈률 테스트를 위해 아래와 같은 사항들을 검증하고자 하였고, 이를 테스트하기 위해 5가지의 테스트 시나리오를 구성했다.

1.  customer 서버가 실제로 로그를 정상 수신했는가
2.  customer가 churn(이탈률) 대상 로그만 정확히 admin으로 전달되었는가
3.  admin이 이를 feature count가 churn snapshot에 정합하게 반영되었는가
4.  부하 상황에서 유실, 중복, same-member 충돌이 없는가

**Customer Server** → **admin server**에서 로그를 전송하는 Webhook만을 테스트하는 것이 아니라 Customer가 로그를 전송하는 **POST /api/v1/customer/user-logs**를 테스트하는 이유부터 작성하겠다.

* * *

### 1) 왜 Admin Webhook 직접 호출이 아니라 Customer의 E2E 테스트인가

처음에는 admin 내부 **webhook**만 직접 호출하는 방식도 충분해 보였다. 실제로 admin write path만 빠르게 검증하려면 그 방식이 더 단순하고 속도도 빠르다. 하지만, 이 방식은 실제 운영 경로에서 중요한 문제를 설명하지 못한다고 판단했다.

![](https://blog.kakaocdn.net/dna/nad5U/dJMcadamvMY/AAAAAAAAAAAAAAAAAAAAAArhpq83F-I33lrtrlH7c79_YqRJ8IhnujXj8MCGkCHZ/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=ySOz%2FDPwWS0S0cse%2BEq%2BENcTdSQ%3D)

Admin Webhook 테스트로만은 아래와 같은 질문에 대해서 검증할 수 없다.

-   customer가 로그를 정상 수신했는가
-   customer가 churn 대상 로그 3개만을 골라서 admin으로 정확하게 전달했는가
-   customer가 내부 비동기 publish 구간에서 유실이 없는가
-   event\_id가 downstream까지 보존되는가
-   API 성공과 실제 snapshot 저장 성공 사이에 간극이 없는가

아래와 같은 경로의 흐름을 검증하고자 하였다.

![](https://blog.kakaocdn.net/dna/baIJYq/dJMcagdVEal/AAAAAAAAAAAAAAAAAAAAAD_cEPxOxmVfyeBWQqFOjOvsf64GxdLcj_Kt8RHDdXFU/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=BPoLycSAWfxUETwSt2dXmdaCdrI%3D)

* * *

### 2) 테스트 툴은 어떤 것을 선택해야 하는가 JMeter VS K6

부하 테스트 도구를 고를 때 처음부터 **K6**만 염두에 둔 것은 아니었다. **JMeter**, **Locust**, **Gatling** 같은 대안도 충분히 고려하였다. 그런데 이번 테스트는 단순한 HTTP 반복이 아니었다.

아래 같은 로직을 코드로 제어해야 했다.

-   **3만 명 규모의 token pool 순환**
-   **active cohort 크기 조절**
-   **이벤트 타입 분포 50/30/20 유지**
-   **event\_id 생성 전략 통제**
-   **duplicate group 설계**
-   **hot-member hotspot 설계**
-   **테스트 요약 JSON 저장**
-   **중간 milestone 로그 출력**
-   **Java Script의 익숙함**

비교 항목 K6를 선택한 이유

시나리오 표현력

JavaScript 기반이라 cohort, duplicate, token 순환 같은 로직을 코드 명확히 표현

재현성

GUI 기반 설정이 아니라 코드로 남으므로 Git diff와 리뷰가 쉽다

유지보수성

시나리오 수정이 선언형/스크립트 형태로 명확하다

결과 처리

summary JSON, 로그 출력, custom metric 후처리가 쉽다

* * *

## **2\. 테스트 시나리오 작성**

### 1) 왜 테스트 로그의 기준을 DAU 30,000으로 잡았는가

이번 테스트 시나리오를 구성하며, 가장 고민이 되었던 부분은 부하테스트의 규모를 어떻게 가져가야 하는 것이었다. 기존 테스트처럼 무턱대고 100만명 이런 식으로 범위를 잡기에는 근거가 부족했다. 따라서, 우리는 LG U+ 자료 조사를 통하여 우리 서비스 고객 수의 추정치를 도출할 수 있었다.

LG유플러스 공식 웹 서비스는 월 약 1,100만 방문자가 발생하며, 이를 일 기준으로 환산하면 약 30만 명 수준이다. 다만 이 전체 방문자가 모두 우리 서비스의 직접 사용자는 아니다. 통신사 웹에는 요금 납부, 고객센터, 멤버십 조회, 단말기 탐색 등 다양한 목적의 사용자가 함께 유입된다. 이 중 우리 서비스와 직접 연결되는 **요금제 비교·탐색, 현재 요금제 조회, 상담성 CS 사용자**를 전체의 약 30%로 보았다. 이를 적용하면 핵심 타깃 사용자는 **약 9만 명**이다.

여기서 다시, 이 9만 명이 모두 매일 활성 사용자라고 보기는 어렵기 때문에 **하루 활성 비율을 30%로 가정**했다. 따라서 최종적으로

**30만 × 30% × 30% = 약 3만 명** 으로 계산했고, 이를 우리 서비스의 **목표 DAU**로 설정했다.

DAU 3만명에 대해서 현재 진행하고자 하는 로그 테스트의 가정치는 아래와 같이 잡았다.

**항목**

**값**

DAU

30,000

churn 대상 로그 평균

1.5건/일

일일 churn 대상 로그 총량

45,000건

피크 집중 구간

15분

피크 집중 비율

25%

```
45,000 × 25% = 11,250
11,250 / 900초 ≈ 12.5 RPS
```

구성한 전체적인 **5개의 시나리오**와 검증하고자 하는 내용은 아래와 같다.

**시나리오**

**부하**

**시간**

**목적**

Baseline

15 RPS

30분

실제 피크 근처에서 기본 파이프라인 정합성 확인

Peak

50 RPS

15분

여유 버퍼 포함 피크 부하에서 누적 count와 score 재계산 검증

Burst

최대 200 RPS

3분

짧은 시간 집중 부하에서 지연, 유실, 비동기 backlog 탐지

Retry Storm

50 RPS

15분

같은 logical event 재전송 시 중복 반영 방지 검증

Hot Member

100 VU

5분

동일 회원 동시 요청에서 lost update 유무 검증

사용자 로그의 **분포도**는 아래와 같이 잡았다.

**이벤트**

**비율**

**의미**

click\_compare

50%

요금제 비교 행동

click\_change

30%

요금제 변경 시도 행동

click\_penalty

20%

위약금 조회 행동

* * *

### 1\. Baseline Test

**Baseline**은 가장 기본적인 시나리오이다. 목적은 실제 피크와 비슷한 수준에서 **log 파이프라인이 끝까지 연결되었는가**를 먼저 확인하는 것이다.

아래와 같은 사항들이 정합하게 동작하는지를 확인한다.

-   customer가 로그를 안정적으로 받는가
-   admin으로 전달되는가
-   feature snapshot이 갱신이 되는가
-   churn snapshot까지 최종 저장되는가

**입력 조건**

**항목**

**값**

부하

15 RPS

시간

30분

token pool

30,000명

요청 구조

1요청 = 1로그

duplicate

없음

예상 요청 수

27,000건

* * *

### 2\. Peak Test

**Peak Test**는 단순하게 RPS를 올리는 것이 아니라 활성 회원의 일부가 피크 시간대에 churn 로그 관련 행동을 반복하는 상황을 가정한다. 실제 서비스에서는 모든 사용자가 균등하게 한 번씩만 행동하지 않는가. 피크 시간대에는 일부 회원이 **비교, 변경, 위약금 확인**을 반복할 수 있다. 따라서, 이번 테스트는 아래와 같은 사항들이 제대로 동작하는지 확인한다. 

-   한 회원에게 이벤트가 여러 번 들어와도 count 누적이 맞는가
-   count가 누적될수록 feature score가 정상적으로 재계산되는가
-   최종 churn snapshot이 같은 회원에 대해 반복 갱신되어도 정합성이 유지되는가

**입력 조건**

**항목**

**값**

active cohort

10,000명

부하

50 RPS

시간

15분

예상 요청 수

45,000건

인당 평균 요청 수

4.5건

duplicate

없음

* * *

### 3\. Burst Test

**Burst Test**는 정상적인 시스템 구간을 보는 것이 아니라, 짧은 시간의 집중적인 부하를 통해 어디서 정합성이 무너지기 시작하는지를 찾기 위한 테스트이다. 따라서, 이번 테스트는 아래와 같은 사항들이 제대로 동작하는지 확인한다.

-   customer API는 202를 주는데 실제 반영은 누락되지 않는가
-   admin 전달이나 feature 반영에서 유실이 생기지 않는가
-   응답시간이 급격하게 증가하지 않는가

**입력 조건**

항목

값

active cohort

5,000명

시간

3분

부하 패턴

50 -> 200 RPS 1분, 200 RPS 유지 1분, 200 -> 50 RPS 1분

계획 요청 수

27,000건

인당 평균 요청 수

5.4건

* * *

### 4\. Retry Storm Test

**Retry Storm Test**는 일반적인 부하 테스트가 아니라 **멱등성** 테스트이다. 즉, 많은 요청을 보내는 테스트라기ㅣ 보다 **같은 event**가 여러 번 전송되더라도 한 번만 반영되는가가 핵심이다. 실제 서비스는 네트워크 재시도, 클라이언트 중복 전송, 타임아웃 재요청 같은 상황이 발생한다. 이때, 여러 번의 같은 이벤트가 들어오더라도, feature count가 **중복**하여 증가하면 **churn score**는 실제보다 증가한다.

**입력 조건**

**입력**

**조건**

부하

50 RPS

시간

15분

대상 회원 풀

5,000명

예상 총 요청 수

45,000건

duplicate group size

5

duplicates per group

1

예상 고유 이벤트 수

36,000건

예상 duplicate 수

9,000건

* * *

### 5\. Hot Member Test

**Hot Member Test**는 전체 시스템의 처리량보다, 동일 회원에 대해서 동시 요청이 몰릴 때 누락된 로그 데이터가 발생하는가를 테스트한다. 앞선 Baseline, Peak, Burst는 회원 폭이 넓기 때문에 회원 row가 충돌할 가능성이 상대적으로 낮다. 

하지만 실제 운영에서는 특정 회원이 아주 짧은 시간에 여러 행동을 반복할 수 있고, 같은 member\_id에 대해서 count 갱신이 동시에 부딪힐 수 있다.

따라서 아래와 같은 사항들이 제대로 동작하는지 확인한다.

-   같은 회원의 count가 누락되는가
-   마지막 write가 앞선 write를 덮어쓰는가
-   feature\_score가 count 누적을 따라가지 못하는가
-   최종 churn snapshot이 member action count와 어긋나는가

**입력 조건**

**항목**

**값**

hotspot member 수

10명

동시성

100 VU

시간

5분

요청 특성

같은 10명에게 반복적으로 요청 집중

핵심 목적

same-member lost update 검증

다음 포스팅에서는 **Baseline Test**와 **Peak Test**를 진행 과정과 결과에 대해서 포스팅하겠다.

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 38 }

공유하기
