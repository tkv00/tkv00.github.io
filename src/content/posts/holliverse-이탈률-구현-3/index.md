---
title: "[Holliverse] 이탈률 구현 (3)"
date: 2026-04-01
legacyUrl: "https://codekim3570.tistory.com/40"
---## **1\. 개요**

이번 포스팅에서는 앞선 포스팅에서 설계한 5가지 테스트 시나리오 중 **Burst Test**를 다룬다.

Baseline과 Peak Test는 각각 다른 질문에 답하는 테스트였다.

-   **Baseline**은 **정상 구간에서 customer-origin E2E 파이프라인이 끝까지 정합하게 동작하는가**
-   **Peak**는 **active 유저가 반복 행동을 할 때 count 누적과 score 재계산이 유지되는가**

[\[Holliverse\] 이탈률 구현 (2) - Baseline•Peak Test

1\. 개요이번 포스팅에서는 앞선 포스팅에서 작성한 5가지의 테스트 시나리오 중 Baseline Test와 Peak Test 시나리오에 대해서 작성하겠다. \[Holliverse\] 이탈률 구현 (1) - Test Scenario 작성1. 개요Holliverse의

codekim3570.tistory.com](https://codekim3570.tistory.com/entry/Holliverse-%EC%9D%B4%ED%83%88%EB%A5%A0-%EA%B5%AC%ED%98%84-1-Baseline%E2%80%A2Peak-Test)

반면 **Burst Test**는 성격이 다르다. 이번 테스트의 핵심은 단순히 RPS를 더 높이는 것이 아니라, **짧은 시간 동안 요청이 급격히 몰릴 때도 customer log 파이프라인과 이탈률 오케스트레이션이 실제 DB 반영 정합성을 유지하는가**를 확인하는 데 있었다.

* * *

## **2\. Burst Test: 목적 / 조건 / 목표**

이번 **Burst** **Test**에서 확인하려고 한 목적은 아래 4가지였다.

-   짧은 시간 동안 최대 200 RPS까지 부하가 올라갈 때 customer API가 실제로 얼마나 많은 요청을 처리하는가
-   HTTP 202 응답 이후 member\_action\_feature raw count 총합이 실제 전송 수와 얼마나 일치하는가
-   feature\_snapshot\_store의 회원당 1 row 구조가 유지되는가
-   최종 churn\_score\_snapshot row 수는 맞더라도, 그것만으로 정합성이 증명되는 것은 아닌지 확인하는가

즉 이번 테스트는 **어디서부터 정합성이 흔들리기 시작하는가**를 찾기 위한 테스트였다.

### 1) Burst Test 입력 조건과 HTTP 결과

**Burst Test**의 입력 조건은 아래와 같다.

**항목**

**값**

대상 API

customer /api/v1/customer/user-logs

tokenPoolSize

5,000

activeCohortSize

5,000

expectedTotalRequests

27,000

expectedAverageEventsPerMember

5.4

peakRps

200

duration

3분

objective

5k active cohort under short burst up to 200 RPS

실행 결과 요약은 아래와 같다.

**지표**

**값**

sentEvents

19,704

intendedUniqueEvents

19,704

injectedDuplicates

0

uniqueCompareEvents

9,854

uniqueChangeEvents

5,910

uniquePenaltyEvents

3,940

acceptedRate

1.0

failedRate

0.0

p95

3567.3706ms

Burst Test는 아래와 같은 2가지의 문제점을 확인할 수 있었다.

-   계획 요청 수는 **27,000건**이었지만 실제 전송은 **19,704건**이었다. (19.704 / 27,000 = 72.89%)
-   acceptedRate = 1.0인데 **p95 = 3567ms**까지 증가했다.

* * *

### 2) Burst Test는 무엇을 측정하려 했는가

**어디서부터 정합성이 흔들리는가를 직접 보여주는 값**을 우선적으로 봐야 했다.

#### 측정 포인트 1. 계획 요청 수 대비 실제 전송 수

: 27,000건을 목표로 설계했는데 실제로 얼마까지 밀어넣었는지를 먼저 봐야 한다.

-   도구가 계획한 burst를 실제로 어느 정도까지 실현했는가
-   응답 지연 때문에 계획한 부하를 다 보내지 못한 것은 아닌가

#### 측정 포인트 2. raw count 총합.

-   유실이 있는가
-   중복 반영이 있는가
-   특정 이벤트 타입만 빠지는가
-   아니면 공통 경로에서 비슷한 비율로 흔들리는가

#### 측정 포인트 3. snapshot row와 distinct member 수

: **Burst Tes**t는 같은 cohort에 짧은 시간 동안 많은 update가 들어가는 상황이다. 이때 단순 count 합계만 보는 것으로는 부족하고, **feature\_snapshot\_store**가 여전히 **회원당 1 row 구조를 유지하는지** 확인해야 한다.

-   cohort 5,000명이 실제로 MEMBER\_ACTION\_FEATURE snapshot을 모두 가졌는가
-   snapshot 중복 생성은 없는가
-   count 누적 과정에서 row cardinality가 깨지지는 않았는가

#### 측정 포인트 4. feature\_score 분포

: **Burst Test**는 count 총합이 맞는지만 보는 테스트가 아니라 행동이 여러 번 누적되면 score도 상위 band로 올라가야 한다.

-   다수의 row가 충분히 누적되어 상위 score band에 도달했는가
-   일부 row는 낮은 band에 남아 있는가
-   count 누적과 score 재계산 사이에 일부 어긋남이 있는가

#### 측정 포인트 5. base\_date 분포와 current run 기준 churn row 수

: **Burst Test**는 짧은 시간에 많은 요청을 보내는 테스트라, 최종 churn\_score\_snapshot을 해석할 때 **현재 날짜 기준 필터가 실제 current run을 잘 대표하는지** 확인해야 한다.

-   current run이 실제 어떤 base\_date로 저장되었는가
-   과거 snapshot과 현재 snapshot이 섞여 있지는 않은가
-   최종 row 수가 5,000명과 일치하는가

* * *

### 3) Burst Test 검증용 SQL과 실제 결과

#### 1\. raw count 총합은 실제 요청 수와 얼마나 일치하는가

HTTP 성공률이 아니라 실제 **member\_action\_feature**에 누적된 count 합계를 확인해야 한다.

```
holliverse=> SELECT COALESCE(SUM(maf.comparison_cnt), 0) AS compare_total,
holliverse-> COALESCE(SUM(maf.change_mobile_cnt), 0) AS change_total,
holliverse-> COALESCE(SUM(maf.checked_penalty_fee_cnt), 0) AS penalty_total,
holliverse-> COALESCE(SUM(maf.comparison_cnt + maf.change_mobile_cnt + 
holliverse-> maf.checked_penalty_fee_cnt), 0) AS total_events
holliverse-> FROM feature_snapshot_store fss
holliverse-> JOIN member_action_feature maf
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id
holliverse-> JOIN burst_members bm
holliverse-> ON bm.member_id = fss.member_id
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE';
 compare_total | change_total | penalty_total | total_events 
---------------+--------------+---------------+--------------
          9569 |         5763 |          3836 |        19168
(1 row)
```

실제 K6 결과 summary와 비교하면 아래와 같다.

유형

K6 결과

DB 합계

차이

compare

9,854

9,569

\-285

change

5,910

5,763

\-147

penalty

3,940

3,836

\-104

total

19,704

19,168

\-536

항목

반영률

compare

9569 / 9854 = 97.11%

change

5763 / 5910 = 97.51%

penalty

3836 / 3940 = 97.36%

전체 유실률을 확인하면 **(19,704 - 19,168) / 19,704 = 0.0272 = 2.72%** 즉, 약 2.7%의 유실이 발생했다. 각 로그 이벤트별로도 공통적인 패턴이 보이는데 거의 비슷한 비율로 유실이 발생했다.

이 부분에서 **customer → admin → feature**로 가는 공통 파이프 라인에서 처리량의 한계, 지연이 발생했을 가능성이 높다고 판단했다.

> 해당 Test를 기점으로 k6 Test를 잠시 중단하고 원인을 파악하고자 하였다. 해당 작업이 어느 지점에서 지연이 발생하는지 파악하기 위해 아래와 같은 **metric**를 api-server에 추가하고 이를 직접 확인하기 위해서 **Grafana**에 해당 부분의 대시보드를 추가했다.

* * *

## **3\. Burst Test: 병목 지점 파악을 위한 지표 구축**

아래와 같은 지표를 추가했다.

지표

의미

필요한 이유

holliverse.executor.active.count{executor="user-log"}

user-log executor에서 실제로 일하고 있는 thread 수

thread pool이 임계치까지 찼는지 확인

holliverse.executor.queue.size{executor="user-log"}

user-log executor queue backlog 크기

비동기 작업이 밀리는지 확인

holliverse.userlog.admin\_log\_feature.duration

customer -> admin 내부 전달 호출 시간

admin 전달이 병목인지 확인

holliverse.userlog.publish

user log publish 결과 카운터

publish 자체는 성공하는지, 어느 단계에서 실패하는지 구분

추가한 지표의 전체적인 측정 플로우는 아래와 같다.

![](https://blog.kakaocdn.net/dna/tf92z/dJMcad2vxXb/AAAAAAAAAAAAAAAAAAAAAGDys069PM50yEC9ey7BpUqCRfo1A9Yjx1MwWGR9jtlb/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=Y%2B7qR%2BqyBqcGU%2B8NdR3ruBz0Lp4%3D)

Grafana Metrics Flow

아래와 같이 **CustomerMetrics.java**에 지표를 위한 helper 클래스를 만들었다.

```
@Component
@Profile("customer")
public class CustomerMetrics {

    private final MeterRegistry meterRegistry;

    public CustomerMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public Timer.Sample startSample() {
        return Timer.start(meterRegistry);
    }

    public void recordRecommendationRequest(String outcome) {
        ...
    }

    public void stopRecommendationDuration(Timer.Sample sample, String outcome, String source) {
        ...
    }

    public void stopRecommendationWaitDuration(Timer.Sample sample, String outcome) {
        ...
    }

    public void recordRecommendationTrigger(String status) {
        ...
    }

    public void stopRecommendationKafkaConsume(Timer.Sample sample, String outcome) {
        ...
    }

    public void recordUserLogBatchSize(int size) {
        DistributionSummary.builder("holliverse.userlog.batch.size")
                .description("User-log batch payload size")
                .baseUnit("requests")
                .register(meterRegistry)
                .record(size);
    }

    public void recordUserLogPublish(String eventName, String result) {
        Counter.builder("holliverse.userlog.publish")
                .description("User-log publish results")
                .tag("event_name", eventName)
                .tag("result", result)
                .register(meterRegistry)
                .increment();
    }

    public void stopAdminLogFeatureDuration(Timer.Sample sample, String result) {
        sample.stop(Timer.builder("holliverse.userlog.admin_log_feature.duration")
                .description("Admin log-feature API call duration")
                .tag("result", result)
                .register(meterRegistry));
    }
}
```

user의 log 처리의 흐름을 count하기 위해 **POST /api/v1/customer/user-logs**의 비즈니스 로직에 아래와 같은 코드를 추가했다.

```
@Async("userLogTaskExecutor")
public void publishBatch(Long memberId, List<UserLogRequest> requests) {
    if (requests == null || requests.isEmpty()) {
        return;
    }
    customerMetrics.recordUserLogBatchSize(requests.size());
    batchSizeSummary.record(requests.size());
    requestCounter("batch").increment();
    for (UserLogRequest request : requests) {
        doPublish(memberId, request);
    }

    requests.forEach(request -> sendAdminTarget(memberId, request));
}

@Async("userLogTaskExecutor")
public void publish(Long memberId, UserLogRequest request) {
    requestCounter("single").increment();
    doPublish(memberId, request);
    sendAdminTarget(memberId, request);
}
```

**publish** 결과 기록

```
private void doPublish(Long memberId, UserLogRequest request) {
    UserLogEventName eventName = UserLogEventName.from(request.eventName());

    long eventId;
    try {
        eventId = decodeTsidToLong(request.tsid());
    } catch (IllegalArgumentException e) {
        customerMetrics.recordUserLogPublish(request.eventName(), "invalid_tsid");
        resultCounter("invalid_tsid").increment();
        throw new CustomerException(CustomerErrorCode.INVALID_USER_LOG_EVENT_ID);
    }

    UserLogPayload payload = new UserLogPayload(
            eventId,
            request.timestamp(),
            request.event(),
            eventName.value(),
            memberId,
            request.eventProperties()
    );

    String json;
    try {
        json = objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException e) {
        customerMetrics.recordUserLogPublish(eventName.value(), "serialization_error");
        resultCounter("serialization_error").increment();
        log.warn("[UserLog] 직렬화 실패 memberId={}", memberId, e);
        return;
    }

    kafkaTemplate.send(topic, String.valueOf(memberId), json)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    customerMetrics.recordUserLogPublish(eventName.value(), "kafka_error");
                    resultCounter("kafka_error").increment();
                    log.warn("[UserLog] Kafka 전송 실패 memberId={} eventName={}",
                            memberId, eventName.value(), ex);
                    return;
                }
                customerMetrics.recordUserLogPublish(eventName.value(), "success");
                resultCounter("kafka_success").increment();
            });
}
```

**request/result counter** 추가 등록

```
private Counter requestCounter(String mode) {
    return requestCounters.computeIfAbsent(mode, ignored ->
            Counter.builder("holliverse.userlog.requests")
                    .description("User log request count by mode")
                    .tag("mode", mode)
                    .register(meterRegistry));
}

private Counter resultCounter(String result) {
    return resultCounters.computeIfAbsent(result, ignored ->
            Counter.builder("holliverse.userlog.publish")
                    .description("User log publish result count")
                    .tag("result", result)
                    .register(meterRegistry));
}
```

해당 지표들을 반영한 **Grafana 대시보드**를 추가하고 **7개의 패널**을 만들었다.

![](https://blog.kakaocdn.net/dna/bVMnz8/dJMcaiCMue6/AAAAAAAAAAAAAAAAAAAAAKyyWYiap_LztyzMTjnZboKBFBVus9DPiIXosXLuXCuM/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=wzB8ugRcQBlZl4sS47W5Io47XxM%3D)

Grafana Dashboard

UserLog Publish Rate by Result

publish 성공/실패 흐름 확인

UserLog Publish Rate by Event

이벤트 타입별 publish 흐름 확인

UserLog Executor Active Threads

executor 포화 여부 확인

UserLog Executor Queue Size

backlog 증가 여부 확인

Admin Log Feature Call Rate by Result

admin 호출 성공/에러 흐름 확인

Admin Log Feature Avg Duration (5m)

평균 admin 호출 시간 확인

Admin Log Feature p95 Duration (5m)

Burst 시 지연이 얼마나 튀는지 확인

* * *

## **4\. Burst Test: 병목 지점 파악**

위의 지표들을 추가한 후 같은 테스트 환경으로 다시 테스트를 진행하였다.

k6 실행 결과는 아래와 같다.

지표

값

sentEvents

9,073

uniqueCompareEvents

4,538

uniqueChangeEvents

2,721

uniquePenaltyEvents

1,814

acceptedRate

1.0

failedRate

0.0

p95

9,789.065ms

실제 **member\_action\_feature**에 누적된 count 합계를 다시 확인했다.

```
holliverse=> SELECT COALESCE(SUM(maf.comparison_cnt), 0) AS compare_total,
holliverse-> COALESCE(SUM(maf.change_mobile_cnt), 0) AS change_total,
holliverse-> COALESCE(SUM(maf.checked_penalty_fee_cnt), 0) AS penalty_total,
holliverse-> COALESCE(SUM(maf.comparison_cnt + maf.change_mobile_cnt + 
holliverse-> maf.checked_penalty_fee_cnt), 0) AS total_events
holliverse-> FROM feature_snapshot_store fss
holliverse-> JOIN member_action_feature maf
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id
holliverse-> JOIN burst_members bm
holliverse-> ON bm.member_id = fss.member_id
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE';
 compare_total | change_total | penalty_total | total_events 
---------------+--------------+---------------+--------------
          3295 |         1996 |          1344 |        6635
(1 row)
```

추가한 **Grafana 대시보드**는 아래와 같은 그래프를 그렸다.

![](https://blog.kakaocdn.net/dna/b2SFzc/dJMcajuUQUO/AAAAAAAAAAAAAAAAAAAAAFSvXs1gJ826-sQeIKcwMbkecY0BagrTetYMpkQayMFE/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=%2BfGMF7ReJ6sRZc6hui%2F%2FDwDM7Hc%3D)

Grafana Dashboard

새로 측정한 사용자 로그의 유실률은 **(9,073 - 6,635) / 9,073 = 0.2687 = 26.87%** 의 유실률을 보였다. 그리고, 이번에는 p95의 값이 **9,789ms**로 증가한 양상을 보였다. 

> Burst 테스트는 실행마다 절대 유실률과 응답시간 수치가 조금씩 달랐지만, compare/change/penalty 전반에서 유사한 손실 패턴이 반복되었고, Grafana 지표 역시 동일하게 executor 포화와 admin 전달 지연을 보여줬다. 따라서 이 문제는 특정 실행의 우연한 수치가 아니라   
> customer → admin → feature 공통 파이프라인의 구조적 병목으로 판단되었다.

각 로그 유형별 유실률은 아래 표와 같았다.

유형

sent event

DB

유실률

compare

4,538

3,295

27.39%

change

2,721

1,996

26.65%

penalty

1,814

1,344

25.91%

total

9,073

6,635

26.87%

유형별 로그들의 유실률은 이전 테스트와 마찬가지로 비슷한 비율을 보였다.

* * *

![](https://blog.kakaocdn.net/dna/b1rIc8/dJMcafzkgQ0/AAAAAAAAAAAAAAAAAAAAAO6lVS370PiBm8v6A9gVyHRjDe8WNcrfVqwgCvicEwb4/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=F5Cjqrc9QBKtQpiCLCShV%2B8y1%2FE%3D)

현재 사용자 로그를 처리하는 첫번째 비즈니스 로직인 **UserLogService.class**이다. 아래와 같은 흐름으로 로그를 처리하고 있다.

> publishBatch()/publish()  
> \-> @Async("userLogTaskExecutor")  
> \-> doPublish() // Kafka publish  
> \-> sendAdminTarget() // Admin internal HTTP

즉, **Kafka Publish**와 **admin internal HTTP** 호출이 같은 비동기 안에서 처리되고 있다. 이러한 구조의 문제점은 아래와 같다.

-   이탈률 대상이 들어오면 user-log executor 안에서 바로 admin HTTP 호출까지 수행.
-   admin이 느려지면 해당 thread는 반환되지 않음.
-   결국 같은 executor를 쓰는 publish 흐름까지 backlog에 갇힘.

![](https://blog.kakaocdn.net/dna/c7gi8q/dJMcabXY35g/AAAAAAAAAAAAAAAAAAAAAM0zBhUZG7B4RwRuhuMycV1MFfzPAgazomnCRu1otfpR/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=DObwepFmTVRgyAOsBHqc03oHbbw%3D)

User Log Publish/sec

우선 **Grafana지표**로 확인할 수 있는 부분에서 **User Log Publish/sec 지표**를 확인한 결과 계속해서 success만 증가하므로 **Kafka Publish**의 병목은 아니였다.

![](https://blog.kakaocdn.net/dna/wM21S/dJMcaiCMxfB/AAAAAAAAAAAAAAAAAAAAAETMwV303RA8Z6hTnl2Xj6OBp6HM9frXPFZnzNagn7eh/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=6omyieyg%2BF7wgwleU8Ga5cdS3js%3D)![](https://blog.kakaocdn.net/dna/B6GVp/dJMcafTCATi/AAAAAAAAAAAAAAAAAAAAAPjneGT2lL2LYxQpKPOuYiJYEnIz7gv_FrbxD8QlF4B5/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=O4NeLeZ63WWsVNxXHPBDfgJadn8%3D)

다음으로 주목할 지표들은 **UserLog** **Executor** **Queue** **Size**와 **UserLog** **Executor** **Active** **Threads**였다. **UserLog** **Executor** **Queue** **Size**지표는 16에 고정된 채로 max thread에 도달하였고, **UserLog** **Executor** **Active** **Threads**는 500이상을 찍으며 최대치에 도달하였다. 

이러한 수치들은 단순히 스레드가 바쁜 것이 아니라, 대기 중인 작업들이 계속해서 밀리고 있다는 의미가 컸다. 따라서, 가능한 작업 처리량보다 유입량이 더 많아 **backlog**가 누적되는 상태의 병목이였다.

현재 코드 상으로 아래와 같은 작업들이 이루어 지며, 해당 작업들의 성격은 완전히 다르다.

작업

성격

Kafka publish

상대적으로 짧고 비동기 기반

admin internal HTTP

네트워크 I/O + 처리시간에 따라 수 초까지 늘어남

따라서, 비교적 짧은 작업 시간과 긴 시간의 작업이 같은 **executor**를 공유하면서 긴 작업이 **thread**를 점유하는 동안 짧은 작업까지 같이 밀린다.

* * *

## **5\. 긴 작업과 짧은 작업 분리**

위에서 언급한 문제들을 해결하기 위해 admin 전달을 **별도의 service**와 **별도의 executor**로 분리했다.

```
/**
 * admin log-feature 별도 executor로 분리
 */
@Service
@Profile("customer")
@RequiredArgsConstructor
public class AdminLogFeatureDispatchService {

    private final AdminLogFeaturesClient adminLogFeaturesClient;

    @Async("adminLogFeatureTaskExecutor")
    public void dispatch(Long memberId, UserLogEventName eventName, String timestamp) {
        adminLogFeaturesClient.sendLogFeature(memberId, eventName, timestamp);
    }
}
```

그리고 **UserLogService**에서는 더 이상 직접 **admin HTTP**를 호출하지 않고, **dispatch service에 위임**하도록 바꿨다.

```
 /**
     * Admin 이벤트 변환.
     */
    private void sendAdminTarget(Long memberId, UserLogRequest request) {
        UserLogEventName eventName = UserLogEventName.from(request.eventName());
        if (!isAdminTarget(eventName)) {
            return;
        }

        adminLogFeatureDispatchService.dispatch(
                memberId,
                eventName,
                request.timestamp()
        );
    }
```

이러한 변경으로 구조는 아래와 같이 바뀌었다.

> UserLogService  
> \-> userLogTaskExecutor  
> \-> Kafka publish AdminLogFeatureDispatchService  
> \-> adminLogFeatureTaskExecutor  
> \-> admin internal HTTP 호출

즉, 이제부터는 

-   **Kafka Publish는 userLogTaskExecutor**
-   **admin 전달은 adminLogFeatureTaskExecutor**

에서 각각 실행된다.

이러한 구조 변경으로 Grafana 지표는 2가지**(executor="user-log", executor="admin-log-server")**로 분리해서 볼 수 있다.

* * *

## **6\. 지표 분리와 재측정, 그리고 다시 수정**

### 1) 재측정

긴 작업과 짧은 작업을 executor 수준에서 분리하고 다시 **Burst Test**를 수행했다.

수행한 k6의 결과는 아래와 같다.

항목

값

sentEvents

10,808

intendedUniqueEvents

10,808

uniqueCompareEvents

5,405

uniqueChangeEvents

3,243

uniquePenaltyEvents

2,160

acceptedRate

1.0

failedRate

0.0

http p95

7,835.689ms

지표

분리 전

분리 후

개선율

DB total\_events

6,635

9,377

+41.33%

유실률

26.87%

13.24%

\-50.72%

http p95

9,789.065ms

7,835.689ms

\-19.95%

sentEvents

9,073

10,808

+19.12%

실제 **member\_action\_feature**에 누적된 count 합계를 다시 확인했다.

```
holliverse=> SELECT COALESCE(SUM(maf.comparison_cnt), 0) AS compare_total,
holliverse-> COALESCE(SUM(maf.change_mobile_cnt), 0) AS change_total,
holliverse-> COALESCE(SUM(maf.checked_penalty_fee_cnt), 0) AS penalty_total,
holliverse-> COALESCE(SUM(maf.comparison_cnt + maf.change_mobile_cnt + 
holliverse-> maf.checked_penalty_fee_cnt), 0) AS total_events
holliverse-> FROM feature_snapshot_store fss
holliverse-> JOIN member_action_feature maf
holliverse-> ON maf.feature_snapshot_id = fss.feature_snapshot_id
holliverse-> JOIN burst_members bm
holliverse-> ON bm.member_id = fss.member_id
holliverse-> WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE';
 compare_total | change_total | penalty_total | total_events 
---------------+--------------+---------------+--------------
          4684 |         2834 |          1859 |        9377
(1 row)
```

각 로그 유형별 유실률은 아래 표와 같았다.

유형

K6 결과

DB

유실률

compare

5,405

4,684

86.66%

change

3,243

2,834

87.39%

penalty

2,160

1,859

86.06%

total

10,808

9,377

13.24%

즉, 이번 측정에도 특정 이벤트 타입의 문제가 아닌 공통 파이프라인 전체에서 비슷한 비율로 손실이 발생했다.

![](https://blog.kakaocdn.net/dna/3LMez/dJMcacP7Fbx/AAAAAAAAAAAAAAAAAAAAAOwoPZX-Q95tSjLsXW1GwPXYwlTZQ5JtsI0x7VtKA82x/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=NhpJq2XWfhvNA1pv2Dz8avg4XGk%3D)

이번에는 추가된 지표를 포함하여 Grafana 그래프를 관측했다.

#### **executor active threads**

스크린샷 기준으로 두 executor 모두 거의 같은 패턴을 보였다.

executor

관측값

user-log

빠르게 16에 도달한 뒤 유지

admin-log-feature

빠르게 16에 도달한 뒤 유지

즉 publish 경로와 admin 전달 경로가 모두 **max thread 수까지 포화**되었다.

#### **executor queue size**

queue도 마찬가지였다.

executor

관측값

user-log

약 500 수준까지 빠르게 증가 후 유지

admin-log-feature

약 500 수준까지 빠르게 증가 후 유지

즉 분리 이후에도 두 executor 모두 **queue가 거의 가득 찬 상태**로 유지됐다.

#### **admin 전달 지연**

admin internal 호출 지연도 여전히 높았다.

지표

관측값

Admin Log Feature Duration p95

약 5.2 ~ 5.6초

Admin Log Feature Max Duration

약 5.7 ~ 6.3초

즉 admin internal 호출 자체는 여전히 **수 초 단위의 긴 작업**이었다.

반면, **User Log Publish/sec**는 success 기준으로 계속 증가하였다.

* * *

### 2) 왜 병목이 해결되지 않았는가

executor를 분리했는데도 병목이 완전히 해결되지 않은 이유는 2가지였다.

#### **1\. admin 전달 자체가 긴 작업이었다.**

```
@Service
@Profile("customer")
@RequiredArgsConstructor
public class AdminLogFeatureDispatchService {

    private final AdminLogFeaturesClient adminLogFeaturesClient;

    @Async("adminLogFeatureTaskExecutor")
    public void dispatch(Long memberId, UserLogEventName eventName, String timestamp) {
        adminLogFeaturesClient.sendLogFeature(memberId, eventName, timestamp);
    }
}
```

니는 **UserLogService.java**에서 direct HTTP 호출 대신 해당 service 계층이 위임하도록 변경했지만, 분리된 admin 작업 자체가 여전히 수 초가 걸리는 긴 작업이었기 때문에, **admin-log-feature excutor**도 금방 부하상태가 되었다.

#### **2\. CallerRunsPolicy 때문에 부하 순간 다시 executor가 결합되었다.**

더 중요한 지점은 **executor**의 설정 부분이다. **CustomerRuntimeInfraConfiguration.java**에서 **adminLogFeatureTaskExecutor**는 아래처럼 정의되어 있다.

```
@Bean(name = "adminLogFeatureTaskExecutor")
public ThreadPoolTaskExecutor adminLogFeatureTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(16);
    executor.setQueueCapacity(512);
    executor.setThreadNamePrefix("admin-log-feature-");
    executor.setRejectedExecutionHandler(
    		new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
    executor.initialize();
    return executor;
}
```

이러한 정책은 **executor**가 가득 찼을 때 reject된 작업을 버리지 않고, 작업을 넘긴 caller thread가 직접 실행하게 한다. 

즉, 아래와 같은 작업들이 발생하여 결국 느린 admin HTTP 호출이 **user-log executor thread**를 점유한다.

> userLogTaskExecutor thread  
> \-> adminLogFeatureDispatchService.dispatch() 호출  
> \-> adminLogFeatureTaskExecutor queue/full  
> \-> CallerRunsPolicy 동작  
> \-> userLogTaskExecutor thread가 직접 admin HTTP 호출 수행

이러한 흐름은 Grafana에서도 나타났다.

![](https://blog.kakaocdn.net/dna/bbMheh/dJMcaflMz3A/AAAAAAAAAAAAAAAAAAAAAITqThvaWjd3U2gB64fo7Sv1otQ2ZW5HQq2y4ocUhcHH/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=frl6Zo7pJkCWJ0HTLI6OhUrR2VM%3D)![](https://blog.kakaocdn.net/dna/eHsffZ/dJMcafF5yvR/AAAAAAAAAAAAAAAAAAAAAHKu2kF9gdEkaYp7SWjJ0EjKi6zVpJgCgGBxYdcr_oDQ/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=nzuMG7NfKCGQqOkY3RLxfz%2Bptwo%3D)

왼-Executor Queue Size / 오-Executor Active Threads

* * *

### 3) CallerRunPolicy와 AbortPolicy는 무엇이 다른가

#### CallerRunPolicy

: reject된 작업을 caller thread가 직접 실행한다.

> 장점  
> \- 작업을 버리지 않는다.  
> \- queue가 가득 차도 언젠가는 실행된다.  
>   
> 단점  
> \- admin dispatch executor가 가득 차면 느린 작업인 admin HTTP 호출을 user-log caller thread가 작업한다.  
> \- kafka publish 경로가 오염된다.

#### AbortPolicy

: queue가 가득 차면 작업을 즉시 reject한다.

> 장점  
> \- caller thread가 긴 작업을 대신 수행하지 않는다.  
> \- kafka publish 경로를 보호할 수 있다.  
> \- reject 자체를 별도의 metric으로 관측 가능하다.  
>   
> 단점  
> \- reject된 시점에서는 admin 전달에는 실패한다 = 사용자 로그 feature 유실율은 동일하다  
> \- admin HTTP 성공률 자체는 낮아질 수 있다.

* * *

### 4) 나는 무엇을 선택했는가

우선은 이러한 파이프라인 오염을 해결하기 위해 **AbortPolicy**를 채택하였다.

```
@Bean(name = "adminLogFeatureTaskExecutor")
public ThreadPoolTaskExecutor adminLogFeatureTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(16);
    executor.setQueueCapacity(512);
    executor.setThreadNamePrefix("admin-log-feature-");
    executor.setRejectedExecutionHandler(
    	new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    executor.initialize();
    return executor;
}
```

부하 순간 아래와 같은 흐름으로 변경된다.

> userLogTaskExecutor thread  
> \-> adminLogFeatureDispatchService.dispatch() 호출  
> \-> adminLogFeatureTaskExecutor queue/full  
> \-> AbortPolicy 동작  
> \-> TaskRejectedException 발생 -  
> \> user-log thread는 admin HTTP를 대신 수행하지 않음

하지만, **reject**된 작업에 대해서 추적할 수 있어야 하기 때문에 아래와 같은 **metric**를 추가했하고, **dispatch enqueue의 성공/실패**를 구분하기 위해 아래와 같이 코드를 수정했다.

```
public void recordAdminLogFeatureDispatch(String result) {
    Counter.builder("holliverse.userlog.admin_log_feature.dispatch")
            .description("Admin log-feature async dispatch enqueue results")
            .tag("result", result)
            .register(meterRegistry)
            .increment();
}
```

```
    /**
     * Admin 이벤트 변환.
     */
    private void sendAdminTarget(Long memberId, UserLogRequest request) {
        UserLogEventName eventName = UserLogEventName.from(request.eventName());
        if (!isAdminTarget(eventName)) {
            return;
        }

        try {
            adminLogFeatureDispatchService.dispatch(
                    memberId,
                    eventName,
                    request.timestamp()
            );
            customerMetrics.recordAdminLogFeatureDispatch("enqueued");
        } catch (TaskRejectedException e) {
            log.warn("[UserLog] Admin log-feature dispatch rejected. memberId={},
            	eventName={}", memberId, eventName);
            customerMetrics.recordAdminLogFeatureDispatch("rejected");
        }
    }
```

* * *

### 5) 재재측정

 executor를 AbortPolicy로 변경하고 다시 **Burst Test**를 수행했다.

수행한 k6의 결과는 아래와 같다.

항목

값

sentEvents

23,175

intendedUniqueEvents

23,175

uniqueCompareEvents

1,1590

uniqueChangeEvents

6,951

uniquePenaltyEvents

4,634

acceptedRate

1.0

failedRate

0.0

http p95

2,737.8485ms

지표

CallerRunsPolicy 단계 

AbortPolicy 단계

변화

DB total\_events

9,377

11,441

+22.01%

유실률

13.24%

50.64%

+37.40%p

http p95

7,835.689ms

2,737.8485ms

\-65.06%

sentEvents

10,808

23,175

+114.42%

아래와 같은 2가지의 큰 변화가 존재했다.

-   request path와 publish 처리량이 크게 개선됨.
-   최종 DB에 반영된 유실률은 더 증가함.

즉, Abort Policy는 응답 경로를 보호하여 처리 속도는 빨라졌지만, downstream 전달 보장은 하지 못했다. 아래의 새로 추가한 **Grafana reject 반영 지표 그래프**를 보면 **equeued된 로그**들보다는 **reject된 로그**들이 더 많았음을 알 수 있다.

![](https://blog.kakaocdn.net/dna/bAOcyC/dJMcahKF9ao/AAAAAAAAAAAAAAAAAAAAAFyLNHY-vcrsKQr5zmpTfxjKTRiDBKFDP6zV005MKVhY/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=e9j0KmAlglpXnlOq985MmOO%2FsZY%3D)

Admin Log Feature Dispatch Enqueue Results

실제 **member\_action\_feature**에 누적된 count 합계를 다시 확인했다.

```
holliverse=> SELECT COALESCE(SUM(maf.comparison_cnt), 0) AS compare_total,COALESCE(SUM(maf.change_mobile_cnt), 0) 
holliverse-> AS change_total, COALESCE(SUM(maf.checked_penalty_fee_cnt), 0) AS penalty_total,
holliverse-> COALESCE(SUM(maf.comparison_cnt + maf.change_mobile_cnt + maf.checked_penalty_fee_cnt), 0) 
holliverse-> AS total_events FROM feature_snapshot_store fss
holliverse-> JOIN member_action_feature maf ON maf.feature_snapshot_id = fss.feature_snapshot_id 
holliverse-> JOIN burst_members bm ON bm.member_id = fss.member_id WHERE fss.feature_type = 'MEMBER_ACTION_FEATURE';
 compare_total | change_total | penalty_total | total_events 
---------------+--------------+---------------+--------------
          5623 |         3467 |          2351 |        11441
(1 row)
```

각 로그 유형별 유실률은 아래 표와 같았다.

유형

k6

DB

반영률

compare

11,590

5,623

48.52%

change

6,951

3,467

49.88%

penalty

4,634

2,351

50.73%

total

23,175

11,441

49.36%

이전 앞선 Burst 측정과 동일한 패턴을 보였다.

* * *

## **7\. 마무리 및 회고**

이번 테스팅을 통해 확실한 trade-off를 경험할 수 있었다. 글을 읽는 모든 독자(?)들은 모두 이런 생각이 들 것이다. 

> 아, 이거 속도는 확실하게 올라갔으니깐 reject된 로그들만 컨트롤하면 되는거 아니야???

맞다. 나도 같은 생각이고 **reject**된 로그를 이제 어떻게 컨트롤할 것인지는 다음 포스팅에서 다루겠다.

[one-year-gap

one-year-gap has 10 repositories available. Follow their code on GitHub.

github.com](https://github.com/orgs/one-year-gap/repositories)

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 40 }

공유하기
