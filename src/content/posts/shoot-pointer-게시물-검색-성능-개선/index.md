---
title: "[Shoot-Pointer] 게시물 검색 성능 개선"
date: 2025-09-25
legacyUrl: "https://codekim3570.tistory.com/16"
---## **1\. 배경**

* * *

기존 **Shoot-Pointer**에서 게시물 전체 검색을 개발하면서, 제목 또는 내용을 바탕으로 검색으로 **like** 연산을 사용하고 있었습니다. 여기서 문제가 되는 부분은 단순히 검색 단어의 유무만을 판단하고 이를 최신순으로 정렬 후 **NoOffset+Slice** 방식으로 조회하는 것입니다. 대부분의 포털 사이트 혹은 SNS에서는 검색 시에 정확도를 기준으로 정렬을 진행합니다. 추가로 검색어 자동완성 기능과 검색어 랭킹 또한 추가 기능으로서 염두에 두고 있는 상황에서 자연스럽게 **Elastic Search**의 도입을 고려하게 되었습니다.

```
    /**
     * 1. 제목 + 내용 게시물 조회 - NoOffset+slice 방식
     * 2. 조회된 게시물 최신순 정렬 반환.
     */
    @Query(value = """
        SELECT *
        FROM post p
        WHERE (p.title LIKE CONCAT('%', :search, '%')
            OR p.content LIKE CONCAT('%', :search, '%'))
          AND p.post_id < :lastPostId
        ORDER BY p.post_id DESC
        LIMIT :size
        """,
            nativeQuery = true)
    List<PostEntity> getPostEntitiesByPostTitleOrPostContentOrderByCreatedAtDesc(
            @Param("search") String search,
            @Param("size") int size,
            @Param("lastPostId") Long postId
    );
```

* * *

#### **🧠ElasticSearch란?**

**ElasticSearch**란 검색 및 분석 엔진으로 대규모의 데이터를 빠르게 저장, 검색, 분석할 수 있는 도구입니다. **Restful API**를 제공하여 JSON 형식으로 쉽게 데이터를 저장하고 조회할 수 있습니다. **DataBase**는 **B-Tree**를 기반으로 한 인덱스로 문자열 검색에서는 성능이 떨어집니다. 또한, 특정 문자열에 대한 정확한 검색은 최적화가 잘 되어있지만 부분 문자열에 대해서는 비교적 성능이 좋지 못합니다. 

반면, **Elastic Search**는 **역색인 구조(Inverted Index)**를 사용합니다. 역색인 구조란 키워드를 통해 문서를 찾아내는 방식으로 DB에서는 PK값이나 FK값으로 데이터를 찾는 반면 역색인 구조는 데이터에 들어있는 키워드들을 통해서 전체 데이터를 찾는 방법입니다. 

## **2\. 해결과정**

* * *

#### 1-1 )ElasticSearch + Kibana 구축

```
services:
  # Spring Boot Application
  shootpointer:
    build:
    depends_on:
      elasticsearch:
        condition: service_healthy
    environment:
      SPRING_ELASTICSEARCH_URIS: http://elasticsearch:9200
    ports:
      - "9000:9000"
    networks:
      - spring-network

  ## ElasticSearch
  elasticsearch:
    build:
      context: .
      dockerfile: Dockerfile.elesticsearch
    image: docker.elastic.co/elasticsearch/elasticsearch:8.6.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - logger.level=debug
      - ES_JAVA_OPTS=-Xms2g -Xmx2g
    ports:
      - "9200:9200"
      - "9300:9300"
    volumes:
      - esdata:/usr/share/elasticsearch/data
      - ./es-logs:/usr/share/elasticsearch/logs
    networks:
      - spring-network
    restart: always
    healthcheck:
      test: [ "CMD", "curl", "-f", "http://localhost:9200/_cluster/health" ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  kibana:
      image: docker.elastic.co/kibana/kibana:8.6.0
      container_name: kibana
      environment:
        - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      ports:
        - "5601:5601"
      depends_on:
        - elasticsearch
      networks:
        - spring-network
      restart: always

networks:
  spring-network:
    driver: bridge

volumes:
  esdata:
```

**Docker-compose.yml**를 위와 같이 작성하였고 직접적으로 필요없는 부분은 제외했습니다. 

> 1\. 현재 **SpringBootApplication**이 돌아가는 network와 동일하게 설정하기 위해 **spring-network**를 추가해줍니다.  
> 2. **elasticsearch**가 정상적으로 작동(service\_healthy)상태일 때까지 기다리기 위해 **shootpointer-depends\_on** 속성에 **elasticsearch**를 추가해줍니다.  
> 3\. 같은 방법으로 **kibana**는 **elasticsearch**가 정상적으로 작동(**service\_healthy**)일 때 실행되어야 하므로 **elasticsearch-depends\_on** 속성에 kibana를 추가합니다.  
> 4. **\- ES\_JAVA\_OPTS=-Xms2g -Xmx2g** 속성을 추가해 **docker**내에서 사용가능한 메모리값을 2GB로 주어 대용량 데이터 삽입 시, **out of memory** 오류를 방지합니다.  
> 5. **\- xpack.security.enabled=false** 속성을 추가하여 **elasticsearch** 접속 시 username과 password없이 접속이 가능하도록 설정합니다.

#### **🚨  **\- ES\_JAVA\_OPTS=-Xms2g -Xmx2g 관련 트러블 슈팅****

더보기

ElasticSearch 구축을 완료한 이후 Bulk Api를 사용하여 100만 건의 더미 데이터를 삽입하는 과정에서 **out of memory** 트러블을 마주했습니다.

```
curl -XPOST "http://localhost:9200/_bulk" \
  -H "Content-Type: application/json" \
  --data-binary @/Users/kimdoyeon/bulk.json

curl: option --data-binary: out of memory
curl: try 'curl --help' or 'curl --manual' for more information
```

미리 로컬환경에서 만들어 놓은 100만 건(1.18GB)의 더미 데이터인 ./bulk.json 파일을 한 번에 Elastic Serach에 올리게 되면서 맥북의 메모리 초과가 발생하게 되었습니다.

docker-compose.yml에서 elasticsearch 설정 중 ****\- ES\_JAVA\_OPTS=-Xms2g -Xmx2g**** 을 추가하여 docker내에서 사용가능한 메모리의 크기를 증가시켜줍니다.
