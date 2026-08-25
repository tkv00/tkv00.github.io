---
title: "[WealthTracker] 성능 개선 이야기 4004ms-&gt;108.2ms"
date: 2025-07-20
legacyUrl: "https://codekim3570.tistory.com/4"
---## **1\. 배경**

* * *

WealthTracker 서비스의 핵심 API 중 유저의 지출 내역을 그래프로 표현하기 위한  /api/expend/graph의 성능을 점검하기 위해 부하 테스트를 진행했습니다.  
이번 테스트에서는 최대 1,000명의 유저가 동시에 이 API를 호출하는 상황을 가정했고, **총 100만 건의 더미 데이터**를 준비해 실제 트래픽 환경에 가까운 조건을 구성했습니다.

-   부하 시뮬레이션 도구: **Locust**
-   모니터링 도구: **Prometheus + Grafana**
-   테스트 대상 데이터: **1000명의 유저 × 1인당 1000건의 지출 데이터**

#### **테스트 환경**

테스트는 로컬 개발 환경에서 진행되었습니다. 이는 최적화된 서버 환경이 아닌 상황에서도 API가 얼마나 견딜 수 있는지를 보기 위함이었습니다.

> \- Apple M2 칩  
> \- 8코어 CPU  
> \- 16GB 통합 메모리

#### **테스트 시나리오**

점진적으로 사용자를 늘려가며, 시스템이 어떤 시점에서 병목 현상을 보이는지 관찰했습니다.

미리 생성해둔 유저들의 JWT 텍스트 파일을 통해 API 요청 시 필요한 Authorization Header를 삽입했습니다.

**1단계**

100명

3분

초기 워밍업 단계

**2단계**

500명

9분

중간 부하 상태

**3단계**

1000명

15분

최대 동시 접속 부하

```
from locust import HttpUser, task, between
from locust import LoadTestShape

import random
import time

# JWT 토큰 리스트 
with open("./k6-scripts/jwt_tokens.txt") as f:
    jwt_list = [line.strip().split(",")[1].strip() for line in f if line.strip()]

class ExpendUser(HttpUser):
    wait_time = between(1, 1)

    @task
    def get_expend_graph(self):
        user_id = self.environment.runner.user_count
        jwt = jwt_list[self.user_id % len(jwt_list)] if hasattr(self, 'user_id') else random.choice(jwt_list)

        headers = {
            "Authorization": f"Bearer {jwt}"
        }

        # 요청 보내기
        with self.client.get("/api/expend/graph", headers=headers, catch_response=True) as res:
            if res.status_code == 200 :
                res.success()
            else:
                res.failure(f"Unexpected status {res.status_code} or slow response: {res.elapsed.total_seconds()*1000:.2f}ms")

    def on_start(self):
        self.user_id = random.randint(0, len(jwt_list) - 1)
class StagedLoadShape(LoadTestShape):
    stages = [
        {"duration": 300, "users": 100, "spawn_rate": 20},   # 3분간 100명
        {"duration": 900, "users": 500, "spawn_rate": 50},   # 9분간 500명
        {"duration": 1500, "users": 1000, "spawn_rate": 100},# 15분간 1000명
        
    ]

    def tick(self):
        run_time = self.get_run_time()

        for stage in self.stages:
            if run_time < stage["duration"]:
                return (stage["users"], stage["spawn_rate"])
        return None
```

#### **테스트 결과**

![](https://blog.kakaocdn.net/dna/bPBJh9/btsPtDGODUE/AAAAAAAAAAAAAAAAAAAAABpdYzpwm102tk_xRX-oIRiX8bGkIIgZ9yiKGle7i-Dp/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=GJee41aMLQ5wuc0r0bEj7G6MN7Y%3D)

초당 요청 수 RPS

![](https://blog.kakaocdn.net/dna/qtbyW/btsPrRGApHe/AAAAAAAAAAAAAAAAAAAAAFBUgfnWD9HX_1kZkgwz3HJj_dEAX2ta6H5jzrvIureT/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=envavtM5J%2BpKEoZPmFBc4oL%2FuNc%3D)

응답 시간 Response Time

![](https://blog.kakaocdn.net/dna/kJYKl/btsPtBbaR0v/AAAAAAAAAAAAAAAAAAAAAH3QhpqP4BMtbgG7oG_ncbqRblorWgusQFOetr5sOhgU/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=YAzs9ovgzrnAG5gzs2BRJDLwhwI%3D)

유저 수 Number Of Users

![](https://blog.kakaocdn.net/dna/VRqQi/btsPs5DNcw2/AAAAAAAAAAAAAAAAAAAAAFQ39swrZjcRHTiKvG_Mq5l7_i38NE2j-EKwU7nAYY6I/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=IB1WctZHGAMA%2BlNVer19xtir%2BqQ%3D)

전체적인 성능 테스트 결과 표

> 부하 테스트 결과 위의 사진처럼 응답값의 failure는 존재하지 않았지만 유저가 증가하는 시점에서 응답률이 갑자기 튀는 현상이 보였습니다.  
> 📈100명의 유저 -> 500명의 유저 :  
>  - P95기준 : 2,400ms  
>  - P50기준 : 1,500ms  
> 📈500명의 유저 -> 1,000명의 유저:  
>  -  P95기준 : 9,300ms   
>  -  P50기준 : 7,600ms 

## **2\. 해결과정**

* * *

### **성능 목표 잡기**

웹 성능을 측정하기 위한 지표는 여러가지가 존재합니다.

-   TTFB(Time To Firsh Byte)
    -   페이지를 요청했을 때 서버에서 데이터의 첫 번째 바이트가 도착하는 시점.
    -   주로 서버의 성능과 직결
-   FCP(First Contentful Paint)
    -   페이지가 로드되기 시작하고 컨텐츠의 일부가 화면에 렌더링 될 때까지의 시간.
-   FMP(First Meaningful Paint)
    -   브라우저가 페이지의 주요 컨텐츠들을 화면에 렌더링하기 시작하는 시간.
-   LCP(Largest Contentful Paint)
    -   페이지에서 가장 용량이 큰 컨텐츠가 표시되는 시점.

이 중에서 서버 성능과 가장 직결된 지표인 TTFB를 기준으로 할 것이고 평균 응답 시간과 P95까지의 응답 시간을 기준으로 성능 목표를 잡도록 하겠습니다.

**Google**의 리서치에 따르면

-   사용자의 53%는 3초 이상이 걸리면 해당 사이트를 이탈한다.
-   페이지 로딩 시간 1초 → 3초가 되면 이탈 확률 32% 증가
-   페이지 로딩 시간 1초 → 5초가 되면 이탈 확률 90% 증가
-   페이지 로딩 시간 1초 → 6초가 되면 이탈 확률 106% 증가
-   페이지 로딩 시간 1초 → 10초가 되면 이탈 확률 123% 증가

![](https://blog.kakaocdn.net/dna/0jwR8/btsPqNcvl44/AAAAAAAAAAAAAAAAAAAAACT_ktO8H4qqGGEncZ49RKi2jaBzWHO3J9QCx8C3PWkQ/img.jpg?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=z6dOcls22SE5KYs0OUHoXx4KZzE%3D)

구글 리서치 결과 그래프

해당 리서치 같은 경우는 2017년 자료로 현재 시점인 2025년 기준으로는 사용자들이 좀 더 빠른 웹 사이트 반응 속도를 원할 것입니다.

따라서, 아래와 같은 성능 목표를 잡았습니다.

 

**평균**

**P95**

**개선율**

**기존**

4004ms

11000ms

700.8%

**목표**

500ms

1000ms

900%

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 4 }

공유하기
