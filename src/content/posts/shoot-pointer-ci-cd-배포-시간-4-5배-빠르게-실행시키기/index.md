---
title: "[Shoot-Pointer] CI/CD 배포 시간 4.5배 빠르게 실행시키기"
date: 2025-10-31
legacyUrl: "https://codekim3570.tistory.com/18"
---## ********1.  배경********

* * *

#### **1\. 문제 상황**

**Shoot Pointer**는 현재 **Jenkins**를 이용하여 **CI/CD** 파이프라인을 구축하여 운영 중입니다. 프론트엔드와 AI 쪽과의 좀 더 원활한 테스트 진행을 위해서 **Ubuntu LTS** 기반의 홈서버를 구축하여 지속적인 배포를 진행중입니다. (현재는 Spring 서버는 Azure로 이전하여 운영되고 있습니다.)

#### ⚙️운영 환경

-   **CI/CD tool** : Jenkins + Github Actions + Github WebHooks
-   **클라우드 인프라** : Azure VM (Standard D2 v5)
-   **DB** : PostgreSQL, Redis, MongoDB, Elasticsearch, Kibana
-   **배포 방식** : Docker compose 기반 멀티 컨테이너 아키텍처

현재까지 약 50번의 배포를 진행하면서 심각한 문제점을 발견했습니다. 배포 시마다 새로운 버전의 서버가 재가동되는 과정에서 **최소 5~6분**에서 **최대 8~9분**에서 다운 타임이 생겼습니다. 이는 단순히 시간이 오래 걸리는 것을 넘어 다른 팀원들이 수정된 API를 테스트하지 못하는 상황으로 이어져 개발 생산성에 악영향을 미쳤습니다. 

![](https://blog.kakaocdn.net/dna/dnsn7h/dJMcaeTvHKd/AAAAAAAAAAAAAAAAAAAAADdnTGZZz4XsltMyhoCih2Voqlt_8Zgj2K00O6sdW-ng/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=fcmmsVhRYKZLB4CJlHZ6J68OM%2FY%3D)

최근 배포 결과

#### **2.  CI / CD 아키텍처**

![](https://blog.kakaocdn.net/dna/9HQXy/dJMcae623eC/AAAAAAAAAAAAAAAAAAAAAHJciMhpvzs6Y3WK2wr0Mfsg8f6KdMgUPjGkO8QEpqqD/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=HBjQASrnljsZizyAX1ah1MGlZlQ%3D)

> 현재 저희의 **CI/CD Architecture** 입니다. 실제 프로덕션 브랜치인 main과 개발용 브랜치인 dev에 **Pull Requeest** 작성 시 Java 기반 테스트 커버리지 도구인 **Jacoco**를 통해 gradle 테스트를 진행해서 배포 이전에 모든 테스트를 완료합니다. 이를 통해 배포 이전 단계에서 모든 품질 검증을 완료하여, 실제 배포과정에서는 테스트를 진행하지 않습니다.

**Jacoco Test Flow**

1.  **dev / main** 브랜치에 새로운 PR 또는 Commit 발생
2.  Jacoco GitHub Actions 워크플로우 실행
3.  Temurin 기반 JDK 17 환경에서 Gradle 테스트 수행
4.  Jacoco HTML 리포트 자동 생성

**Jenkins Deploy Flow**

1.  **main** 브랜치에 Push 발생
2.  GitHub Webhook 워크플로우 실행
3.  Jenkins Job Trigger 발생
4.  Docker Compose 기반 빌드 및 배포 수행

#### **3\. 문제 진단 : 배포 시간 병목 구간 분석**

최근 배포 목록 중 가장 시간이 많이 소요된 **#51** 빌드를 기준으로 각 단계별 소요 시간을 분석했습니다.

![](https://blog.kakaocdn.net/dna/FvCsO/dJMcabbpFEo/AAAAAAAAAAAAAAAAAAAAALBF3xIrIPfzEEmLcddyncP8Ab4shQpMdmn1fcLNQXp5/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=Cx2lNngoMGwY6k8quHzIhmBAqjM%3D)

분석 결과, 두 가지의 주요 병목 구간을 발견할 수 있었습니다. 가장 먼저 **docker compose**가 build와 deploy하는 과정이 **5분 16초**로 가장 오래 걸렸고, 그다음으로는 **docker container**를 삭제하는 과정이 **57초**로 측정된 것을 확인할 수 있었습니다.

가장 시간이 오래걸리는 도커 이미지를 **빌드하고 배포하는 과정**에 대해서 **최적화**를 진행하도록 하겠습니다.

**👇기존 docker-compose.yml 파일**

더보기

```
version: "3.9"  
  
services:  
  # PostgreSQL  
  postgres:  
    image: postgres:17  
    container_name: postgres  
    environment:  
      POSTGRES_DB: "shootpointer"  
      POSTGRES_USER: ""  
      POSTGRES_PASSWORD: ""  
      TZ: "Asia/Seoul"  
    ports:  
      - "5432:5432"  
    volumes:  
      - postgres-data:/var/lib/postgresql/data  
    networks:  
      - spring-network  
    restart: always  
    healthcheck:  
      test: ["CMD-SHELL", "pg_isready -U myuser -d shootpointer"]  
      interval: 10s  
      timeout: 5s  
      retries: 5  
      start_period: 30s  
  
  # Redis  
  redis:  
    image: redis:7  
    container_name: redis  
    ports:  
      - "6379:6379"  
    volumes:  
      - redis-data:/data  
    networks:  
      - spring-network  
    restart: always  
    healthcheck:  
      test: ["CMD", "redis-cli", "ping"]  
      interval: 10s  
      timeout: 5s  
      retries: 5  
      start_period: 10s  
  
  # PgAdmin  
  pgadmin:  
    image: dpage/pgadmin4  
    container_name: pgadmin  
    environment:  
      PGADMIN_DEFAULT_EMAIL: ""  
      PGADMIN_DEFAULT_PASSWORD: ""  
    ports:  
      - "3305:80"  
    networks:  
      - spring-network  
    restart: always  
  
  # MongoDB  
  mongo:  
    image: mongo:8  
    container_name: mongo  
    environment:  
      MONGO_INITDB_DATABASE: "shootpointer"  
    ports:  
      - "27017:27017"  
    volumes:  
      - mongo-data:/data/db  
      - mongo-config:/data/configdb  
    networks:  
      - spring-network  
    restart: always  
    healthcheck:  
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]  
      interval: 10s  
      timeout: 5s  
      retries: 5  
      start_period: 20s  
  
  # Spring Boot Application  
  shootpointer:  
    build:  
      context: .  
      dockerfile: Dockerfile  
    container_name: shootpointer  
    command: ["java", "-Xmx2g", "-jar", "/app.jar"]  
    depends_on:  
      postgres:  
        condition: service_healthy  
      redis:  
        condition: service_healthy  
      mongo:  
        condition: service_healthy  
      elasticsearch:  
        condition: service_healthy  
    environment:  
      SPRING_PROFILES_ACTIVE: "${SPRING_PROFILES_ACTIVE}"  
  
      # 서버 포트  
      SERVER_PORT: "9000"  
      # 데이터베이스 설정  
      SPRING_DATASOURCE_URL: "jdbc:postgresql://postgres:5432/shootpointer"  
      SPRING_DATASOURCE_USERNAME: ""  
      SPRING_DATASOURCE_PASSWORD: ""  
      SPRING_DATASOURCE_DRIVER_CLASS_NAME: "org.postgresql.Driver"  
      # JPA 설정  
      SPRING_JPA_HIBERNATE_DDL_AUTO: "create-drop"  
      SPRING_JPA_SHOW_SQL: "true"  
      SPRING_JPA_DATABASE_PLATFORM: "org.hibernate.dialect.PostgreSQLDialect"  
      SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT: "org.hibernate.dialect.PostgreSQLDialect"  
      SPRING_JPA_PROPERTIES_HIBERNATE_FORMAT_SQL: "true"  
      # Hikari 연결 풀  
      SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: "20"  
      SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE: "5"  
      SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT: "30000"  
      SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT: "600000"  
      SPRING_DATASOURCE_HIKARI_MAX_LIFETIME: "1800000"  
      # Redis  
      SPRING_REDIS_HOST: "redis"  
      SPRING_REDIS_PORT: "6379"  
      # MongoDB  
      SPRING_DATA_MONGODB_URI: "mongodb://mongo:27017/shootpointer"  
      # 타임존  
      TZ: "Asia/Seoul"  
      # 로깅 레벨  
      LOGGING_LEVEL_ORG_HIBERNATE_SQL: "DEBUG"  
      LOGGING_LEVEL_ORG_HIBERNATE_TYPE_DESCRIPTOR_SQL_BASICBINDER: "TRACE"  
  
      # Elasticsearch  
      SPRING_ELASTICSEARCH_URIS: "http://elasticsearch:9200"  
  
    ports:  
      - "9000:9000"  
    networks:  
      - spring-network  
    restart: always  
    healthcheck:  
      test: ["CMD", "curl", "-f", "http://localhost:9000/actuator/health"]  
      interval: 30s  
      timeout: 10s  
      retries: 3  
      start_period: 60s  
  
  # Elasticsearch  
  elasticsearch:  
    build:  
      context: .  
      dockerfile: Dockerfile.elesticsearch  
    image: docker.elastic.co/elasticsearch/elasticsearch:8.6.0  
    container_name: elasticsearch  
    user: "0"  
    environment:  
      discovery.type: "single-node"  
      xpack.security.enabled: "false"  
      logger.level: "debug"  
      ES_JAVA_OPTS: "-Xms2g -Xmx2g"  
    entrypoint: >  
      bash -c "        mkdir -p /usr/share/elasticsearch/logs &&        chmod -R 775 /usr/share/elasticsearch/logs &&        chown -R 1000:1000 /usr/share/elasticsearch &&        echo 'Fixed log permissions, starting Elasticsearch as elasticsearch user...' &&        su -s /bin/bash elasticsearch -c '/usr/local/bin/docker-entrypoint.sh eswrapper'      "    ports:  
      - "9200:9200"  
      - "9300:9300"  
    volumes:  
      - ./esdata:/usr/share/elasticsearch/data  
      - ./es-logs:/usr/share/elasticsearch/logs  
    networks:  
      - spring-network  
    restart: always  
    healthcheck:  
      test: ["CMD", "curl", "-f", "http://localhost:9200/_cluster/health"]  
      interval: 30s  
      timeout: 10s  
      retries: 3  
      start_period: 60s  
  
  
  # Kibana  
  kibana:  
    image: docker.elastic.co/kibana/kibana:8.6.0  
    container_name: kibana  
    environment:  
      ELASTICSEARCH_HOSTS: "http://elasticsearch:9200"  
    ports:  
      - "5601:5601"  
    depends_on:  
      - elasticsearch  
    networks:  
      - spring-network  
    restart: always  
  
  # Nginx  
  nginx:  
    image: nginx:latest  
    container_name: nginx  
    restart: always  
    ports:  
      - "443:443"  
    volumes:  
      - /home/opendocs/jenkins/workspace/shoot-pointer/nginx/conf.d:/etc/nginx/conf.d  
      - /etc/letsencrypt:/etc/letsencrypt:ro  
    depends_on:  
      - shootpointer  
    networks:  
      - spring-network  
  
networks:  
  spring-network:  
    driver: bridge  
  
volumes:  
  redis-data:  
  postgres-data:  
  mongo-data:  
  mongo-config:  
  esdata:
```
