---
title: "[Holliverse] AWS Infra 구축기(2)"
date: 2026-03-27
legacyUrl: "https://codekim3570.tistory.com/29"
---## **1\. 개요**

이번 인프라를 설계하면서 가장 먼저 고민한 주제는 기능이 아니라 **보안 경계**였습니다. **Holliverse**는 구조상 고객용 웹앱과 관리자용 백오피스가 함께 존재합니다. 고객용 서비스는 누구나 접속할 수 있어야 하지만, 관리자 페이지는 그렇게 두면 안 된다고 생각했습니다. 관리자 기능은 회사 내부나 허용된 특정 IP 대역에서만 접근 가능해야 했고, 그 기준은 애플리케이션 코드가 아니라 **네트워크 구조 자체**에서 먼저 보장되어야 했습니다.

처음에는 **Spring Security**에서 **ROLE** 기반으로만 잘 제어해도 충분하지 않을까 생각했습니다. 실제로 권한 처리 자체만 놓고 보면 그렇게 구현할 수도 있습니다.  
하지만 관리자 영역처럼 민감한 기능은 “로그인하지 않으면 못 들어온다” 수준으로 끝낼 문제가 아니었습니다. 애초에 **들어오는 경로 자체를 줄이는 것**이 더 안전하다고 판단했습니다. 그래서 이번 설계는 인증과 인가 이전에, **외부 진입점부터 고객과 관리자를 분리하는 방향**으로 출발했습니다.

#### **고민 1) Application Load Balancer를 고객용 ALB와 관리자용 ALB를 정말 나눠야 할까?**

처음에는 하나의 ALB 뒤에 고객 서비스와 관리자 서비스를 함께 두는 구조도 검토했습니다.  
구조도 단순하고, 비용도 줄일 수 있기 때문입니다. 특히 작은 규모의 서비스라면 하나의 진입점을 두고 **애플리케이션 레벨**에서만 권한을 구분하는 방식도 충분히 현실적인 선택지가 될 수 있습니다.

하지만 이 구조에는 분명한 한계가 있었습니다. 하나의 ALB를 사용하면 관리자용 엔드포인트 역시 같은 외부 진입점을 통해 노출됩니다. 인증과 인가가 잘 걸려 있더라도, 관리자 경로 자체는 인터넷에 열린 상태가 됩니다. 즉, 보안 경계가 네트워크가 아니라 애플리케이션 코드에만 걸리게 되는 것입니다. 물론 Spring Security는 강력합니다.

  
다만 관리자 기능처럼 민감한 영역은 “코드 상에서 막고 있다”보다, **애초에 네트워크적으로 진입 자체를 제한하고 있다**는 구조가 더 낫다고 봤습니다. 고객 트래픽은 불특정 다수의 접근을 전제로 하지만, 관리자 트래픽은 접속 주체와 접속 위치가 상대적으로 명확합니다. 그렇다면 두 트래픽을 같은 입구에서 처리하기보다, 처음부터 다른 입구를 주는 편이 더 자연스럽다고 판단했습니다.

비용도 검토했습니다.  
ALB는 시간당 0.0225달러가 발생하고, 2개를 사용하면 월 기준 약 16.2달러의 고정비가 추가됩니다. 절대 무시할 수 있는 비용은 아니지만, 이번 프로젝트에서는 이 비용보다 **관리자 영역을 명확하게 분리해 운영할 수 있다는 점**이 더 중요했습니다. 보안은 문제가 생긴 뒤에 보강하는 것이 아니라, 구조를 설계할 때부터 반영해야 한다고 생각했기 때문입니다.

![](https://blog.kakaocdn.net/dna/bCop2d/dJMcabwQeSd/AAAAAAAAAAAAAAAAAAAAAKBgYZABn5ducgorvbTAz2YrDrwXUjfl4ahM0ycXqMtU/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=wq9aJvj8Ie%2F1zX3aQpb%2BAZ%2BeUCk%3D)

AWS ALB 비용

#### **고민 2) 프론트 웹은 Vercel로 배포할 것인가?**

사실 프론트엔드를 빠르게 배포하는 관점만 보면 **Vercel**은 굉장히 좋은 선택지입니다. **Next.js**와의 궁합도 좋고, 배포 경험도 간결합니다. 고객용 웹처럼 공개 접근이 필요한 서비스라면 충분히 매력적인 옵션입니다. 그런데 관리자 웹은 성격이 달랐습니다.

  
관리자 웹은 누구나 접근할 수 있는 공개 서비스가 아니라, 제한된 사용자만 접근해야 하는 내부성 서비스에 가까웠습니다. 그래서 이 영역만큼은 “배포가 편하다”보다 “보안 경계 안에서 같이 관리되느냐”가 더 중요했습니다. 만약 관리자 프론트를 외부 SaaS 플랫폼에 올리고, 관리자 백엔드만 내부 인프라에 두면 구조가 애매해집니다. 프론트는 외부에 있고 백엔드만 내부에 있는, 반쯤 분리된 형태가 되기 때문입니다. 물론 운영은 가능합니다. 하지만 처음부터 세운 목표가 **관리자 영역 전체를 일관된 보안 경계 안에 두는 것**이었기 때문에, 이 방향과는 맞지 않다고 판단했습니다.

그래서 관리자 웹도 AWS 안에서 함께 운영하기로 했습니다. **Next.js** 기반이라 단순 정적 파일 배포보다는 실행 환경까지 함께 제어할 수 있는 방식이 필요했고, 결국 관리자 웹 역시 **ECS**에 올리는 방향을 선택했습니다. 이렇게 하면 관리자 웹과 관리자 API를 같은 인프라 경계 안에서 다룰 수 있고, ALB, 보안 그룹, 서브넷, 접근 제어 정책도 하나의 구조 안에서 일관되게 가져갈 수 있습니다.

* * *

## **2\. 전체 네트워크 구조 한눈에 보기**

![](https://blog.kakaocdn.net/dna/AxzmS/dJMcaiJtvLJ/AAAAAAAAAAAAAAAAAAAAALzVdK9L5Xa_9Y7QCXnEUC5VBRX5VbIacV1GrIpxpDUW/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=iS7Di2EpYc4PK5P4GVN%2Fkepf81w%3D)

Holliverse Infra Network Architecture

**AWS 네트워크 아키텍처**에서 중요한 부분은 **Public Subnet**과 **Private Subnet**의 역할을 완전하게 분리한 것입니다.

인터넷과 직접 맞닿아야 하는 리소스만 Public에 두고, 실제 요청을 처리하는 서비스와 데이터 계층은 **Private**에 배치했습니다. 쉽게 말해, 외부에 보여야 하는 것과 보여서는 안 되는 것을 처음부터 **네트워크 레벨**에서 갈라 놓았습니다.

**Public Subnet**에는 **ALB**와 **NAT Gateway**처럼 인터넷 접점 역할을 하는 리소스를 두고, **Private Subnet**에는 ECS 서비스, RDS, MSK, Monitoring EC2처럼 직접 노출되면 안 되는 리소스를 배치했습니다. 이 기준 하나만 명확하게 잡아도 구조가 훨씬 단순해지고, 보안 설계도 자연스럽게 따라온다고 느꼈습니다.

* * *

## **3\. VPC(Virtual Private Cloud)**

#### 2개 AZ, Public/Private 분리, NAT Gateway 1개

VPC는 2개의 가용영역(Availability Zone)을 기준으로 구성했고, 각 AZ에 Public Subnet과 Private Subnet이 생성되도록 설계했습니다. 코드로 보면 아래와 같습니다.

```
/*
 * =================================================================
 *                              VPC
 * =================================================================
 */
this.vpc = Vpc.Builder.create(this, "AppVpc")
        .maxAzs(NetworkConstants.MAX_AZ)//가용영역
        .natGateways(NetworkConstants.NAT_GATEWAYS)
        .subnetConfiguration(Arrays.asList(
                SubnetConfiguration
                        .builder()
                        .name(NetworkConstants.SUBNET_PUBLIC)
                        .subnetType(SubnetType.PUBLIC)
                        .cidrMask(NetworkConstants.CIDR_MASK)
                        .build(),
                SubnetConfiguration
                        .builder()
                        .name(NetworkConstants.SUBNET_PRIVATE)
                        .subnetType(SubnetType.PRIVATE_WITH_EGRESS)
                        .cidrMask(NetworkConstants.CIDR_MASK)
                        .build()
        )).build();
```

이 설정에서 **maxAzs=2**이므로 퍼블릭 서브넷과 프라이빗 서브넷이 각각 2개씩 생성됩니다. 퍼블릭 서브넷은 **ALB**, **NAT Gateway**처럼 인터넷과 직접 연결되는 리소스를 위한 공간이고, 프라이빗 서브넷은 ECS, RDS, MSK, Monitoring EC2처럼 외부에 직접 노출되면 안 되는 리소스를 위한 공간입니다.

프라이빗 리소스라고 해서 인터넷으로 완전히 나가지 않아도 되는 것은 아니었습니다. 예를 들어 외부 API 호출이나 CloudWatch 연동처럼 **outbound 트래픽**이 필요한 경우가 있기 때문에 **PRIVATE\_WITH\_EGRESS**를 사용했습니다. 다만 **NAT Gateway**는 AZ마다 하나씩 두지 않고 1개만 두었습니다. 이건 비용 절감을 위한 선택이었고, 대신 특정 AZ 장애 시 egress 경로가 하나의 NAT Gateway에 의존하게 되는 트레이드오프를 감수했습니다.

* * *

## **4\. Security Group 설계**

#### “같은 VPC니까 그냥 열자”를 피하자

현재 **NetworkStack**은 고객용 ALB, 고객용 API, 관리자용 ALB, 관리자용 웹, 관리자용 API, DB, MSK 브로커, 모니터링, Kafka Connect용 Security Group을 각각 따로 두는 **'최소 권한 규칙'**을 지키고자 했습니다. 그리고 대부분의 **Security Group**에 **allowAllOutbound(false)**를 적용해, 아웃바운드도 기본 허용이 아니라 명시 허용 방식으로 가져갈 수 있도록 했습니다.

```
/*
 * =================================================================
 *                         Security Group
 * =================================================================
 */
this.customerAlbSg = SecurityGroup.Builder.create(this, "CustomerAlbSg")
        .vpc(vpc)
        .allowAllOutbound(false)
        .disableInlineRules(true)
        .description("Customer Application Load Balancer Security Group")
        .build();

this.customerApiSg = SecurityGroup.Builder.create(this, "CustomerApiSg")
        .vpc(vpc)
        .allowAllOutbound(false)
        .disableInlineRules(true)
        .description("Customer API Server Security Group")
        .build();
```

"내부망이니까 열어도 된다"는 식의 느슨한 네트워크 구성을 피하려고 했습니다. 예를 들어 customer-api는 HTTPS와 DNS 정도의 외부 아웃바운드만 열고, DB와 MSK는 각 전용 **Security Group**으로만 나갈 수 있습니다. 5432나 9098 포트를 인터넷 전체로 열지 않고, 목적지를 **Security Group ID**로 제한했습니다.

```
/*
 * =================================================================
 *                   Customer Rules
 * =================================================================
 */
customerAlbSg.addEgressRule(
        Peer.securityGroupId(customerApiSg.getSecurityGroupId()),
        Port.tcp(customerServerPort),
        "To Customer API ECS only"
);

customerApiSg.addIngressRule(
        Peer.securityGroupId(customerAlbSg.getSecurityGroupId()),
        Port.tcp(customerServerPort),
        "From customer ALB only"
);

customerApiSg.addEgressRule(
        Peer.securityGroupId(dbSg.getSecurityGroupId()),
        NetworkConstants.POSTGRES,
        "To DB only"
);
```

고객용 API는 오직 고객용 ALB를 통해서만 들어올 수 있도록 했고, RDS는 오직 지정된 **API Security Group**에서만 접근 가능하도록 구성했습니다.

* * *

## **5\. 외부에 노출되는 경로는 어디까지인가**

이 아키텍처에서 인터넷에 직접 노출되는 리소스는 사실상 두 개의 ALB뿐입니다. 하나는 고객용 API 앞단의 **Customer ALB**이고, 다른 하나는 관리자 화면 앞단의 **Admin ALB**입니다. 둘 다 퍼블릭 서브넷에 배치되어 있지만, 접근 정책은 완전히 다르게 가져갔습니다.

```
this.customerAlb = ApplicationLoadBalancer.Builder.create(this, CUSTOMER_ALB)
        .vpc(loadBalancerProps.vpc())
        .internetFacing(true)
        .securityGroup(loadBalancerProps.customerAlbSg())
        .deletionProtection(true)
        .vpcSubnets(publicSubnets)
        .build();
```

고객용 ALB는 공개 API 진입점이므로 인터넷 전체에서 80, 443 접근을 받습니다. 다만 80 포트는 HTTPS 리다이렉트 전용이고, 실제 요청 처리는 443 리스너에서 이뤄집니다. ALB 뒤의 **customer-api**는 여전히 프라이빗 서브넷에 있고, **customerAlbSg**에서 오는 트래픽만 받습니다.

```
allowedIpList.forEach(ip -> {
    adminAlbSg.addIngressRule(Peer.ipv4(ip), NetworkConstants.HTTP, "Admin HTTP from allowed IP");
    adminAlbSg.addIngressRule(Peer.ipv4(ip), NetworkConstants.HTTPS, "Admin HTTPS from allowed IP");
});
```

관리자 외부 경로는 고객 외부 경로보다 한 단계 더 강하게 닫아 두었습니다. **ADMIN\_ALLOWED\_CIDRS** 환경 변수에 들어 있는 허용 IP 대역만 관리자 ALB에 접근할 수 있게 만들었습니다. 

관리자 경로는 **Admin ALB -> admin-web -> admin-api**처럼 두 단계로 나뉩니다. 관리자는 브라우저로 **admin-web**에 먼저 도착하고, 이후 내부 프록시나 API 호출을 통해 **admin-api**와 통신하게 됩니다. 그래서 관리자 API는 인터넷 사용자가 직접 호출하는 구조라기보다, 관리자 웹과 내부 서비스가 중심이 되는 구조에 가깝습니다.

* * *

## **6\. 서비스 간 통신은 "필요 조합"만 Open**

![](https://blog.kakaocdn.net/dna/EPJoK/dJMcafMO5fH/AAAAAAAAAAAAAAAAAAAAAI2qF7NNtK-rW4Xp9houSdoIJ0IjtKPibcA4FlMwMMu5/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=F3wfQnUQw%2FtympDyHxJTaYvTFqs%3D)

같은 VPC 안에 있다고 해서 전부 열어 두면, 구조가 복잡해질수록 어디서 어디로 붙는지 파악하기가 어려워진다고 생각했습니다. 그래서 실제로 필요한 통신만 하나씩 정리해서 열어 두는 방식으로 구성했습니다.

예를 들어 **customer-api**는 단순히 사용자 요청만 처리하는 서버가 아닙니다. DB에도 붙어야 하고, MSK와도 통신해야 하며, 상황에 따라 **admin-api**나 **intelligence-server**도 호출해야 합니다. **admin-api**도 마찬가지입니다. 관리자 요청만 받는 서버가 아니라 DB, MSK, intelligence 서비스까지 함께 연결되는 구조입니다. 그래서 네트워크 문서를 작성할 때도 단순히 계층만 나누기보다, 어떤 서비스가 어떤 대상을 호출하는지를 드러내는 쪽이 더 중요하다고 봤습니다.

* * *

## **7.  ECS 서비스는 왜 전부 Private에 뒀는가**

ECS 서비스들을 구현한 **EcsClusterStack**를 보면 각 애플리케이션의 런타임이 어떤 네트워크 구성을 가져가는지 확인할 수 있습니다.

```
SubnetSelection privateSubnets = SubnetSelection.builder()
        .subnetType(SubnetType.PRIVATE_WITH_EGRESS)
        .build();

PrivateDnsNamespace serviceNs = PrivateDnsNamespace.Builder.create(this, DOMAIN_NAME_SPACE)
        .vpc(vpc)
        .name(AppConfig.getInternalDomainName())
        .build();
```

모든 **ECS 서비스**는 **PRIVATE\_WITH\_EGRESS 서브넷**에 배치했습니다. 그리고 Cloud Map 기반의 private DNS namespace를 별도로 생성했습니다. 이 구조로 두 가지를 의도했습니다.

-   **인터넷 직접 접근 차단**: ECS 태스크는 퍼블릭 IP 없이 동작하므로 인터넷에서 직접 접근할 수 없습니다.
-   **서비스 디스커버리**: 내부 서비스끼리는 고정 IP 대신 서비스 이름으로 서로를 찾을 수 있습니다.

```
FargateService.Builder serviceBuilder = FargateService.Builder.create(this, SERVICE_ID)
        .cluster(props.cluster())
        .taskDefinition(taskDefinition)
        .securityGroups(List.of(props.serviceSg()))
        .vpcSubnets(props.subnets())
        .assignPublicIp(false)
        .desiredCount(props.desiredCount())
        .enableExecuteCommand(props.enableEcsExec());
```

**assignPublicIp(false)**가 들어가 있기 때문에 ECS 서비스는 외부에서 직접 접근할 수 없습니다. 결국 외부 사용자가 애플리케이션에 접근하는 유일한 공식 경로는 **ALB**입니다.

**Cloud Map**을 사용하면 **admin-web**은 내부적으로 **admin-api.internal-domain:port** 형태의 주소를 사용하고, **customer-api**와 **admin-api**는 다시 **intelligence-server.internal-domain:port**를 호출합니다. 이 방식 덕분에 내부 서비스의 IP가 바뀌어도 호출 코드를 바꿀 필요가 없고, 배포 중 태스크 교체가 일어나도 네트워크 구성이 훨씬 유연하게 유지됩니다.

* * *

## **8\. Data Layer도 동일한 원칙으로 가져갔다**

#### RDS와 MSK는 철저히 Private

이 구성에서 RDS(PostgreSQL)는 철저하게 프라이빗으로 두었습니다.

```
// RDS 인스턴스 생성
this.rds = DatabaseInstance.Builder.create(this, "HolliversePostgres")
        .engine(postgresEngine)
        .vpc(vpc)
        .vpcSubnets(dbSubnets)
        .securityGroups(List.of(dbSg))
        .iamAuthentication(true)
        .databaseName(DB_NAME)
        .port(DB_PORT)
        .multiAz(false)
        .publiclyAccessible(false)
        .deletionProtection(true)
        .build();
```

**publiclyAccessible(false)**가 핵심입니다. DB는 인터넷에 직접 노출되지 않으며, 접근은 dbSg에 허용된 **Security Group**만 가능합니다. 현재 코드 기준으로는 **customer-api**, **admin-api,** **intelligence-server**, **monitoring**이 DB에 접근할 수 있습니다.

AWS MSK를 사용하는 Kafka 계층도 동일한 방식을 적용했습니다.

```
this.cluster = new CfnCluster(this, "ProvisionedCluster",
        CfnClusterProps.builder()
                .brokerNodeGroupInfo(CfnCluster.BrokerNodeGroupInfoProperty.builder()
                        .clientSubnets(privateSubnetIds)
                        .securityGroups(List.of(kafkaBrokerSg.getSecurityGroupId()))
                        .build())
                .clientAuthentication(CfnCluster.ClientAuthenticationProperty.builder()
                        .sasl(CfnCluster.SaslProperty.builder()
                                .iam(CfnCluster.IamProperty.builder()
                                        .enabled(true)
                                        .build())
                                .build())
                        .build())
                .encryptionInfo(CfnCluster.EncryptionInfoProperty.builder()
                        .encryptionInTransit(CfnCluster.EncryptionInTransitProperty.builder()
                                .clientBroker("TLS")
                                .inCluster(true)
                                .build())
                        .build())
                .build());
```

MSK 브로커 역시 private subnet에 배치했고, 인증은 IAM 기반 SASL, 전송 구간은 TLS를 사용했습니다. 네트워크 레벨에서는 9098 포트를 아무 데나 열지 않고, **customer-api**, **admin-api**, **intelligence-server**, **monitoring**, **kafka-connect** 같은 허용된 클라이언트 SG에서만 접근 가능하게 했습니다.

* * *

## **9\. 마무리**

이번 설계에서 제가 가장 먼저 정한 기준은 보안을 더 많이 붙이는 것이 아니었습니다. 오히려 어디까지를 외부에 열어 둘 것인지, 그리고 어디서부터를 내부 경계로 볼 것인지를 먼저 정하는 것이 더 중요하다고 봤습니다. 그래서 고객 트래픽과 관리자 트래픽을 같은 입구에서 받지 않도록 했고, ALB부터 분리했습니다.  
또 ECS와 데이터 계층은 프라이빗 영역에 두었고, **Security Group** 역시 필요한 통신만 허용하는 방식으로 구성했습니다. 결국 이런 선택들은 전부 같은 기준에서 나온 결정이었습니다.

  
이 서비스에서 어떤 영역은 외부에 공개되어야 하고, 어떤 영역은 처음부터 쉽게 닿을 수 없게 만들어야 하는지를 구조로 표현하는 과정에 더 가까웠습니다. 특히 관리자 영역처럼 민감한 기능은 애플리케이션 레벨의 인증과 인가만으로 보호하기보다, 네트워크 단계에서부터 진입 경로 자체를 좁혀 두는 편이 더 안전하다고 판단했습니다.

[one-year-gap

one-year-gap has 10 repositories available. Follow their code on GitHub.

github.com](https://github.com/one-year-gap)

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 29 }

공유하기
