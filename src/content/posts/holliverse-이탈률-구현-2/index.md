---
title: "[Holliverse] 이탈률 구현 (2)"
date: 2026-03-31
legacyUrl: "https://codekim3570.tistory.com/39"
---## **1\. 개요**

이번 포스팅에서는 앞선 포스팅에서 작성한 5가지의 테스트 시나리오 중 **Baseline Test**와 **Peak Test** 시나리오에 대해서 작성하겠다.

[\[Holliverse\] 이탈률 구현 (1) - Test Scenario 작성

1\. 개요Holliverse의 이탈률의 정의와 오케스트레이션 계산 엔진 설계는 아래의 포스팅에서 확인할 수 있다. \[Holliverse\] 이탈률 구현 설계 (1) - 이탈률의 생명주기우리 서비스가 이탈률 시스템을 도

codekim3570.tistory.com](https://codekim3570.tistory.com/entry/Holliverse-%EC%9D%B4%ED%83%88%EB%A5%A0-%EA%B5%AC%ED%98%84-1-Test-Scenario-%EC%9E%91%EC%84%B1)

검증하고자 하는 경로는 아래와 같다.

![](https://blog.kakaocdn.net/dna/KfqCT/dJMcaaSkd7g/AAAAAAAAAAAAAAAAAAAAAAS7kk7zyxCbu0pn4XmV9Ktj5JT_J2oNgwXieDGeECwg/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=vQP%2FploLlFcWL4OCaZUz8OVXKKM%3D)

검증 Sequence Diagram

**고객 로그 수신 → customer 내부 처리 → admin 반영 → feature snapshot → churn snapshot 저장**까지 하나의 플로우를 검증하고자 하였다.

검증 기준은 아래 4가지이다.

**검증 항목**

**확인 사항**

updated\_rows, updated\_members

baseline/peak 대상 회원이 실제 feature snapshot까지 반영됐는가

snapshot\_rows, distinct\_members, duplicate\_gap

snapshot이 회원당 1개로 유지되었는가, 중복 생성은 없었는가

churn\_snapshot\_rows, churn\_members, churn\_feature\_rows

최종 churn snapshot까지 동일 cohort가 도달했는가

churn\_log\_score 또는 feature\_score 분포

이벤트 분포와 누적 count가 실제 점수 계산과 일치하는가

이번 포스팅에서 다루는 2개의 테스트의 목적들은 아래와 같다.

**시나리오**

**부하**

**시간**

**목적**

Baseline

15 RPS

30분

운영 피크 근처에서 기본 파이프라인 정합성 확인

Peak

50 RPS

15분

active cohort의 반복 행동이 누적될 때 count와 score 재계산 검증

* * *

## **2\. Baseline Test: 정상 구간에서의 정합성**

**Baseline**은 가장 기본적인 시나리오다.실제 운영 피크 근처인 **15 RPS** 수준에서, **customer 로그**가 **중간 feature 저장**과 **최종 churn snapshot**까지 유실 없이 이어지는지를 확인하는 것이 테스트의 목적이었다.

이 단계에서 확인하고자 하는 목적은 아래와 같다.

-   customer API는 안정적으로 요청을 받는가
-   모든 대상 회원이 MEMBER\_ACTION\_FEATURE snapshot까지 반영되는가
-   snapshot 중복 생성은 없는가
-   최종 churn\_score\_snapshot / churn\_feature\_score까지 정확히 이어지는가
-   최종 점수 분포가 기대 이벤트 분포와 일치하는가

### 1) Baseline 입력 조건과 HTTP 결과

**항목**

**값**

target

customer /api/v1/customer/user-logs

token pool size

30,000

expected RPS

15

duration

30분

objective

baseline customer-origin end-to-end consistency

실행 결과 요약은 아래와 같았다.

지표

값

sentEvents

27,001

intendedUniqueEvents

27,001

injectedDuplicates

0

uniqueCompareEvents

13,501

uniqueChangeEvents

8,100

uniquePenaltyEvents

5,400

acceptedRate

1.0

failedRate

0.0

p95

19.352ms

이 수치만 보면 Baseline은 이미 매우 성공적으로 보인다. 하지만 이번 테스트에서 중요한 것은 HTTP 성공이 아니라 **실제 DB 반영 정합성**이었다.

* * *

### 2)  Baseline에서 무엇을 측정하려 했는가

Baseline에서는 member별로 거의 **1회원 = 1이벤트** 구조가 유지되기 때문에, DB 검증도 직관적으로 해석할 수 있다.

#### **측정 포인트 1. 실제 대상 회원이 feature snapshot까지 반영됐는가**

: 이 값은 customer log 경로를 통해 들어온 로그가 admin의 **member action feature** 저장까지 도달했는지를 확인한다.

#### **측정 포인트 2. snapshot이 중복 생성되지 않았는가**

: **feature\_snapshot\_store**는 최종 계산의 시작점이기 때문에, 회원당 snapshot이 여러 개 생기면 이후 score 계산도 흔들릴 수 있다.

#### **측정 포인트 3. 최종 churn snapshot까지 cohort가 그대로 이어졌는가**

: 단순 feature 저장이 아니라, 최종 snapshot 저장까지 같은 cardinality가 유지되는지를 확인한다.

#### **측정 포인트 4. 최종 churn\_log\_score 분포가 이벤트 분포와 일치하는가**

: Baseline은 각 회원이 한 번만 행동하도록 설계했기 때문에, 최종 score 분포와 이벤트 분포를 직접 맞춰볼 수 있다.

* * *

### 3) Baseline 검증용 SQL과 실제 결과

#### 1\. feature snapshot까지 실제로 몇 명이 반영됐는지 확인

```
holliverse=> SELECT COUNT(*) AS updated_rows,COUNT(DISTINCT fss.member_id) AS updated_members 
holliverse-> FROM feature_snapshot_store fss 
holliverse-> JOIN baseline_members bm 
holliverse-> ON bm.member_id = fss.member_id 
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE'; 
updated_rows  | updated_members 
--------------+----------------- 
       27001  |           27001 
(1 row)
```

**Baseline Test**에 참여한 **27,001**명의 회원이 모두 **MEMBER\_ACTION\_FEATURE** 단계까지 반영되었다. **customer -> admin -> feature snapshot** 저장 경로까지 실제로 이어졌다는 것을 검증할 수 있다.

* * *

#### 2.snapshot이 회원당 하나씩만 존재하는지 확인

```
holliverse=> SELECT COUNT(*) AS snapshot_rows,COUNT(DISTINCT fss.member_id) AS distinct_members, 
holliverse-> COUNT(*) - COUNT(DISTINCT fss.member_id) AS duplicate_gap 
holliverse-> FROM feature_snapshot_store fss 
holliverse-> JOIN baseline_members bm 
holliverse-> ON bm.member_id = fss.member_id holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE'; 
snapshot_rows  | distinct_members | duplicate_gap
---------------+------------------+--------------- 
        27001  |            27001 |             0 
(1 row)
```

현재 스키마에서는 **(member\_id, feature\_type) UNIQUE**가 실질적으로 동작하는지는 운영 정합성에 매우 중요하다. **duplicate\_gap = 0**이라는 것은, **Baseline 부하**에서는 같은 회원에 대해 snapshot이 여러 개 생성되지 않았다는 뜻이다.

즉 아래와 같은 사항들이 확인되었다.

-   snapshot 중복 생성 없음
-   snapshot cardinality와 대상 회원 수 일치
-   이후 score 계산의 시작 지점이 깨지지 않음

* * *

#### 3\. 최종 churn snapshot까지 얼마나 이어졌는지 확인

```
holliverse=> WITH target AS ( 
holliverse(> SELECT css.member_id, css.snapshot_id, css.revision_id, cfs.churn_log_score 
holliverse(> FROM churn_score_snapshot css 
holliverse(> LEFT JOIN churn_feature_score cfs 
holliverse(> ON cfs.snapshot_id = css.snapshot_id 
holliverse(> JOIN baseline_members bm 
holliverse(> ON bm.member_id = css.member_id 
holliverse(> ) SELECT COUNT(*) AS churn_snapshot_rows,COUNT(DISTINCT member_id) AS churn_members,
holliverse(> COUNT(churn_log_score) AS churn_feature_rows,MIN(revision_id) AS min_revision_id,
holliverse(> MAX(revision_id) AS max_revision_id 
holliverse-> FROM target; 
churn_snapshot_rows  | churn_members | churn_feature_rows | min_revision_id | max_revision_id
---------------------+---------------+--------------------+-----------------+----------------- 
               27001 |         27001 |              27001 |            4890 |           31890 
              (1 row)
```

이 쿼리는 Baseline 대상 회원이 최종 **churn\_score\_snapshot**과 **churn\_feature\_score**까지 그대로 이어졌는지를 확인하기 위한 쿼리이다.

**항목**

**값**

**의미**

churn\_snapshot\_rows

27,001

최종 churn snapshot row 수

churn\_members

27,001

최종 churn snapshot이 생성된 고유 회원 수

churn\_feature\_rows

27,001

churn\_feature\_score row 수

min\_revision\_id

4,890

이번 반영 구간의 최소 revision

max\_revision\_id

31,890

이번 반영 구간의 최대 revision

**31,890 - 4,890 + 1 = 27,001**이라는 점이 포인트이다. **revision cursor**가 회원 수만큼 정확히 증가했다는 의미이다. 즉 **feature** 저장 이후 최종 **churn snapshot** 저장까지도 1:1 **cardinality**가 깨지지 않았다.

* * *

#### 4\. 최종 churn\_log\_score 분포 확인

```
holliverse=> WITH target AS ( holliverse(> SELECT cfs.churn_log_score 
holliverse(> FROM churn_score_snapshot css 
holliverse(> JOIN churn_feature_score cfs 
holliverse(> ON cfs.snapshot_id = css.snapshot_id 
holliverse(> JOIN baseline_members bm 
holliverse(> ON bm.member_id = css.member_id 
holliverse(> ) SELECT churn_log_score, COUNT(*) AS row_count 
holliverse-> FROM target holliverse-> GROUP BY churn_log_score 
holliverse-> ORDER BY churn_log_score; 
churn_log_score  | row_count 
-----------------+----------- 
               5 |      8100 
               8 |     13501 
              25 |      5400 
(3 rows)
```

**Baseline**은 **1회원 = 1이벤트** 구조이기 때문에, **최종 점수 분포**와 **이벤트 분포**를 비교할 수 있다.

**이벤트**

**기대 개수**

**최종 churn\_log\_score**

**실제 row\_count**

click\_change

8,100

5

8,100

click\_compare

13,501

8

13,501

click\_penalty

5,400

25

5,400

즉 **Baseline Test**에서는

-   이벤트 분포
-   feature 반영 수
-   최종 churn score 분포

가 모두 일치했다. 입력 이벤트가 최종 비즈니스 **score 의미와 1:1**로 연결되었다는 것을 의미한다.

즉 **Baseline Test**에서는 customer log의 **E2E 파이프라인이 정상 구간**에서는 **정합하게 동작**한다는 것을 증명하였다.

* * *

## **3\. Peak Test: 1만명의 회원이 평균 4.5회 행동하는 시나리오에서의 정합성 검증**

**Baseline**이 customer log파이프라인의 **기본 동작성**을 검증하는 테스트였다면, **Peak Test**는 그보다 한 단계 더 부하를 거는 테스트였다. 실제 운영 피크 구간에서는 모든 사용자가 한 번씩만 행동하지 않는다. 일부 **active user**는 비교, 변경, 위약금 조회 같은 churn 관련 행동을 반복한다. 따라서 **Peak Test** 핵심은 단순히 RPS를 높이는 것이 아니라, **같은 회원에게 반복 행동이 쌓일 때도 count 누적과 score 재계산이 정합하게 유지되는가**를 검증하는 시나리오였다.

이 단계에서 확인하고자 하는 목적은 아래와 같다.

-   동일 회원의 행동 count가 유실 없이 계속 누적되는가
-   count 누적에 따라 feature\_score가 정상적으로 재계산되는가
-   최종 churn\_score\_snapshot도 이 누적 의미를 그대로 유지하는가

### 1) Peak Test 입력 조건과 HTTP 결과

**항목**

**값**

sentEvents

45,001

intendedUniqueEvents

45,001

injectedDuplicates

0

uniqueCompareEvents

22,501

uniqueChangeEvents

13,500

uniquePenaltyEvents

9,000

acceptedRate

1.0

failedRate

0.0

p95

18.313ms

**customer API는** **Peak 부하 테스트**에서도 겉으로는 안정적으로 동작했다. 하지만 이 테스트에서 중요한 것은 **같은 회원에게 여러 번 쌓인 행동이 실제로 DB에 어떻게 반영되었는가**이다.

* * *

### 2) Peak에서 무엇을 측정하려 했는가

Peak에서는 Baseline과 달리 아래 값들의 측정을 중요하게 보았다.

#### **측정 포인트 1. snapshot row와 distinct member 수**

: 같은 회원의 count가 여러 번 갱신되더라도 snapshot row는 **회원당 하나**로 유지되어야 한다.

-   cohort 1만 명이 실제로 feature snapshot을 모두 가졌는가
-   snapshot 중복 생성은 없는가

#### ****측정 포인트** 2\. raw count 총합**

: 실제 DB에 쌓인 comparison\_cnt, change\_mobile\_cnt, checked\_penalty\_fee\_cnt 합계가 **k6가 보낸 이벤트 총합과 정확히 일치하는가**를 봐야 한다.

-   유실
-   중복 반영
-   count 누적 실패

#### ****측정 포인트** 3\. member별 count 분포**

: Peak는 한 회원에게 이벤트가 여러 번 들어오는 시나리오다. 따라서 단순 총합만 보는 것으로는 부족하고, **몇 명이 4번/5번씩 누적되었는지**를 확인 한다.

#### ****측정 포인트** 4. feature\_score 분포**

: count가 누적되면 score도 band가 바뀐다. 즉 Peak는 **행동 누적 -> score 재계산 테스트** 이다.

* * *

#### 1\. snapshot이 회원당 정확히 하나씩 유지되는지 확인

Peak의 첫 번째 검증은 **snapshot cardinality** 확인이었다.

```
holliverse=> SELECT COUNT(*) AS snapshot_rows, 
holliverse-> COUNT(DISTINCT fss.member_id) AS distinct_members, 
holliverse-> COUNT(*) - COUNT(DISTINCT fss.member_id) AS duplicate_gap 
holliverse-> FROM feature_snapshot_store fss holliverse-> JOIN peak_tokens pt 
holliverse-> ON pt.member_id = fss.member_id 
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE'; 
snapshot_rows  | distinct_members | duplicate_gap 
---------------+------------------+--------------- 
         10000 |            10000 |             0 
(1 row)
```

**Peak Test**는 같은 회원에 대한 count update가 여러 번 일어나는 시나리오이기 때문에, 만약 update 경로가 불안정하면 아래 같은 문제가 생길 수 있다.

-   같은 회원에 MEMBER\_ACTION\_FEATURE snapshot row가 여러 개 생김
-   최종 score 계산이 잘못된 row를 참조함
-   feature/churn snapshot cardinality가 깨짐

**Peak Test부하**에서 feature\_snapshot\_store는 **회원당 1 row 구조를 정확히 유지했다.**

* * *

#### 2\. raw count 총합은 실제 요청 수와 정확히 일치하는지 확인

**raw count** 합계를 확인하는 쿼리를 날렸다.

```
holliverse=> SELECT COALESCE(SUM(maf.comparison_cnt), 0) AS compare_total, 
holliverse-> COALESCE(SUM(maf.change_mobile_cnt), 0) AS change_total, 
holliverse-> COALESCE(SUM(maf.checked_penalty_fee_cnt), 0) AS penalty_total, 
holliverse-> COALESCE(SUM(maf.comparison_cnt + maf.change_mobile_cnt + maf.checked_penalty_fee_cnt), 0) AS total_events 
holliverse-> FROM feature_snapshot_store fss 
holliverse-> JOIN member_action_feature maf 
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id 
holliverse-> JOIN peak_tokens pt 
holliverse-> ON pt.member_id = fss.member_id 
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE'; 
compare_total  | change_total | penalty_total | total_events 
---------------+--------------+---------------+------------- 
         22501 |        13500 |          9000 |        45001 
(1 row)
```

HTTP 레벨에서 45,001건을 보냈다고 해도, 실제 **member\_action\_feature**에 쌓인 합계가 다르면 시스템은 이미 정합성을 잃은 것이다.

-   click\_compare가 실제로 22,501건 반영되었는가
-   click\_change가 실제로 13,500건 반영되었는가
-   click\_penalty가 실제로 9,000건 반영되었는가
-   최종 합계가 실제 sentEvents와 동일한가

결과는 **k6 summary**와 정확히 일치했다.

**항목**

**K6 결과**

**DB 합계**

**차이**

compare

22,501

22,501

0

change

13,500

13,500

0

penalty

9,000

9,000

0

total

45,001

45,001

0

즉 Peak에서는 **실제 보낸 이벤트 수와 DB 누적합이 100% 일치**했다. HTTP 202만 성공한 것이 아니라 실제 feature snapshot까지의 반영 경로에서의 유실은 없었고, 중복 반영 또한 없었다.

이를 통해 **고부하 반복 행동 구간에서도 count 반영은 완전히 정합하다**는 점을 검증했다.

* * *

#### 3\. change\_mobile\_cnt는 실제로 4회/5회 분포로 누적되는지 확인

이제 총합이 맞다는 사실을 확인했으니, 그 다음은 **member별 누적 패턴**을 테스트해봐야 한다.

```
holliverse=> SELECT maf.change_mobile_cnt,COUNT(*) AS member_count
holliverse-> FROM feature_snapshot_store fss 
holliverse-> JOIN member_action_feature maf 
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id 
holliverse-> JOIN peak_tokens pt 
holliverse-> ON pt.member_id = fss.member_id 
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE' 
holliverse-> AND maf.change_mobile_cnt > 0 
holliverse-> GROUP BY maf.change_mobile_cnt 
holliverse-> ORDER BY maf.change_mobile_cnt; 
change_mobile_cnt  | member_count 
-------------------+------------- 
                 4 |         1500 
                 5 |         1500 
(2 rows)
```

총합이 맞더라도 member별로 누적이 잘못될 수 있다. 예를 들어 일부 회원에게 3번, 일부 회원에게 6번 들어가도 총합만 보면 맞아 보일 수 있다. 그래서 Peak에서는 **회원 단위 분포가 설계한 패턴과 일치하는지**를 봤다.

**change\_mobile\_cnt**

**member\_count**

**누적 이벤트 수**

4

1,500

6,000

5

1,500

7,500

합계

3,000

13,500

즉 **click\_change**는 정확히 3,000명의 회원에게 분배되었고, 그중 절반은 4회, 절반은 5회 행동한 패턴으로 누적되었다. **member-level 패턴**이 실제로도 의도대로 재현되었음을 검증했다.

* * *

#### 4\. checked\_penalty\_fee\_cnt도 같은 방식으로 누적되는지 확인

**penalty cohort**도 같은 방식으로 확인했다.

```
holliverse=> SELECT maf.checked_penalty_fee_cnt,COUNT(*) AS member_count 
holliverse-> FROM feature_snapshot_store fss 
holliverse-> JOIN member_action_feature maf 
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id 
holliverse-> JOIN peak_tokens pt 
holliverse-> ON pt.member_id = fss.member_id 
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE' 
holliverse-> AND maf.checked_penalty_fee_cnt > 0 
holliverse-> GROUP BY maf.checked_penalty_fee_cnt 
holliverse-> ORDER BY maf.checked_penalty_fee_cnt; 
checked_penalty_fee_cnt  | member_count 
-------------------------+------------- 
                       4 |        1000 
                       5 |        1000 
(2 rows)
```

checked\_penalty\_fee\_cnt

member\_count

누적 이벤트 수

4

1,000

4,000

5

1,000

5,000

합계

2,000

9,000

**penalty cohort**는 정확히 2,000명의 회원에게 분배되었고, 4회/5회 분포도 의도대로 유지되었다. 이 결과는 change cohort와 함께 읽어야 한다. 두 결과가 동시에 맞았다는 것은**member별 누적 구조까지도 설계대로 재현**되었다는 뜻이다.

* * *

#### 5\. 하나의 회원에 여러 이벤트 타입이 섞이지 않았는지 확인

이번 Peak는 한 회원이 한 이벤트 타입만 반복해서 받도록 설계했다. 즉 **같은 회원에게 compare와 change가 동시에 들어갔다면** 시나리오 가정이 깨진 것이다.

```
holliverse=> SELECT COUNT(*) AS mixed_signal_members
holliverse-> FROM feature_snapshot_store fss
holliverse-> JOIN member_action_feature maf
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id
holliverse-> JOIN peak_tokens pt
holliverse-> ON pt.member_id = fss.member_id
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE' AND (
holliverse(> CASE WHEN maf.comparison_cnt > 0 THEN 1 ELSE 0 END +
holliverse(> CASE WHEN maf.change_mobile_cnt > 0 THEN 1 ELSE 0 END +
holliverse(> CASE WHEN maf.checked_penalty_fee_cnt > 0 THEN 1 ELSE 0 END) > 1;
 mixed_signal_members
---------------------
                   0
(1 row)
```

Peak의 feature\_score를 compare/change/penalty 로그 유형별로 해석하려면, 한 회원에 여러 이벤트 타입이 섞이지 않았다는 전제가 필요한데 **mixed\_signal\_members = 0**를 통해 **회원당 단일 행동 유형 반복 모델이 정확히 유지되었음**을 증명했다.

* * *

#### 6\. 누적 count는 실제 feature\_score 재계산으로 이어졌는지 확인

**raw count**가 맞는다고 끝나는 게 아니라, 그 **누적 count가 실제로 feature\_score band 변경**으로 이어져야 한다.

```
holliverse=> SELECT fss.feature_score,
holliverse-> COUNT(*) AS member_count
holliverse-> FROM feature_snapshot_store fss
holliverse-> JOIN peak_tokens pt
holliverse-> ON pt.member_id = fss.member_id
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE'
holliverse-> GROUP BY fss.feature_score
holliverse-> ORDER BY fss.feature_score;
 feature_score | member_count
---------------+-------------
            15 |        8000
            35 |        2000
(2 rows)
```

이 테스트가 검증하려고 하는 바는 아래와 같다.

-   **행동이 여러 번 쌓이면 score band가 올라가는가**
-   **그 재계산이 member별로 일관되게 적용되는가**
-   **최종 점수가 이벤트 의미와 맞는가**

feature\_score

member\_count

의미

15

8,000

compare/change cohort가 누적 기준 15점 band 진입

35

2,000

penalty cohort가 누적 기준 35점 band 진입

이 테스트의 결과는 **반복 행동 -> 누적 count -> feature score 상향**이라는 비즈니스 규칙이 실제로 동작했다는 뜻이다.

Peak Test에서는 아래를 증명했다.

-   10,000명 active cohort 기준 snapshot row는 회원당 1개로 유지되었다
-   raw count 총합은 sentEvents와 정확히 일치했다
-   member별 count는 설계한 4회/5회 분포로 정합하게 누적되었다
-   mixed signal은 없었다
-   누적 count는 실제 feature\_score band 상향으로 이어졌다

즉 Peak는 **반복 행동이 발생하는시스템 피크 구간에서도, member-level count 누적과 score 계산이 정합하게 유지된다**는 것을 테스트할 수 있었다.

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 39 }

공유하기
