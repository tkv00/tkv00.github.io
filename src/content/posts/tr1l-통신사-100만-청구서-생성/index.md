---
title: "[TR1L] 통신사 100만 청구서 생성"
date: 2026-03-29
legacyUrl: "https://codekim3570.tistory.com/37"
---## **1\. 개요**

해당 포스팅에서는 TR1L에서 통신사 월별 청구서 집계를 수행하는 Job를 처음 설계할 때 어떠한 기준으로 구조를 설계했는지 정리하고자 한다. 이번 글은 이후 성능 개선 결과를 설명하는 글이 아니라, **왜 처음부터 청구서 정산 Job을 단순 계산 배치가 아니라 상태를 가진 배치로 설계했는가**를 기록하는 글에 가깝다.

1) 우리가 왜 Spring Batch를 사용했는가

LG U+ 유레카 종합 프로젝트 주제는 100만 명규모의 청구/정산 데이터를 기반으로 고객별 청구서를 생성하고, 메시지 발송(Email/SMS)을 **중복 없이 안정적으로 처리**였다.

요구사항에 맞게 우리는 다양한 입력 데이터는 요금제, 할인, 약정, 부가서비스, 사용량등 여러 테이블에 흩어져 저장되어 있는 상태였다. 따라서, 수십 개의 쿼리 조인 상황과 집계로 인해서 처리 시간이 길고, 장애 가능성이 존재한다.

따라서, 한 번에 끝내는 처리보다는 

-   **재실행 가능성**
-   **처리 상태 추적**
-   **부분 복구**
-   **중복 계산 처리**

와 같은 처리가 필수적이다. 따라서, Spring Batch는 대규모 배치 처리에서 표준적으로 사용되는 Spring 기반의 프레임워크로 **Step 분리/ Chunk 처리/재시작 기능**을 통해 운영 안정성을 확보할 수 있다고 판단하여 사용하게 되었다.

즉, 정산 Job에서 중요한 것은 **한 번에 빠르게 끝내는 것** 보다 먼저,

-   **이번 실행이 어느 범위를 계산하는가**
-   **입력이 어디서 고정되는가**
-   **작업 상태를 어디에 남기는가**
-   **실패했을 때 어디서부터 다시 시작할 수 있는가**

를 먼저 정하는 일이였다.

* * *

## **2\. 정산 Job을 설계할 때 가장 먼저 고정한 전제**

초기 정산 Job을 설계의 출발점은 단순했다. 바로 멱등성이였다. 같은 배치를 다시 돌려도 항상 같은 입력 범위를 바라보게 만들어야 한다고 봤다. 이러한 전제 조건이 우리 팀에게 중요했던 이유는 월별 청구 배치에서 가장 위험한 상황이 아래의 3가지라고 봤다,

1.  **실행 시간이 조금 달라질 때마다 입력 범위가 달라지는 경우**
2.  **Step 중간 실패로 일부 계산되고 나머지가 실패로 되는 경우**
3.  **재실행 시 이미 끝난 대상을 다시 계산하거나 상태가 꼬이는 경우**

이 문제를 막기 위해 정산 Job의 설계는 아래와 같은 흐름으로 고정했다.

![](https://blog.kakaocdn.net/dna/dbgcYo/dJMcafMQsEU/AAAAAAAAAAAAAAAAAAAAANsU0DeRRTiZVY7224YTcoVLfXGxqGpnajzyWVy1apeO/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=MozrmRrtz3LFEttuVpKw2IlRAbg%3D)

정산 Job flow diagram

![](https://blog.kakaocdn.net/dna/eA4QCy/dJMcagdTS4t/AAAAAAAAAAAAAAAAAAAAAI-wOoTqmIO94mUNEZ2WZ8eNCN__fZCzqwiBLJdZQUOs/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=Za6Sbid%2FsYSFSfeRp9%2BWpzEeyGk%3D)

정산 Job Sequence diagram

1.  먼저 **cutoff**를 받아 이번 실행의 기준 시점을 확정한다. 
2.  그 기준 시점으로부터 정산 대상 월을 계산하고 **billing\_cycle**에 고정한다. 
3.  정산 입력은 **target DB**의 **billing\_targets**로 평탄화해서 고정한다.
4.  실제 처리 상태는 **Mongo**의 **billing\_work**로 따로 관리한다.
5.  계산 결과는 **Mongo**의 **billing\_snapshot**에 저장한다.
6.  마지막에 남은 작업 상태를 보고 **billing\_cycle**을 완료 처리한다.

* * *

## **3\. 설계 1 - billingMonth가 아니라 cutoff를 먼저 고정한다.**

초기 설계에서 가장 먼저 정리한 것은 **잡 파라미터**였다. 겉으로 보기에는 **2026-01** 같은 **billingMonth**를 바로 받으면 단순해 보인다. 하지만 우리는 오히려 그렇게 가면 실행 시점과 정산 범위의 관계가 흐려질 수 있다고 봤다.

실제 운영에서는 배치가 새벽에 스케줄러에서 실행되고, 그 시점은 UTC 기준 시각과 한국 시간 기준 월 경계가 섞이게 된다. 이 상황에서 배치가 직접 **billingMonth**만 받게 되면, 어떤 기준 시각으로 그 월이 결정되었는지 남지 않는다.

그래서 정산 Job은 AWS Event Bridge가 **cutoff**를 ISO-8601 Instant로 넘기고, 잡 내부에서 이를 한국 시간 기준으로 해석해 전월 **billingYearMonth**를 계산하는 구조로 설계했다. 즉, **cutoff**를 설정하여 이번 달 정산의 기준점을 만들었다.

```
@Component
@Slf4j
public class CalculateJobContextInitializer implements JobExecutionListener {
    @Value("${time.zone}")
    private String timeZone;

    private final JdbcTemplate mainJdbcTemplate;

    public CalculateJobContextInitializer(
            @Qualifier("mainJdbcTemplate") JdbcTemplate mainJdbcTemplate
    ) {
        this.mainJdbcTemplate = mainJdbcTemplate;
    }

    public static final String CTX_CUTOFF_AT = "cutoff";
    public static final String CTX_BILLING_YM = "billingYearMonth";
    public static final String CTX_START_DATE = "startDate";
    public static final String CTX_END_DATE = "endDate";
    public static final String CTX_CHANNEL_ORDER = "channelOrder";
    public static final String CTX_MAX_USER_ID = "maxUserId";

    @Override
    public void beforeJob(JobExecution jobExecution) {
        JobParameters params = jobExecution.getJobParameters();

        // 1) cutoff 파라미터 파싱
        String cutoffAtRaw = params.getString("cutoff");
        if (cutoffAtRaw == null || cutoffAtRaw.isBlank()) {
            throw new IllegalArgumentException("JobParameter 'cutoff' is required.");
        }

        // 2) cutoffAt을 Instant로 파싱하고 한국 시간대 변환
        Instant cutoffAt = Instant.parse(cutoffAtRaw);
        ZonedDateTime seoulTime = ZonedDateTime.ofInstant(cutoffAt, ZoneId.of(timeZone));

        // 3) 정산 대상 월 계산
        YearMonth billingYm = YearMonth.from(seoulTime.minusMonths(1));

        // 4) 시작일 및 종료일 계산
        LocalDate startDate = billingYm.atDay(1);  // 해당 월의 1일
        LocalDate endDate = billingYm.atEndOfMonth();         // 해당 월의 마지막 날

        // 5) channelOrder 파싱
        String channelOrder = params.getString("channelOrder");

        // 6) 포맷터 정의
        DateTimeFormatter ymFormat = DateTimeFormatter.ofPattern("yyyy-MM");
        DateTimeFormatter dateFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd");

        // 7) ExecutionContext에 저장
        ExecutionContext ctx = jobExecution.getExecutionContext();
        ctx.putString(CTX_CUTOFF_AT, cutoffAt.toString());
        ctx.putString(CTX_BILLING_YM, billingYm.format(ymFormat));
        ctx.putString(CTX_START_DATE, startDate.format(dateFormat));
        ctx.putString(CTX_END_DATE, endDate.format(dateFormat));
        ctx.put(CTX_CHANNEL_ORDER, channelOrder);
        ctx.putLong(CTX_MAX_USER_ID, fetchMaxUserId());
    }
}
```

* * *

### 1) Step00 Gate를 왜 두었는가

**cutoff**를 한국 시간 기준으로 파싱하는 것만으로는 부족했다.

-   이번 월 정산을 진행할지
-    이미 끝난 월인지
-   재실행이라면 어떤 cutoff\_at을 유지해야 하는지

같이 결정해야 했다. 그래서 **Step00**은 **billing\_cycle**을 게이트 테이블로 사용하도록 설계했다.

-   처음 실행이면 **cutoff\_at**을 기록하고 **RUNNING**으로 만든다.
-   재실행이면 기존 **cutoff\_at**을 그대로 유지한다.
-   이미 **FINISHED**면 바로 **NOOP** 종료한다

```
INSERT INTO billing_cycle (billing_month, status, cutoff_at)
VALUES (:billingMonth, 'RUNNING', :cutoffAt)
ON CONFLICT (billing_month)
DO UPDATE SET
    cutoff_at = billing_cycle.cutoff_at,
    status = CASE
                WHEN billing_cycle.status = 'FINISHED' THEN billing_cycle.status
                ELSE 'RUNNING'
             END
RETURNING billing_month, status, cutoff_at
```

* * *

## **4\. 설계 2 - main DB는 조회 전용으로 두고, 정산 입력은 target DB에 고정한 이유**

**Step00**으로 범위를 고정한 뒤 다음으로 풀어야 할 문제는 입력이었다. 정산 계산에 필요한 데이터는 **사용자 기본 정보**, **요금제**, **데이터 사용량**, **약정**, **군인 할인**, **복지 할인**, **부가서비스**처럼 여러 테이블에 흩어져 있었다.

처음부터 내가 경계한 것은, 이 조인들을 **Step03** 계산 구간까지 그대로 끌고 가는 구조였다. 그렇게 되면 계산 자체보다 '입력을 조립하는 과정'이 더 무거워지고, 실패 시 어디서부터 다시 해야 하는지도 흐려진다.

그래서 **원본 데이터는 main DB에서 읽기만 하고, 정산 입력은 target DB**에 **billing\_targets**라는 물리적 스냅샷으로 한 번 고정한다.핵심 논리는 단순했다.

-   복잡한 JOIN은 한 번만 하고 끝내고 싶었다. 
-   Step03은 계산에 집중하고 싶었다. 
-   재실행 시 원본 테이블 조립부터 다시 흔들리지 않게 하고 싶었다.

### 1) 왜 Target DB를 따로 두었는가

Job에서 **billing\_cycle**과 **billing\_targets**는 main DB가 아니라 **target DB**에 저장하도록 잡았다.

**main DB**는 요금제, 할인혜택, 사용자 정보 같은 원천 데이터를 읽는 곳이고, **target DB**는 이번 월 정산을 위해 만들어진 중간 산출물과 상태를 담는 곳으로 역할을 나누었다.

-   원본 서비스 DB를 정산 중간 산출물로 오염시키지 않기 위해
-   읽기 부하와 쓰기 부하의 성격을 분리하기 위해
-   배치 산출물 스키마를 원본 업무 스키마와 독립적으로 진화시키기 위해 

**MultiJdbcConfig.class**를 통해 2개의 DB 설정을 분리하였고, **MultiTransactionalConfig.class**를 통해 2개의 DB에 대한 트랜잭션 처리를 관리했다.

```
@Configuration
@Slf4j
public class MultiJdbcConfig {
    private static final int FIXED_MAX_POOL_SIZE = 30;
    private static final int FIXED_MIN_IDLE = 10;
    private static final String MAIN_POOL_NAME = "main-pool";
    private static final String TARGET_POOL_NAME = "target-pool";

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource")
    public DataSourceProperties mainDataSourceProperties() {
        ...
    }

    @Bean(name = "mainHikariDataSource")
    public HikariDataSource mainHikariDataSource(
            @Qualifier("mainDataSourceProperties") DataSourceProperties props
    ) {
        ...
    }

    @Bean(name = "mainDataSource")
    @Primary
    public DataSource mainDataSource(
            @Qualifier("mainHikariDataSource") HikariDataSource hikariDataSource,
            org.springframework.beans.factory.ObjectProvider<QueryExecutionListener> queryExecutionListenerProvider
    ) {
        ...
    }

    @Bean(name = "mainJdbcTemplate")
    @Primary
    public JdbcTemplate mainJdbcTemplate(@Qualifier("mainDataSource") DataSource ds) {
        ...
    }

    @Bean(name = "mainNamedJdbcTemplate")
    @Primary
    public NamedParameterJdbcTemplate mainNamedJdbcTemplate(
            @Qualifier("mainDataSource") DataSource ds
    ) {
        ...
    }

    @Bean
    @ConfigurationProperties("app.datasource.target")
    public DataSourceProperties targetDataSourceProperties() {
        ...
    }

    @Bean(name = "targetHikariDataSource")
    public HikariDataSource targetHikariDataSource(
            @Qualifier("targetDataSourceProperties") DataSourceProperties props
    ) {
        ...
    }

    @Bean(name = "targetDataSource")
    public DataSource targetDataSource(
            @Qualifier("targetHikariDataSource") HikariDataSource hikariDataSource,
            org.springframework.beans.factory.ObjectProvider<QueryExecutionListener> queryExecutionListenerProvider
    ) {
        ...
    }

    @Bean(name = "targetJdbcTemplate")
    public JdbcTemplate targetJdbcTemplate(@Qualifier("targetDataSource") DataSource ds) {
        ...
    }

    @Bean(name = "targetNamedJdbcTemplate")
    public NamedParameterJdbcTemplate targetNamedJdbcTemplate(
            @Qualifier("targetDataSource") DataSource ds
    ) {
        ...
    }

    private static void forceFixedPoolConfig(HikariDataSource ds, String poolName) {
        ...
    }
}
```

```
@Configuration
@EnableTransactionManagement
public class MultiTransactionalConfig {
    @Bean(name = "TX-main")
    @Primary
    public PlatformTransactionManager mainTxManager(@Qualifier("mainDataSource")DataSource ds){
        return new DataSourceTransactionManager(ds);
    }

    @Bean(name = "TX-target")
    public PlatformTransactionManager targetTxManager(@Qualifier("targetDataSource")DataSource ds){
        return new DataSourceTransactionManager(ds);
    }
}
```

* * *

### 2) Step01에서 billing\_targets를 만든 이유

**Step01**의 역할은 단순 조회가 아니라, **정산할 유저당 1행의 입력 스냅샷**을 만든다는 데 있었다.  **billing\_targets**는 아래 역할을 가졌다.

![](https://blog.kakaocdn.net/dna/bAzY1A/dJMcabKrQ5H/AAAAAAAAAAAAAAAAAAAAAPwLkyzdK2Zsi0DgZ5mq2aiPdS28aEo09NP-mYkWjcIq/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=r9t1oXh1CCQtjyMyvavaNwMwRcA%3D)

이렇게 한 이유는 **Step03**에서 유저 단위 계산을 할 때 필요한 값을 **한 번의 row 조회로 가져오게 하기 위해서**였다. 물론 초기 설계에서도 이 방식의 단점을 알고 있었다.

-   **컬럼 수가 많아진다.**
-   **스키마 변경 시 같이 바뀌어야 한다.** 
-   **target DB에 별도 저장 비용이 든다.**

그럼에도 이 방식을 택한 이유는, 월 정산에서 더 위험한 것은 컬럼 수가 많은 것보다 **계산 구간에서 조인이 반복되는 구조**라고 봤기 때문이다.

* * *

## **5\. 설계 3 - 정산 대상과 처리 상태를 분리한다.**

**Step01**으로 **billing\_targets**를 만들면 정산에 필요한 입력은 고정된다. 하지만 여기서 바로 계산으로 들어가면 하나가 빠져 있다. 바로 **처리 상태**다.

정산 대상 테이블과 처리 상태 테이블을 하나로 두지 않은 이유는, 두 정보의 역할이 완전히 다르다고 봤기 때문이다.

\- \`billing\_targets\`는 입력 스냅샷이다.

\- \`billing\_work\`는 처리 큐다.

입력 스냅샷은 **무엇을 계산해야 하는가**를 말해 주고, 처리 큐는 **지금 어디까지 처리되었는가**를 말해 준다. 이 둘을 하나로 합치면 재시작, 선점, 진행률 추적이 모두 애매해진다.

그래서 **Step02**에서는 **billing\_targets**를 다시 읽어 MongoDB의 **billing\_work 컬렉션**에 작업 문서를 생성하도록 설계했다.

```
{
  "_id": "2026-01-01:12345",
  "billingMonth": "2026-01-01",
  "userId": 12345,
  "status": "TARGET",
  "attemptCount": 0,
  "createdAt": "...",
  "updatedAt": "..."
}
```

-   같은 월, 같은 사용자 작업은 하나의 문서로 식별
-   중복 실행이 와도 같은 \`\_id를 기준으로 멱등하게 다룰 수 있다.
-   계산 여부는 **TARGET**, **PROCESSING**, **CALCULATED**, **FAILED** 같은 상태로 관리

* * *

### 1) 왜 RDS가 아니라 MongoDB인가?

**청구 계산 결과의 데이터 형태**, **월간 대량 배치의 접근 패턴**, 그리고 **멱등성과 장애 격리 요구사항**을 동시에 만족시키는 저장소가 필요했다.

1\. 정산 Job의 **Step3**에서 다루는 값은 일반적인 운영 트랜잭션 데이터와 성격이 다르다.  
이 구간의 데이터는 사용량, 할인, 부가서비스, 정책 적용 결과가 모두 반영된 **계산 완료 상태의 결과 스냅샷**이다. 즉, 테이블 간 관계를 따라가며 자주 수정하는 데이터라기보다, **특정 시점의 계산 결과를 한 덩어리로 보존해야 하는 데이터**에 가깝다.

이런 데이터를 관계형 모델로 정규화하면 저장 자체는 가능하다. 하지만 정책 구조가 복잡해질수록 결과를 표현하기 위한 테이블 수가 늘어나고, 결과 모델 변경이 곧 스키마 변경과 마이그레이션 부담으로 이어질 가능성이 커진다.

* * *

2\. MongoDB는 이런 결과 스냅샷을 **유저 1명 · 청구 월 1건** 기준으로 저장하기에 적합했다.  
문서 하나가 곧 한 사용자의 월별 청구 결과가 되므로, 데이터 모델 자체가 배치 결과물의 형태와 거의 한다. 이 방식은 모델 표현이 단순하다는 점도 장점이지만, 더 중요한 것은 **저장과 재처리 단위를 명확하게 고정할 수 있다는 점**이었다.

* * *

  
3\. 청구 배치에서는 실패 후 재시도가 반드시 가능해야 하고, 그 과정에서 **중복 청구서 생성이나 중복 저장이 절대 발생하면 안 된다.**  
이때 (billingMonth, userId)를 기준으로 유니크 키를 두고 upsert 기반으로 저장하면, 동일 대상에 대한 재실행 시에도 결과를 안전하게 덮어쓸 수 있다. 즉, MongoDB는 단순 저장소가 아니라 **재시도 가능한 결과 저장 지점**으로 동작할 수 있었다.

* * *

4\. 또 하나 중요했던 이유는 **워크로드 격리**였다.  
월말·월초 배치 구간의 **Postgres**는 이미 정산 대상 조회, 상태 관리, 사용량 계산처럼 **관계형 처리**에 적합한 워크로드를 담당하고 있었다.  
여기에 결과 스냅샷의 대량 write까지 같은 저장소에 태우면, 기존 조인성 워크로드와 스냅샷 저장 워크로드가 한 DB 내부에서 경쟁하게 된다. 이 경우 병목은 단순 성능 저하에 그치지 않고, 특정 시점의 IO 변동이 전체 배치 안정성에 영향을 줄 수 있다.

MongoDB를 별도 Snapshot Store로 분리하면 이 부담을 명확하게 나눌 수 있다. **Postgres**는 **관계형 계산과 상태성 데이터 처리**에 집중하고, **MongoDB**는 **계산이 끝난 결과 문서를 저장**하는 역할만 맡는다.

* * *

## **6\. 설계 4 - 계산 Step03은 claim-check + lease 모델로 설계한다.**

**정산 Job**에서 가장 중요한 단계는 **Step03**이다. 실제 청구 계산이 일어나는 단계이기도 했지만, 동시에 중복 처리와 장애 대응이 가장 까다로운 단계이기도 했다.

우리가 Step03을 설계할 때 가장 중요하게 본 질문은 이것이었다. **'워커가 중간에 죽더라도, 이미 다른 워커가 집어간 작업을 또 계산하지 않으면서, 남은 작업은 다시 회수할 수 있는가?'**

이 질문에 대한 답으로 선택한 방식이 **claim-check + lease** 모델이었다.

### 1) 왜 claim-check가 필요했는가

정산 대상이 100만 건까지 갈 수 있는 상황에서, 한 워커가 모든 대상을 순서대로 처리하는 구조는 현실적이지 않았다. 그렇다고 여러 워커가 동시에 같은 대상을 읽게 만들면 중복 계산 문제가 발생할 수 있다. 그래서 **Step03**은 아래 순서로 움직이도록 설계했다.

1.  **billing\_work**에서 **TARGET** 또는 **lease**가 만료된 **PROCESSING**을 선점한다.
2.  선점된 **user\_id**에 해당하는 **billing\_targets**를 읽어 온다.
3.  도메인 계산을 수행해 청구서 **aggregate**를 만든다.
4.  결과를 **billing\_snapshot**\`에 저장한다.
5.  성공이면 **CALCULATED**, 유저 단위 오류면 **FAILED**로 상태를 갱신한다.

![](https://blog.kakaocdn.net/dna/cfwR6T/dJMb99Z98AX/AAAAAAAAAAAAAAAAAAAAAAelfMOJRayeiC95bFp9wSHVDg8qEuh4LfYBYeVdnU3Q/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=pwT2Ltlv7L%2Fjnn5%2BnrVH9Z4w7%2FU%3D)

Step03 계산 Sequence diagram

![](https://blog.kakaocdn.net/dna/bqQuVC/dJMcacvOuhC/AAAAAAAAAAAAAAAAAAAAAHxX-Po1sNHqiP1JOzYLXs_kt9Dz731xxNIMNB3HxZXs/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=9EJ0oI%2FjgAkguNAluiZnRw3ynYw%3D)

Step03 계산 State Diagram

* * *

### 2) Mongo Claim 방식

Mongo  **findAndModify**를 반복 호출하는 방식으로 선점을 구현했다.

```
    Query q = new Query();
    q.addCriteria(new Criteria().andOperator(
            Criteria.where("billingMonth").is(bm),
            new Criteria().orOperator(
                    Criteria.where("status").is("TARGET"),
                    new Criteria().andOperator(
                            Criteria.where("status").is("PROCESSING"),
                            Criteria.where("leaseUntil").lt(now)
                    )
            )
    ));
    q.with(Sort.by(Sort.Direction.ASC, "userId"));

    Update u = new Update()
            .set("status", "PROCESSING")
            .set("workerId", workerId)
            .set("leaseUntil", leaseUntil)
            .inc("attemptCount", 1);

    Document doc = mongoTemplate.findAndModify(q, u, opt, Document.class, collectionName);
    if (doc == null) break;
}
```

* * *

### 3) lease를 설정한 이유

만약 워커가 작업을 집은 뒤 장애로 죽어 버리면, 그 작업은 영원히 **PROCESSING**에 남을 수 있다. 이걸 막기 위해 일정 시간이 지나면 다른 워커가 다시 회수할 수 있게 했다. 즉, lease는 단순 타임아웃이 아니라

-   장애 난 워커의 미완료 작업을 회수
-   재배치를 가능 
-   멀티 워커 환경에서도 작업이 영구 정지 상태에 빠지지 않게 하는 안전장치

* * *

## **7\. 설계 5 - 청구서 정산 마무리 작업(Step04)**

초기 설계에서 마지막으로 중요했던 것은 **Step04**였다. 여기서는 계산 코드보다도, **월 정산을 언제 완료로 볼 것인가**를 별도 결정으로 두었다. 

개별 사용자 계산이 여러 건 성공했다고 해서 곧바로 그 달 전체 정산이 논리적으로 끝난 것은 아니기 때문에 Step을 분리했다. 예를 들어 아래 상황은 모두 계산 Step만으로는 판단이 어렵다.

-    아직 **TARGET**이 남아 있는가
-   누군가 **PROCESSING** 상태로 잡고 갔는데 lease가 남아 있는가
-   **FAILED**가 있어도 월 정산을 완료로 볼 것인가 

**Step04**는 **billing\_work**의 남은 상태를 다시 보고, 정책에 따라 **billing\_cycle**을 **FINISHED** 혹은 **FAILED**로 마킹하는 역할이다.

이 구조의 장점은 아래와 같다.

-   **계산 성공과 월 정산 완료를 분리해서 볼 수 있다.**
-   **운영자는 "계산이 일부 끝난 상태"와 "월 정산이 최종 완료된 상태"를 구분해 볼 수 있다.**
-   **재시작 시에도 어느 수준까지 끝났는지 경계가 분명해진다.** 

[TR1L

TR1L has 2 repositories available. Follow their code on GitHub.

github.com](https://github.com/Team-TR1L)

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 37 }

공유하기
