---
title: "[Holliverse] 예외처리 고도화 - 인증 보호율 0% → 100%"
date: 2026-03-27
project: Holliverse
tags: ["예외처리"]
legacyUrl: "https://codekim3570.tistory.com/32"
---

2026년 3월 20일 (금)에 진행한 융합 프로젝트 경진 대회에서 본선 3팀 중 하나로 진출하게 되었다. 그 과정에서 서비스 전반을 다시 점검해보니, 그동안 계속 문제로 남아 있던 예외처리 부족을 이제는 제대로 개선해야겠다는 생각이 들었다.

## **1\. 우리 서비스 예외처리의 문제점**

기능 개발이 어느 정도 마무리된 시점에서 돌아보니, 우리 서비스는 겉으로는 **GlobalExceptionHandler**도 있고 공통 에러 응답 포맷도 갖추고 있어서 예외처리가 어느 정도 정리된 것처럼 보였다.

하지만 실제로 프론트엔드와 연동해보면서 흔들리는 지점이 보였다. 충분히 제어 가능한 요청 실패인데도 500 Internal Server Error가 자주 내려왔고, 에러 메시지는 여기저기 흩어져 하드코딩되어 있었으며, 처리 방식도 위치마다 제각각이었다. 결국 인증, 입력 검증, 비즈니스 규칙 위반, 비동기 처리 실패, 인프라 예외가 서로 다른 기준으로 다뤄지고 있었고, 이 때문에 API 실패 응답이 일관되지 않게 내려가는 구조적인 문제가 드러났다.

### 1) 인증 예외 처리

가장 먼저 눈에 들어온 것은 인증 예외 처리였다. 인증이 필요한 **customer** 쪽 엔드포인트는 **@AuthenticationPrincipal** 사용 기준으로 12개였지만, 테스트 편의 상 모든 엔드포인트를 허가하면서, 실제 Spring Security 설정상 보호되고 있는 엔드포인트는 0개였다. 모든 요청이 permitAll()로 열려 있었기 때문에 인증 실패는 프레임워크 차원에서 처리되지 않았고, 각 컨트롤러가 직접 알아서 처리하고 있었다.

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                               LoginFilter loginFilter,
                                               CustomOAuth2UserService customOAuth2UserService,
                                               SocialFailureHandler socialFailureHandler,
                                               SocialSuccessHandler socialSuccessHandler) throws Exception {
    return http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    .anyRequest().permitAll()
            )
            .oauth2Login(oauth2 -> oauth2
                    .userInfoEndpoint(userInfo -> userInfo.userService(customOAuth2UserService))
                    .failureHandler(socialFailureHandler)
                    .successHandler(socialSuccessHandler)
            )
            .addFilterAt(loginFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
}
```

일부 컨트롤러는 **customUserDetails**에 대한 null 체크 없이 바로 getMemberId()를 호출하고 있었고, 그 결과 인증이 누락된 요청이 401이 아니라 **NullPointerException**으로 인해 500으로 잘못 분류될 가능성이 있었다.

```java
@GetMapping("/me")
public ApiResponse<CustomerProfileResponse> getMyProfile(
        @AuthenticationPrincipal CustomUserDetails customUserDetails) {

    CustomerProfileResult result = getCustomerProfileUseCase.execute(customUserDetails.getMemberId());
    CustomerProfileResponse response = customerProfileResponseMapper.toResponse(result);
    return new ApiResponse<>("success", response, LocalDateTime.now());
}
```

실제로 이런 위험이 있는 엔드포인트가 6개나 존재했다. 반대로 어떤 컨트롤러는 직접 ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 필요합니다.")를 던지고 있었다.

```java
public ApiResponse<RecommendationResponse> getRecommendations(
        @AuthenticationPrincipal CustomUserDetails customUserDetails) {
    if (customUserDetails == null) {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 필요합니다.");
    }
    RecommendationResult result = recommendationService.getRecommendations(customUserDetails.getMemberId());
    return new ApiResponse<>("success", recommendationResponseMapper.toResponse(result), LocalDateTime.now());
}
```

같은 “인증 실패”라는 상황인데도 어떤 API는 401을 반환하고, 어떤 API는 500을 반환할 수 있는 상태였다. 이건 단순히 코드 스타일이 다른 문제가 아니라, API 신뢰성과 운영 안정성을 흔드는 문제였다.

### 2) Request용 DTO 제약조건의 부족

입력 검증 계층도 일관되지 않았다. **@RequestBody**를 받는 엔드포인트는 총 10개였지만, 이 중 @Valid가 적용된 엔드포인트는 6개뿐이었다. 즉 검증 적용률은 60% 수준이었고, 나머지 40%는 잘못된 요청 본문이 컨트롤러를 통과해 서비스 계층까지 전달될 수 있는 구조였다. 문제는 단순히 @Valid가 빠져 있다는 점만이 아니었다. 일부 DTO는 필수값, 길이, 형식에 대한 제약조건 자체가 정의되어 있지 않아, 어떤 입력이 유효한 요청인지 코드 수준에서 명확히 드러나지 않았다.

예를 들어 상담 생성 요청 DTO인 **CreateCounselDto**.java 는 title, content를 받지만 아무 제약조건이 없다.

```java
public record CreateCounselDto(
        String title,
        String content
) {
}
```

이를 사용하는 CounselController.java 역시 @Valid 없이 body를 받고 있었다.

```java
@PostMapping("/counsel")
public ApiResponse<Long> createCounsel(
        @AuthenticationPrincipal CustomUserDetails customUserDetails,
        @RequestBody CreateCounselDto request
){
    Long counselId = useCase.execute(customUserDetails.getMemberId(), request.title(), request.content());
    return new ApiResponse<>("created", counselId, LocalDateTime.now());
}
```

요금제 변경 요청도 비슷했다. ChangeProductRequest.java 의 targetProductId는 사실상 필수값이지만 @NotNull조차 없었다.

```java
public record ChangeProductRequest(
        Long targetProductId
) {}
```

컨트롤러인 SubscriptionController.java 에서도 그대로 사용되고 있었다.

```java
@PostMapping("/change")
public ApiResponse<ChangeProductResponse> changePlan(
        @AuthenticationPrincipal CustomUserDetails customUserDetails,
        @RequestBody ChangeProductRequest request) {
    if (customUserDetails == null) {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 필요합니다.");
    }
    Long memberId = customUserDetails.getMemberId();
    ChangeProductResult result = changeProductUseCase.execute(memberId, request.targetProductId());
    ...
}
```

내부 webhook 요청도 마찬가지였다. LogFeatureWebhookRequest.java 는 eventType, memberId, timeStamp를 받지만 어떤 필드도 validation으로 보호되지 않았다.

```java
public record LogFeatureWebhookRequest(
        String eventType,
        Long memberId,
        String timeStamp
) {
}
```

문제는 이런 구조에서는 잘못된 입력이 '입력 검증 실패'로 즉시 정리되지 않고, 더 깊은 서비스 계층이나 저장 단계에서 늦게 실패한다는 점이다. 그 결과 원인이 입력값 자체였는지, 비즈니스 로직이었는지, 인프라 문제였는지를 응답 계층에서 명확하게 구분하기 어려워졌다. 결국 DTO는 단순한 데이터 전달 객체가 아니라, API 입력 계약을 보장하는 1차 방어선이어야 한다는 점을 다시 정리할 필요가 있었다.

### 3) 데이터베이스의 제약조건 충돌의 일반화

 migration 기준으로 **unique constraint**는 총 11개 존재했지만, 전역 예외 처리기에서 명시적으로 식별해서 도메인 에러로 변환하는 것은 이메일 중복과 전화번호 중복, 단 2개뿐이었다. 수치로 보면 명시 매핑률은 18.2%에 불과했다. 나머지 9개 constraint 충돌은 모두 일반적인 CONFLICT로 뭉뚱그려 처리되고 있었기 때문에, 실제로는 상품 코드 충돌인지, 토큰 해시 충돌인지, 카테고리 이름 충돌인지 API 응답만으로 구분하기 어려웠다.

번호 Constraint 이름 위치 대상

| 1 | uk_address_unique | V1__init.sql | address(province, city, street_address) |
| --- | --- | --- | --- |
| 2 | uk_member_email | V1__init.sql | member(email) |
| 3 | uk_member_phone | V1__init.sql | member(phone) |
| 4 | uk_product_code | V1__init.sql | product(product_code) |
| 5 | uk_refresh_token_hash | V2__create_refresh_token_table.sql | refresh_token(token_hash) |
| 6 | uk_category_group_category_name | V6__create_support_case_schema.sql | category_group(category_name) |
| 7 | uk_business_keyword_code | V8__create_nlp_analysis_tables.sql | business_keyword(keyword_code) |
| 8 | uk_billing_member_month | V13__add_family_group_and_billing.sql | billing(member_id, yyyymm) |
| 9 | uk_case_id | V14__modify_consultation_analysis_columns.sql | consultation_analysis(case_id) |
| 10 | uk_case_version | V21__add_athena_log_and_modify_analysis_outbox.sql | consultation_analysis(case_id, analyzer_version) |
| 11 | uk_persona_type_name_version | V24__add_persona_type.sql | persona_type(character_name, version) |

### 4) 예외 타입의 혼재

예외 타입 자체가 혼재되어 있다는 점도 구조적인 문제였다. 코드 전체를 기준으로 보면 CustomException은 43회 사용되고 있었지만, 동시에 IllegalArgumentException은 12회, IllegalStateException은 21회, ResponseStatusException은 8회 사용되고 있었다. 문제는 이 숫자 자체보다, 서로 다른 의미를 가진 실패들이 일관된 기준 없이 섞여 있다는 점이다.

어떤 비즈니스 규칙 위반은 CustomException으로 처리되고, 어떤 것은 IllegalArgumentException으로 처리되며, 어떤 것은 컨트롤러에서 직접 ResponseStatusException으로 던지고 있었다. 같은 종류의 실패라도 어디서 어떤 타입으로 던졌는지에 따라 응답 포맷과 에러 코드가 달라질 수밖에 없는 구조였다. 예외를 중앙에서 처리하고 있다고는 하지만, 정작 중앙으로 올라오는 예외의 의미 체계가 통일되어 있지 않았다.

예외 타입 현재 개수 현재 의미 문제점 목표

| CustomException | 43 | 도메인/비즈니스 예외 | 표준 역할이지만 단독 체계 아님 | 도메인 예외의 표준 기반 |
| --- | --- | --- | --- | --- |
| IllegalArgumentException | 12 | 입력 오류/규칙 위반 혼재 | 400으로 뭉개짐 | 도메인 예외 또는 validation으로 흡수 |
| IllegalStateException | 21 | 인프라/불변식/개발자 실수 혼재 | 500으로 뭉개짐 | 시스템 예외 전용으로 축소 |
| ResponseStatusException | 8 | 컨트롤러 수동 HTTP 예외 | 응답 계약 불일치 | 비즈니스 경로 사용 0건 |
| 총 혼재 예외 수 | 84 | 의미 체계 혼합 | 실패 분류 불명확 | 역할별 명확 분리 |

* * *

## **2\. 목표와 방향성**

1번에서 우리 서비스의 다양한 문제점을 파악했으므로 이제 어떤 방향으로 문제점을 개선해나가고, 목표치를 수치로 잡아보도록 하겠다.

### 1) 개선 목표

이번 개선의 목표는 단순히 예외를 공통 처리하는 수준이 아니라, API에서 발생하는 실패를 입력 오류, 인증/인가 오류, 도메인 규칙 위반, 인프라 장애로 명확히 분리하고, 이를 일관된 응답 계약으로 노출할 수 있도록 만드는 것이었다. 기존 구조에서는 같은 잘못된 요청이라도 어떤 엔드포인트에서는 validation 예외로 처리되고, 어떤 경우에는 IllegalArgumentException, 어떤 경우에는 generic 500으로 이어졌다. 따라서 가장 먼저 세운 목표는 “실패 원인의 의미를 응답 계층에서 잃지 않는 구조”를 만드는 것이었다.

정량적인 목표도 함께 정의했다. 인증이 필요한 엔드포인트는 Security 레벨에서 모두 보호하도록 바꿔 인증 누락으로 인한 500 오분류 가능성을 제거하고, @RequestBody를 받는 엔드포인트는 100% @Valid와 DTO 제약조건을 적용해 입력 검증 책임을 컨트롤러 경계로 끌어올리는 것을 목표로 삼았다. 또한 DB unique constraint는 최종 스키마 기준 활성 항목 전부를 의미 있는 에러 코드로 매핑하고, 비즈니스 예외와 시스템 예외를 도메인 단위로 구분해 응답 체계를 통일하는 것을 개선 기준으로 잡았다.

### 2) 개선 방향

개선 방향은 '중앙 통제 + 도메인 분할'로 잡았다. 응답 포맷 생성, 로깅, 공통 예외 직렬화는 중앙에서 통제하되, 어떤 에러가 어떤 의미를 가지는지는 각 도메인이 직접 정의하는 구조다.

입력 검증은 DTO를 단순한 요청 객체가 아니라 'API 입력 계약'으로 재정의하는 방향으로 가져가는 것이 적절하다. 모든 @RequestBody 요청은 @Valid를 기본값으로 두고, DTO 필드에는 @NotNull, @NotBlank, @Size, @Pattern 같은 제약조건을 명시해 유효한 입력의 기준을 DTO에서 선언적으로 표현해야 한다. 이렇게 하면 입력 오류는 서비스 계층까지 내려가지 않고 컨트롤러 경계에서 바로 400 계열 응답으로 정리된다. 결과적으로 validation 실패와 비즈니스 실패, 시스템 실패가 서로 다른 경로로 분리된다.

비즈니스 예외는 **IllegalArgumentException**이나 **ResponseStatusException** 같은 범용 예외 대신, 도메인별 예외 타입으로 통일하도록 하였다. 예를 들어 AuthException, AdminException, InfraException처럼 구분하고, 각각이 자신이 속한 ErrorCode를 가지도록 설계하면 된다. 이렇게 하면 전역 핸들러는 예외의 의미를 추론할 필요 없이, 이미 분류된 예외를 공통 응답 형식으로 직렬화하기만 하면 된다. 반대로 IllegalStateException은 개발자 실수나 불변식 위반, 설정 오류처럼 정말 시스템 예외에만 남겨 둔다.

DB 제약조건 충돌은 **GlobalExceptionHandler** 내부에서 if (msg.contains(...))를 계속 늘리는 방식보다, constraint 이름과 에러 코드를 매핑하는 별도 매퍼를 둔다. 예를 들어 ConstraintExceptionMapper를 두고, uk\_member\_email -> DUPLICATED\_EMAIL, uk\_product\_code -> DUPLICATED\_PRODUCT\_CODE처럼 매핑 테이블을 관리한다. 이 방식은 constraint가 추가되더라도 전역 핸들러를 복잡하게 만들지 않고, 충돌 응답을 도메인 의미에 맞게 정확하게 분류할 수 있다.

지표 현재 목표

| Security 레벨 인증 보호 엔드포인트 | 0/12 | 12/12 |
| --- | --- | --- |
| 수동 인증 null-check 엔드포인트 | 6/12 | 0/12 |
| 비인증 요청 시 NPE 위험 엔드포인트 | 6/12 | 0/12 |
| @RequestBody 검증 적용률 | 6/15 = 40% | 15/15 = 100% |
| malformed JSON 전역 처리 | 0종 | 4종 이상 |
| DB unique constraint 명시 매핑률 | 2/11 = 18.2% | 11/11 = 100% |
| 미사용 ErrorCode 비율 | 2/27 = 7.4% | 0% |

* * *

## **3\. 개선**

### 1) Domain 에러코드 문서화

기존 구조에서 에러코드는 **shared/error** 디렉토리에 집중되어 있었다. 처음에는 공통 예외를 한곳에서 관리할 수 있다는 점에서 단순해 보였지만, 실제로는 반대의 문제가 빠르게 드러났다. 인증, 고객, 관리자, 인프라 영역에서 발생하는 예외가 하나의 공용 ErrorCode 안에 계속 누적되면서, '이 에러가 어느 도메인에서 발생하는지', '왜 존재하는 코드인지', '어떤 계층에서 던져야 하는지'를 파악하기가 점점 어려워졌다. 도메인이 늘어나고 예외 케이스가 추가될수록 **shared/error**는 점점 커졌다.

이 구조의 가장 큰 문제는 에러코드가 더 이상 문서 역할을 하지 못한다는 점이었다. 예외 코드는 단순히 문자열 상수의 모음이 아니라, 시스템이 어떤 실패를 어떤 의미로 정의하고 있는지를 설명하는 사전 역할을 해야 한다. 하지만 모든 에러가 하나의 공용 enum 안에 섞여 있으면, 코드만 봐서는 *인증 도메인의 에러인지*, *고객 비즈니스 규칙 위반인지*, *관리자 유스케이스 오류인지*, *외부 시스템 연동 실패인지* 식별하기 어렵다. 결국 특정 에러코드의 의미를 이해하려면 enum 정의를 열어보고, 다시 해당 throw 지점을 추적하고, 최종적으로 응답 포맷까지 따라가야 했다.

그래서 이번 개선에서는 에러코드를 단순히 '공용 enum'으로 두지 않고, ****도메인별로 문서화된 코드 체계****로 재구성하는 방향을 선택했다. 핵심 아이디어는 간단하다. 에러의 의미는 각 도메인이 직접 정의하고, 응답 포맷과 로깅 정책만 중앙에서 통제하는 것이다. 이를 위해 공통 규약은 shared/error에 두고, 실제 에러코드는 auth, customer, admin, infra 각 도메인 아래로 분리했다.

```text
shared/error/
  ErrorSpec.java
  DomainException.java
  GlobalExceptionHandler.java
  ApiErrorResponseFactory.java

auth/error/
  AuthErrorCode.java
  AuthException.java

customer/error/
  CustomerErrorCode.java
  CustomerException.java

admin/error/
  AdminErrorCode.java
  AdminException.java

infra/error/
  InfraErrorCode.java
  InfraException.java
```

-   각 도메인은 code, httpStatus, defaultMessage를 정의
-   중앙 GlobalExceptionHandler는 이 에러를 공통 응답 포맷으로만 변환
-   로그 포맷, 응답 JSON 구조, traceId 같은 공통 정책은 중앙에서 관리

```java
public interface ErrorCode {
    HttpStatus httpStatus();
    String code();
    ErrorCategory category();
    String message();
}
```

이번 구조에서 중요하게 본 부분은 ****에러코드가 곧 문서가 되도록 만드는 것****이었다. 이를 위해 코드 네이밍 규칙과 category 규칙을 명확히 정했다. 예를 들어 Auth 도메인은 AUT prefix를 사용하고, 포맷은 {BC}-{CATEGORY}-{SEQ}로 통일했다. 따라서 AUT-VAL-001은 \_'Auth bounded context에서 발생한 validation 성격의 첫 번째 에러'\_라는 의미를 코드만 봐도 알 수 있다. 여기에 VAL, DOM, APP, INFRA, EXT 같은 category를 함께 부여하면, 이 에러가 입력 검증 문제인지, 도메인 규칙 위반인지, 외부 시스템 문제인지도 한눈에 파악할 수 있다. 결과적으로 에러코드는 단순한 응답 식별자가 아니라, 개발자와 운영자 모두가 공통으로 읽을 수 있는 운영 문서 역할을 하게 된다.

메시지 규칙도 함께 정의했다. 사용자나 운영 로그에 노출되는 기본 메시지는 반드시 안전한 문구만 사용하고, 이메일이나 전화번호 같은 PII는 절대 포함하지 않도록 했다. 상세 원인과 stack trace는 로그 컨텍스트에서 추적하고, API 응답의 기본 메시지는 의미는 충분하되 민감하지 않게 유지하는 방식이다. 이 원칙은 단순히 메시지를 예쁘게 정리하는 수준이 아니라, 예외 체계를 운영 환경에서도 사용할 수 있게 만드는 중요한 기준이었다.

이러한 규칙을 바탕으로 인증 도메인에는 아래와 같은 형태의 AuthErrorCode를 정의했다.

```java
/**
 * [Auth ErrorCode 규칙]
 * <p>
 * 1) 목적
 * - Auth Bounded Context 에서 발생하는 모든 예외/오류를 ErrorCode 표준화
 * - REST/API 응답, Batch 처리, Kafka 처리, Loki/Grafana 로그에서 동일한 code로 추적 가능해야 한다.
 * <p>
 * 2) code 네이밍 규칙
 * - 포맷: "{BC}-{CATEGORY}-{SEQ}"
 * - BC: AUTH = "AUT" (프로젝트 내 BC 약어 통일)
 * - CATEGORY: VAL | DOM | APP | INFRA | EXT 등
 * - SEQ: 3자리 일련번호 (001부터 증가)
 * - 예: "BIL-VAL-001"
 * <p>
 * 3) category 규칙 (ErrorCategory)
 * - VAL   : 입력/데이터 유효성 검증 실패 (형식, 범위, null/empty 등)
 * - DOM   : 도메인 규칙(invariant) 위반 (재시도해도 해결되지 않음)
 * - APP   : 유즈케이스/오케스트레이션 단계 실패 (상태/흐름 문제)
 * - INFRA : DB/네트워크 등 인프라 문제 (재시도 후보)
 * - EXT   : 외부 시스템(S3, 외부 API 등) 연동 문제 (재시도 후보)
 * <p>
 * 4) message 규칙
 * - 사용자/운영 로그에 노출 가능한 "안전한 메시지"만 사용
 * - 이메일/휴대폰 등 PII(민감정보)는 절대 포함하지 않는다.
 * - 상세 원인은 로그의 exception stacktrace / context(MDC)로 추적한다.
 * <p>
 * 5) enum 항목 주석 규칙(필수)
 * - 각 항목 위에 아래 정보를 주석으로 명시한다.
 * - 발생 위치(예: Batch Step, Domain Method, Adapter)
 * - 트리거 조건(어떤 입력/상태에서 발생하는지)
 * - 운영 의도(재시도 의미 여부, 스킵/중단/격리(DLT) 권장)
 */
@RequiredArgsConstructor
public enum AuthErrorCode implements ErrorCode {

    /**
     * =====================================
     * VAL
     * =====================================
     */
    OAUTH_INVALID_REQUEST(HttpStatus.BAD_REQUEST, "AUT-VAL-001", ErrorCategory.VAL, "OAuth 요청이 올바르지 않습니다."),
    OAUTH_USER_INFO_INVALID(HttpStatus.BAD_REQUEST, "AUT-VAL-002", ErrorCategory.VAL"OAuth 사용자 정보가 유효하지 않습니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "AUT-VAL-003", ErrorCategory.VAL, "인증에 실패했습니다."),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "AUT-VAL-004", ErrorCategory.VAL, "유효하지 않은 리프레시 토큰입니다."),
    REFRESH_TOKEN_REVOKED(HttpStatus.UNAUTHORIZED, "AUT-VAL-005", ErrorCategory.VAL, "폐기된 리프레시 토큰입니다."),
    REFRESH_TOKEN_OWNER_MISMATCH(HttpStatus.UNAUTHORIZED, "AUT-VAL-006", ErrorCategory.VAL, "토큰 소유자가 일치하지 않습니다."),
    REFRESH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "AUT-VAL-007", ErrorCategory.VAL, "만료된 리프레시 토큰입니다."),
    REFRESH_TOKEN_MISSING(HttpStatus.UNAUTHORIZED, "AUT-VAL-008", ErrorCategory.VAL, "리프레시 토큰이 없습니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "AUT-VAL-009", ErrorCategory.VAL, "이메일 또는 비밀번호가 올바르지 않습니다."),
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "AUT-VAL-010", ErrorCategory.VAL, "토큰이 만료되었습니다."),
    OAUTH_UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "AUT-VAL-011", ErrorCategory.VAL, "OAuth 인증에 실패했습니다."),

    /**
     * =====================================
     * DOM
     * =====================================
     */
    DUPLICATED_EMAIL(HttpStatus.CONFLICT, "AUT-DOM-001",ErrorCategory.DOM, "이미 사용 중인 이메일입니다."),
    DUPLICATED_PHONE(HttpStatus.CONFLICT, "AUT-DOM-002",ErrorCategory.DOM, "이미 사용 중인 전화번호입니다."),

    ;

    private final HttpStatus httpStatus;
    private final String code;
    private final ErrorCategory category;
    private final String message;

    @Override
    public HttpStatus httpStatus() {
        return httpStatus;
    }

    @Override
    public String code() {
        return code;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    @Override
    public String message() {
        return message;
    }
}
```

## 2) DomainException과 전역 핸들러 연결

도메인별로 ErrorCode를 분리한 뒤에는, 이 코드를 실제 예외 처리 흐름에 연결하는 작업이 필요했다. 기존 구조에서는 **CustomException**이 shared.error.ErrorCode enum에 직접 의존하고 있었고, **GlobalExceptionHandler**는 이 예외를 받아 공통 응답 포맷으로 변환하는 역할을 하고 있었다.

문제는 이 구조가 공용 enum 하나에 모든 도메인 에러를 몰아넣는 전제를 깔고 있다는 점이었다. 즉 에러코드를 도메인별로 나누더라도, 예외 클래스가 여전히 특정 enum 타입에 고정되어 있다면 구조 자체는 크게 달라지지 않는다. 이를 위해 ErrorCode 인터페이스를 중심으로 예외 계층을 정의했다.

 이 구조에서 공통 예외의 기준점이 되는 것이 **DomainException**이다. **DomainException**은 ErrorCode, field, reason 같은 공통 정보를 가지며, 인증 도메인이든 고객 도메인이든 관리자 도메인이든 모두 같은 방식으로 상속받아 사용할 수 있다.

예를 들면 공통 예외는 다음과 같은 형태가 된다.

```java
package site.holliverse.shared.error;

public abstract class DomainException extends RuntimeException {

    private final ErrorCode errorCode;
    private final String field;
    private final String reason;

    // ErrorCode만 던지면: message/reason 모두 defaultMessage로 통일
    public DomainException(ErrorCode errorCode) {
        this(errorCode, null, null, null);
    }

    // ErrorCode + field + reason  message는 defaultMessage
    public DomainException(ErrorCode errorCode, String field, String reason) {
        this(errorCode, field, reason, null);
    }

    /**
     * @param message  HTTP 응답의 최상단 message에 사용할 값 (null이면 defaultMessage)
     * @param reason   errorDetail.reason에 사용할 값 (null이면 defaultMessage)
     */
    public DomainException(ErrorCode errorCode, String field, String reason, String message) {
        super(message != null ? message : errorCode.message());
        this.errorCode = errorCode;
        this.field = field;
        this.reason = reason != null ? reason : errorCode.message();
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public String getField() {
        return field;
    }

    public String getReason() {
        return reason;
    }
}
```

이렇게 하면 각 도메인은 자신의 예외 클래스를 매우 얇게 유지할 수 있다. 예를 들어 인증 도메인에서는 AuthException, 고객 도메인에서는 CustomerException을 만들고, 내부적으로는 각 도메인의 ErrorCode enum만 넘겨주면 된다.

```java
public class AuthException extends DomainException {

    public AuthException(AuthErrorCode errorCode) {
        super(errorCode);
    }

    public AuthException(AuthErrorCode errorCode, String field, String reason) {
        super(errorCode, field, reason);
    }
}
```

```java
public class CustomerException extends DomainException {

    public CustomerException(CustomerErrorCode errorCode) {
        super(errorCode);
    }

    public CustomerException(CustomerErrorCode errorCode, String field, String reason) {
        super(errorCode, field, reason);
    }
}
```

예외를 던지는 쪽에서는 더 이상 공용 enum의 위치를 찾을 필요 없이, 자신이 속한 도메인의 코드만 참조한다. 예를 들어 인증 관련 유즈케이스에서는 **throw new AuthException(AuthErrorCode.REFRESH\_TOKEN\_MISSING)**처럼 작성할 수 있다.

이전에는 **CustomException**, **ResponseStatusException**, **IllegalArgumentException** 등 여러 타입을 각기 다른 규칙으로 처리하고 있었지만, 이제 도메인 실패는 모두 DomainException이라는 단일 진입점으로 모을 수 있다.

예외 응답 생성 책임도 핸들러에서 분리해 **ApiErrorResponseFactory** 같은 팩토리로 옮기면 더 명확해진다. 예를 들어 다음과 같은 구조로 정리할 수 있다.

```java
@Component
public class ApiErrorResponseFactory {

    public ApiErrorResponse from(DomainException ex) {
        ErrorCode errorCode = ex.getErrorCode();

        return ApiErrorResponse.error(
                errorCode.message(),
                new ApiErrorDetail(
                        errorCode.code(),
                        ex.getField(),
                        ex.getReason()
                )
        );
    }
}
```

그렇게 되면 **GlobalExceptionHandler**는 응답 생성 로직을 직접 들고 있기보다, '어떤 예외를 어떤 방식으로 중앙 정책에 연결할 것인가'에만 집중할 수 있다.

```java
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final ApiErrorResponseFactory errorResponseFactory;

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<ApiErrorResponse> handleDomain(DomainException ex) {
        ApiErrorResponse body = errorResponseFactory.from(ex);
        return ResponseEntity.status(ex.getErrorCode().httpStatus()).body(body);
    }
}
```

이 구조로 바꾸면 공통 응답 포맷은 그대로 유지하면서도, 예외의 의미 정의는 각 도메인에 남겨 둘 수 있다. 다시 말해 중앙 핸들러는 '응답 직렬화'를 담당하고, 도메인은 '실패 의미 정의'를 담당하는 역할 분리가 이루어진다. 이는 예외 처리 설계에서 상당히 중요한 전환점이다. 기존에는 전역 핸들러가 예외의 의미까지 일부 해석해야 했다면, 개선 이후에는 도메인이 의미를 결정하고 중앙은 그것을 일관된 계약으로 노출하는 데만 집중하게 된다.

### 3) 인증 예외처리 강화

기존 인증 예외처리 구조의 가장 큰 문제는, 인증 실패가 Security 계층에서 일관되게 처리되지 않고 각 컨트롤러와 유즈케이스에 분산되어 있었다는 점이었다. 일부 API는 @AuthenticationPrincipal이 null일 경우 직접 401을 던지고 있었고, 일부 API는 null 체크 없이 getMemberId()를 호출해 500으로 오분류될 여지가 있었다. 즉 동일한 '인증 실패' 상황이 어떤 엔드포인트에서는 401, 어떤 엔드포인트에서는 500, 어떤 곳에서는 ResponseStatusException으로 처리되는 식으로 일관성을 잃고 있었다. 이 문제를 해결하기 위해 인증 실패는 더 이상 컨트롤러가 직접 판단하지 않고, Spring Security 계층에서 먼저 차단하도록 정리했다.

-   SecurityConfig에서 인증이 필요한 경로를 permitAll()로 열어두지 않고 보호
-   AuthenticationEntryPoint를 추가해 인증 실패 시 공통 401 응답 생성
-   AccessDeniedHandler를 추가해 권한 부족 시 공통 403 응답 생성
-   컨트롤러 내부의 수동 인증 체크와 ResponseStatusException(401) 처리 제거
-   리프레시 토큰, OAuth 실패, 로그인 실패와 같은 인증 도메인 오류는 AuthErrorCode와 AuthException으로 일관되게 통일

예를 들어 이전에는 다음과 같이 직접 처리하던 로직이 있다.

```java
if (refreshToken == null || refreshToken.isBlank()) {
    throw new AuthException(AuthErrorCode.REFRESH_TOKEN_MISSING);
}
```

“누가 인증되지 않았는가”는 Security가 판단하고, 애플리케이션은 “인증된 사용자가 어떤 비즈니스 요청을 했는가”만 다루게 한다.

```java
private final String[] WHITE_LIST = {
        "/api/v1/admin/**",
        "/internal/v1/**",
        "/api/v1/signup",
        "/api/v1/customer/test",
        "/v1/auth/refresh",
        "/test/callback",
        "/test/onboarding"
};
```

위와 같이 인증이 필요없는 API에 대해서 화이트 리스트로 관리하여 토큰이 필요없는 API에 대해서 인증 없이 요청이 가능하도록 구성한다.

인증 예외는 더 이상 컨트롤러가 직접 처리하지 않고, Spring Security가 먼저 책임지도록 구조를 재정리했다.

인증이 필요한 요청은 Security filter chain에서 차단하고, 인증 실패는 AuthenticationEntryPoint, 권한 부족은 AccessDeniedHandler가 공통 응답 포맷으로 반환하도록 구성하였다. 이렇게 하면 인증/인가 실패는 애플리케이션의 비즈니스 예외와 분리되고, 모든 보호 엔드포인트에서 동일한 기준으로 401과 403이 내려가게 된다.

기존에는 **@AuthenticationPrincipal**을 사용하는 엔드포인트 12개 중 Security 계층에서 실제로 보호되는 엔드포인트가 없었고, 이 중 6개는 비인증 요청 시 500으로 오분류될 가능성이 있었다. 인증 예외처리를 Security 계층으로 이동한 이후, 현재는 principal 기반 엔드포인트 12개 전부가 Security filter chain에서 보호되고 있으며, 비인증 요청이 컨트롤러 내부까지 내려가 500으로 오분류될 수 있는 경로는 0개로 줄었다.

### 4) RequestDto 제약 조건 강화

기존 구조에서는 @RequestBody를 받는 엔드포인트 중 일부에만 @Valid가 적용되어 있었고, 몇몇 DTO는 필수값이나 형식 제약이 아예 정의되어 있지 않았다. 잘못된 입력이 컨트롤러 경계에서 바로 걸러지지 않고 서비스 계층까지 내려가 IllegalArgumentException, 도메인 예외, 심지어 DB 예외로 늦게 드러나는 문제가 있었다. 즉 입력 오류가 '입력 검증 실패'로 분류되지 않고, 다른 예외 유형과 뒤섞여 나타나는 구조였다.

이 문제를 해결하려면 DTO를 단순한 데이터 전달 객체가 아니라, API 입력 계약을 명시하는 1차 방어선으로 다시 정의해야 한다. 유효한 요청이 무엇인지 DTO 수준에서 선언적으로 표현하고, 컨트롤러는 @Valid를 통해 그 계약이 항상 강제되도록 만들어야 한다. 이렇게 되면 잘못된 입력은 서비스 계층까지 침투하지 못하고, 컨트롤러 경계에서 즉시 400 계열 응답으로 정리된다.

실제 수정 방향은 다음과 같다.

-   @RequestBody를 받는 모든 엔드포인트에 @Valid를 적용한다.
-   DTO 필드에 @NotNull, @NotBlank, @Size, @Pattern, @Positive 등을 추가한다.
-   내부 webhook DTO 역시 외부 API와 동일한 수준으로 검증을 적용한다.
-   validation 실패는 BindException, MethodArgumentNotValidException, ConstraintViolationException으로 전역 핸들러에서 공통 처리한다.

예를 들어 기존 DTO가 다음과 같았다면:

```java
public record ChangeProductRequest(
        Long targetProductId
) {}
```

다음과 같이 바꾼다.

```java
public record ChangeProductRequest(
        @NotNull(message = "targetProductId는 필수입니다.")
        @Positive(message = "targetProductId는 1 이상이어야 합니다.")
        Long targetProductId
) {}
```

그리고 컨트롤러는 다음처럼 받는다.

```java
@PostMapping("/change")
public ApiResponse<ChangeProductResponse> changePlan(
        @AuthenticationPrincipal CustomUserDetails customUserDetails,
        @Valid @RequestBody ChangeProductRequest request
) {
    ...
}
```

기존과 대비하여 @RequestBody 검증 적용률을 60%에서 100%로 끌어올렸고, 제약조건이 없는 request DTO를 4개에서 0개로 줄였다.

### 5) 데이터베이스 제약 조건 충돌 예외처리 강화

기존에는 DB unique constraint 충돌이 발생하더라도, 그 의미를 충분히 복원하지 못한 채 대부분 generic CONFLICT로 처리되고 있었다. 실제로 최종 스키마 기준 활성 unique constraint는 11개였지만, 의미 있게 매핑되고 있던 것은 이메일과 전화번호 2개뿐이었다. 즉 매핑률은 18.2% 수준에 머물렀고, 나머지 81.8%는 어떤 필드가 왜 충돌했는지 API 응답만으로는 알기 어려운 상태였다. DB 예외를 그대로 뭉개는 구조에서는 비즈니스 의미를 응답 계층에서 잃어버리게 된다.

이를 해결하기 위해 이번 개선에서는 DataIntegrityViolationException을 전역 핸들러 내부에서 직접 하드코딩으로 분기하지 않고, ****constraint 이름을 기반으로 도메인 에러코드와 field를 함께 매핑하는 구조****로 변경했다. 기존 방식은 **GlobalExceptionHandler** 안에서 예외 메시지에 특정 constraint 이름이 포함되어 있는지를 직접 검사하는 형태였다. 초기에는 단순했지만, unique constraint가 늘어날수록 핸들러가 점점 비대해지는 문제가 있었다. 무엇보다 어떤 constraint가 어떤 에러코드와 연결되는지 로직이 분산되어 있어, 유지보수성과 확장성 모두 떨어지는 구조였다.

그래서 이 책임을 별도의 매퍼 객체로 분리했다. 핵심 아이디어는 전역 핸들러가 더 이상 constraint 이름을 직접 해석하지 않고, 예외에서 constraint 이름만 추출한 뒤 이를 **ConstraintExceptionMapper**에 위임하는 것이다. 이 매퍼는 constraint 이름을 받아 최종 ErrorCode와 응답 field 정보를 함께 반환한다. 이렇게 하면 전역 핸들러는 '예외를 응답 포맷으로 직렬화하는 역할'에 집중하고, '이 constraint가 어떤 의미를 가지는가'는 매퍼가 책임지게 된다.

```java
public record ConstraintMapping(
        ErrorCode errorCode,
        String field
) {
}
```

```java
@Component
public class ConstraintExceptionMapper {

    public ConstraintMapping map(String constraintName) {
        if (constraintName == null || constraintName.isBlank()) {
            return new ConstraintMapping(SharedErrorCode.CONFLICT, null);
        }

        return switch (constraintName) {
            case "uk_member_email" -> new ConstraintMapping(AuthErrorCode.DUPLICATED_EMAIL, "email");
            case "uk_member_phone" -> new ConstraintMapping(AuthErrorCode.DUPLICATED_PHONE, "phone");
            default -> new ConstraintMapping(SharedErrorCode.CONFLICT, null);
        };
    }
}
```

unique constraint 충돌은 대부분 특정 필드와 직접 연결되기 때문에, email, phone 같은 field 정보를 함께 내려주는 편이 API 응답 품질 부분에서 훨씬 좋다.

전역 예외 처리기 역시 이에 맞게 정리했다. 기존에는 DataIntegrityViolationException을 받으면 메시지에 uk\_member\_email, uk\_member\_phone가 포함되어 있는지를 직접 검사하고, 그 외에는 generic CONFLICT로 내려주고 있었다. 개선 이후에는 예외 메시지에서 constraint 이름만 추출하고, 그 결과를 ConstraintExceptionMapper에 넘겨 최종 매핑을 수행하도록 바꿨다.

```java
@ExceptionHandler(DataIntegrityViolationException.class)
public ResponseEntity<ApiErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
    String constraintName = extractConstraintName(ex);
    ConstraintMapping mapping = constraintExceptionMapper.map(constraintName);

    return conflict(
            mapping.errorCode(),
            mapping.field(),
            mapping.errorCode().message(),
            ex
    );
}
```

현재 적용 범위는 이메일과 전화번호 중복 constraint부터 시작했다. 즉 uk\_member\_email은 AuthErrorCode.DUPLICATED\_EMAIL과 field=email로, uk\_member\_phone은 AuthErrorCode.DUPLICATED\_PHONE과 field=phone으로 매핑된다. 나머지 constraint는 아직 SharedErrorCode.CONFLICT로 fallback되도록 두었다.

기존에는 같은 409라도 어떤 필드가 왜 충돌했는지 응답만으로는 알기 어려웠다. 개선 이후에는 적어도 매핑된 constraint에 대해서는 '어떤 필드가 중복되었는지'와 '이 충돌을 어떤 비즈니스 에러코드로 해석해야 하는지'가 함께 전달된다. 즉 DB 레벨의 저수준 예외를, 사용자와 클라이언트가 이해할 수 있는 애플리케이션 계약으로 승격시켰다.

전역 핸들러에 흩어져 있던 하드코딩 분기를 제거하고, constraint 이름을 중심으로 ErrorCode + field를 함께 매핑하는 구조를 도입함으로써, DB 예외를 도메인 의미를 가진 응답으로 복원할 수 있게 만들었다.

### 6) 예외 타입 통일화

문제는 응답 계층에서 실패의 의미를 흐리게 만들고 있었다는 점이다. 어떤 입력 오류는 validation 예외로, 어떤 것은 IllegalArgumentException으로, 어떤 것은 컨트롤러에서 직접 ResponseStatusException으로 처리되고 있다. 그 결과 같은 종류의 실패라도 응답 포맷과 코드가 서로 달라질 수밖에 없다.

이 문제를 해결하기 위해 이번 리팩토링에서는 **비즈니스 실패**를 **DomainException** 계열로 통일했다. 인증 도메인은 AuthException, 고객 도메인은 CustomerException, 관리자 도메인은 AdminException, 인프라 장애는 InfraException으로 나누고, 각각이 자신의 ErrorCode enum을 가지도록 정리했다. 이렇게 하면 예외를 던지는 시점부터 이미 “어느 도메인의 어떤 실패인가”가 코드에 담기고, 전역 핸들러는 이를 공통 응답 형식으로 직렬화하기만 하면 된다.

```java
throw new IllegalArgumentException("유효하지 않은 회원 상태값입니다.");
```

하지만 개선 이후에는 아래처럼 바뀐다.

```java
throw new AdminException(AdminErrorCode.INVALID_MEMBER_STATUS);
```

후자는 예외가 발생한 순간부터 이미 도메인, 카테고리, HTTP 상태, 기본 메시지가 함께 정의되어 있다. 따라서 중앙 예외 처리기 입장에서는 예외의 의미를 재추론할 필요가 없다. 이미 도메인에서 정의한 정보를 공통 응답 포맷으로 직렬화하면 되기 때문이다.

실제 수정 방향은 다음과 같다.

-   비즈니스 규칙 위반은 IllegalArgumentException 대신 도메인 예외.
-   컨트롤러의 ResponseStatusException 사용은 제거하거나 최소화.
-   IllegalStateException은 정말 시스템 불변식 위반이나 설정 오류에만 남김.
-   DomainException은 공통 기반 클래스로 두고, 각 도메인별 예외는 enum 하나만 받도록 단순화.
-   전역 핸들러는 DomainException을 단일 진입점으로 받아 응답을 생성

구체적으로는 ResponseStatusException의 비즈니스 사용을 8건에서 0건, IllegalArgumentException의 비즈니스 사용을 12건에서 0건으로 줄였고, 도메인 실패는 모두 DomainException 계열로 정리하였다.

* * *

## **4\. 개선된 정량 지표**

## 정량 지표

항목 개선 전 현재 개선폭 근거

| 인증 보호 엔드포인트 | 0/12 | 12/12 | +100%p | @AuthenticationPrincipal 사용 컨트롤러 12개 전부 Security 보호 |
| --- | --- | --- | --- | --- |
| 비인증 요청 500 오분류 위험 | 6개 | 0개 | -100% | Security filter chain이 메서드 진입 전 차단 |
| @RequestBody + @Valid 적용률 | 6/10 | 10/10 | +40%p | body 기반 컨트롤러 10개 전부 @Valid 적용 |
| 핵심 검증 누락 DTO | 4개 | 0개 | -100% | CreateCounselDto, ChangeProductRequest, LogFeatureWebhookRequest, AnalysisResponseWebhookRequest 보강 |
| DB unique constraint 명시 매핑률 | 2/11 | 2/11 | 유지 | email, phone만 도메인 코드로 명시 매핑 |
| DB constraint 이름 인지 범위 | 2/11 | 11/11 | +81.8%p | extractConstraintName(...)가 전체 11개 UK 이름 인지 |
| DB constraint 매핑 구조화 | 없음 | 있음 | 구조 개선 | ConstraintExceptionMapper + ConstraintMapping 도입 |
| CustomException 사용 수 | 43 | 0 | -100% | 전부 제거 |
| DomainException 계열 사용 수 | 0 | 44 | 신규 도입 | Auth/Customer/Admin/InfraException 합산 |
| 도메인 예외 enum-only throw 비율 | 0% | 44/44 = 100% | +100%p | 전부 new XxxException(XxxErrorCode.YYY) 형태 |
| ResponseStatusException 사용 수 | 8 | 4 | -50% | 인증/도메인 경로 상당수 제거 |
| IllegalArgumentException 사용 수 | 12 | 8 | -33.3% | 일부 비즈니스 예외를 도메인 예외로 전환 |
| IllegalStateException 사용 수 | 21 | 20 | -4.8% | 시스템/불변식 예외는 대부분 유지 |

[one-year-gap

one-year-gap has 10 repositories available. Follow their code on GitHub.

github.com](https://github.com/one-year-gap)
