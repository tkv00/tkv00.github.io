---
title: "[DB-STUDY] 2주차"
date: 2025-12-20
legacyUrl: "https://codekim3570.tistory.com/19"
---**Ureca 3기 - 백엔드 대면 교육**을 들으며 따로 진행한 약 8주간의 데이터베이스 스터디 내용입니다.

[https://github.com/Study-Castle/Database\_Study](https://github.com/Study-Castle/Database_Study)

[GitHub - Study-Castle/Database\_Study

Contribute to Study-Castle/Database\_Study development by creating an account on GitHub.

github.com](https://github.com/Study-Castle/Database_Study)

## 📘 1. 디스크 읽기 방식

### 순차 I/O

-   데이터를 연속적인 블록으로 **순차적**으로 읽거나 쓰는 작업
-   데이터를 디스크에 쓸 때 매번 헤더를 이동시킬 필요가 없음

* * *

### 랜덤 I/O

-   데이터를 **임의의 위치**에서 읽거나 쓰는 작업
-   데이터를 디스크에 쓰기위해 디스크 헤더를 매번 움직여서 쓰고 쓸 위치로 이동 시키는 시스템 콜을 호출하는 방식

* * *

### 발생 시점

 

랜덤

순차

상황

특정 레코드나 데이터 블록을 찾기 위해 인덱스를 탐색하는 경우

테이블의 모든 레코드를 스캔하는 SELECT 쿼리를 실행하는 경우

예시

WHERE 절에 조건을 포함한 쿼리, 임의의 데이터를 갱신 OR 삭제

인덱스의 모든 블록을 읽거나 쓰는 경우, 대량의 데이터를 정렬하거나 그룹화하는 경우

* * *

> 쿼리 튜닝의 목표는 랜덤 I/O 자체를 줄여주는 것이 목표!!!

* * *

### SSD VS HDD

-   **순차 I/O** : SSD ≥ HDD
-   **랜덤 I/O** : SSD >>>>> HDD
-   DataBase Server에서는 랜덤 I/O의 비중 🔼

* * *

## 📘 2. 인덱스

-   칼럼의 값과 해당 레코드가 저장된 주소를 **key-value** 형태로 인덱스를 만든다.
-   **why?**
-   SELECT 쿼리의 속도를 증가시키기 위해.
-   SELECT 성능 향상을 위한 인덱스 도입은 결국 데이터의 저장(INSERT, DELETE, UPDATE)과 **trade-off** 관계에 있다.

* * *

### 데이터 저장 알고리즘

-   **B-Tree 인덱스**
-   **Hash 인덱스**
-   Fractal-Tree 인덱스
-   Merge-Tree 인덱스

## 📘 3. 기본 데이터 처리

### 풀 테이블 스캔

![](https://blog.kakaocdn.net/dna/5e1r2/dJMcadtMFlC/AAAAAAAAAAAAAAAAAAAAAAdCsjF-M2w2kOoTIvU23K1XugpIAl3tHz3Fw9ZqgRju/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=AAbOxmCypzMGd224xzVU3GyPxY8%3D)

풀 테이블 스캔

-   인덱스를 활용하지 않고 테이블을 처음부터 끝까지 전부 다 뒤져서 데이터를 찾는 방식.

1.  테이블의 레코드 건수가 매우 작아 인덱스를 스캔하는 것보다 테이블 스캔이 더 빠른 경우
2.  WHERE절이나 ON 절에 인덱스를 사용할 수 있는 조건이 없는 경우
3.  옵티마이저가 판단한 조건 일치 레코드 건수가 너무 많은 경우

* * *

### 풀 인덱스 스캔

![](https://blog.kakaocdn.net/dna/b7uiwX/dJMcaaRpu8B/AAAAAAAAAAAAAAAAAAAAAHbt5Bnb6kXDn9orboFmK_oNSAwpbogXz93dmN0gNao-/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=ETTbOU4%2FmwIZ2TxJPRGtAVC%2F30Y%3D)

풀 인덱스 스캔

-   인덱스 테이블을 처음부터 끝까지 다 뒤져서 데이터를 찾는 방식.
-   풀 데이터 스캔 방식보다 효율적이지만, 인덱스 테이블 전체를 읽어야 하기 때문에 아주 효율적이라고 할 수 없음.

* * *

### ORDER BY

-   정렬을 처리하는 방법

 

장점

단점

인덱스

이미 인덱스가 정렬되어 있어 순서대로 읽기만 하면 되므로 매우 빠름

부가적인 인덱스 추가/삭제는 느리다, 디스크 공간이 많이 필요, 메모리가 많이 필요

FileSort

인덱스를 생성하지 않는 방법으로 인덱스를 이용할 때의 단점이 장점

정렬 작업 시 실행 시 처리되므로 레코드의 수가 많을수록 성능 저하

```
EXPLAIN
WITH filtered AS (
    SELECT
        h.member_id,
        m.member_name,
        h.two_point_count,
        h.three_point_count
    FROM
        highlight AS h
        JOIN member AS m ON h.member_id = m.member_id
    WHERE
        m.is_aggregation_agreed = TRUE
        AND h.is_selected = TRUE
        AND h.created_at >= '2025-11-01 00:00:00'
        AND h.created_at <  '2025-11-01 00:00:00'
)
SELECT
    f.member_name,
    f.member_id,
    SUM(f.two_point_count * 2) AS two_total,
    SUM(f.three_point_count * 3) AS three_total,
    (SUM(f.two_point_count * 2) + SUM(f.three_point_count * 3)) AS total
FROM
    filtered AS f
GROUP BY
    f.member_name, f.member_id
ORDER BY
    total DESC,
    three_total DESC,
    two_total DESC
LIMIT 10;
```

![](https://blog.kakaocdn.net/dna/b7mjgh/dJMb9952rtp/AAAAAAAAAAAAAAAAAAAAAMTv2TiTzSkBbpLKO7lc6KwMHiXa10WDQM4fY3zT-VXq/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=zLKQNPct8plu8grCFEKJmpPMWuA%3D)

* * *

### 소트 버퍼

-   MySQL이 정렬을 수행할 때 별도의 메모리 공간을 할당받아서 사용하는데, 이 메모리 공간을 의미.
-   쿼리의 실행이 완료되면 즉시 시스템으로 반납.
-   정렬할 레코드의 수 > 소트 버퍼의 크기

1.  메모리의 소트 버퍼에서 정렬 수행(Multi-Merge)
2.  수행 Multi-Merge 횟수는 Sort\_merge\_passes 상태 변수에 누적 집계

-   8MB 이상부터는 소트 버퍼 크기에 따른 성능향상 변화 X
-   MySQL의 소트 버퍼 크기는 56KB ~ 1MB 미만이 적절
-   소트 버퍼의 크기를 크게 설정 → OOM 가능성과 함께 OOM-Killer가 여유 메모리 확보를 위한 프로세스 종료 위험 존재

* * *

### 정렬 알고리즘

### 싱글패스

-   소트 버퍼에 정렬 기준 컬럼을 포함해 **SELECT** 대상이 되는 컬럼을 전부 담아 정렬 수행
-   정렬에 필요하지 않은 컬럼 또한 소트 버퍼에 담아 정렬
-   단점 : 많은 소트 버퍼 공간 필요

### 투 패스

-   정렬 대상 + PK만 소트 버퍼에 담아서 정렬 수행 → 정렬된 순서대로 다시 PK로 테이블을 읽어 **SELECT**할 컬럼을 가져오는 방식
-   단점 : 테이블을 2번 읽음

> 최신 버전에서는 싱글 패스 전략을 사용하지만 아래와 같은 경우는 투 패스 전략을 사용한다.
> 
> 1.  레코드의 크기가 max\_length\_for\_sort\_data 시스템 변수에 설정된 값보다 큰 경우
> 2.  BLOB나 TEXT 타입의 컬럼이 SELECT 대상에 포함된 경우

* * *

### 정렬 처리 방법

-   성능 : 인덱스 정렬 > 조인에서 드라이빙 테이블 정렬 > 조인에서 조인 결과를 임시 테이블로 저장 정렬
-   인덱스 사용 O : FileSort 과정 없이 인덱스를 순서대로 읽어 결과 반환
-   인덱스 사용 X : 정렬 버퍼에 저장하면서 정렬을 처리

**인덱스 정렬 조건**

1.  ORDER BY에 명시된 컬럼이 제일 먼저 읽는 테이블에 속해야 함
2.  ORDER BY 순서대로 생성된 인덱스가 존재
3.  WHERE절에 첫 번째로 읽는 테이블의 컬럼 조건 == ORDER BY 인덱스

```
SELECT *
FROM employees AS e, salaries AS s
WHERE s.emp_no = e.emp_no
  AND e.emp_no BETWEEN 10 AND 20
ORDER BY e.emp_no;
```

* * *

**조인의 드라이빙 테이블 정렬**

-   드라이빙 테이블: 조인 시 먼저 액세스되는 테이블
-   조인을 실행하기 이전에 조인 대상이 되는 첫 번째 테이블의 레코드를 우선 정렬 후 조인 실행

```
SELECT *
FROM employee AS e, salaries AS s
WHERE s.emp_no = e.emp_no
  AND e.emp_no BETWEEN 10 AND 20
ORDER BY e.last_name;
```

* * *

**임시 테이블 정렬**

-   2개 이상의 테이블을 조인하지 않는 경우 임시 테이블 생성 후 결과 저장 → 저장된 테이블 정렬 수행

* * *

### 쿼리 처리 방법

스트리밍

버퍼링

레코드가 검색될 때마다 바로 전송하는 방식

먼저 결과를 모아 MySQL에서 가공 후 스토리지 엔진으로부터 가져옴

GROUP BY / ORDER BY 쿼리에서는 불가능

LIMIT를 사용해도 절감 효과 X

* * *

### GROUP BY

-   스트리밍 처리를 할 수 없는 작업
-   GROUP BY에 사용된 조건은 인덱스 사용 불가 → HAVING절에서 인덱스 이용 튜닝은 불필요

### GROUP BY 작업 방식

**인덱스를 사용하는 경우**

-   **인덱스 스캔** : 이미 정렬된 인덱스를 차례대로 읽기 때문에 추가적인 정렬 작업이나 임시 테이블 불필요
-   **루스 인덱스 스캔** : 인덱스를 건너뛰며 읽는 방식
    -   실행 계획의 Extra 컬럼: *Using index for group-by*
    -   단일 테이블에 대해서만 수행 가능
    -   인덱스의 유니크한 값이 적을수록 성능 향상
    -   임시 테이블 필요 X

**인덱스를 사용하지 않는 경우**

-   **임시 테이블 사용**
    -   GROUP BY 컬럼들로 구성된 유니크 인덱스를 가진 임시 테이블 생성 → 중복 제거 및 집합 연산 수행

* * *

### DISTINCT 작업 방식

-   **집계 함수 사용 시**
    -   DISTINCT는 SELECT 레코드를 유니크하게 선택하는 것 (특정 컬럼만 아님)
    -   즉, `(first_name, last_name)` 조합이 유니크한 레코드를 조회

```
SELECT DISTINCT first_name, last_name FROM employees;
```

```
SELECT DISTINCT(first_name), last_name FROM employees;
```

> DISTINCT는 함수가 아니므로 괄호는 의미가 없다.
> 
> 즉, `first_name`만 유니크하게 조회하는 것이 아니라 `(first_name, last_name)`이 유니크한 레코드를 조회한다.

-   **집계 함수 미사용 시**
    -   함수 인자로 전달된 컬럼값이 유니크한 것만 가져옴

* * *

## 📘 4. 고급 최적화

### 인덱스 확장

```
CREATE TABLE dept_emp (
    emp_no INT NOT NULL,
    dept_no CHAR(4) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    PRIMARY KEY (dept_no, emp_no),
    KEY ix_fromdate (from_date)
);
```

-   PK: (dept\_no, emp\_no)
-   2번째 인덱스: from\_date
-   2번째 인덱스는 데이터 레코드를 찾아가기 위해 PK(dept\_no, emp\_no)를 순서대로 포함

* * *

### 인덱스 머지

-   하나의 테이블에 대해 2개 이상의 인덱스를 이용해 쿼리를 처리
-   조건이 여러 개 존재하더라도 하나의 인덱스에 포함된 컬럼 조건만으로 인덱스 검사 → 나머지는 읽은 후 필터링

**Spring Boot에서의 인덱스 머지 사용**

```
@Getter
@Entity
@Builder(toBuilder = true)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Table(name = "expend", indexes = {
    @Index(name = "idx_expend_date_user_id", columnList = "expendDate, userId", unique = true)
})
public class Expend {
   // 엔티티 변수
}
```

-   실행 계획
    -   index\_merge\_intersection (교집합)
    -   index\_merge\_sort\_union (합집합)
    -   index\_merge\_union (정렬 후 합집합)

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 19 }

공유하기
