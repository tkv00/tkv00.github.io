---
title: "[Qampus] 공공 데이터로 대학교 위치 정보 자동으로 저장하기"
date: 2025-07-26
legacyUrl: "https://codekim3570.tistory.com/9"
---**해당 글은 노션에 작성한 글을 티스토리로 재게시했습니다.**

## **1\. 배경**

* * *

![](https://blog.kakaocdn.net/dna/b5Yvwp/btsPBKTIOwJ/AAAAAAAAAAAAAAAAAAAAAHC7HYKPhV5Ocr2rNqCl-BqDmpf2mG0eJfie5bAUylXE/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=ERs9z6j5xuHE8b%2Fxv2gwVs5UHRo%3D)

프론트엔드에서 대학교 지도 부분 파트를 담당하신 분께서 기존 프론트엔드 내부 로컬 파일 형태로 저장하던 대학교의 위도와 경도를 서버에서 정보를 저장한 후 이를 조회하는 방식으로 위도와 경도를 가져오는 편에 대하여 제안을 하셔서 나는 다음과 같은 이유로 서버에서 정보를 저장하는 것이 더 좋은 방법이라고 생각했다.

1.  2024년 우리나라의 대학교 개수는 336개(출처:나무위키)이다. 이렇게 많은 대학교들의 모든 위도와 경도 정보들을 사용자가 입력한 대학교명을 바탕으로 프론트엔드 개발자가 손수 1개씩 로컬 파일에 저장하는 방법은 매우 비효율적이라고 생각했다.
2.  대학교 이름을 기준으로 서버에서 데이터를 받아와야 하는 주간 순위, 차지율 등과 미리 저장된 위도,경도 정보를 프론트엔드에서 매핑할 경우 , **라우팅 속도의 최적화**를 위해 사용하고 있는 **Next.js**의 이점이 없어질 거라고 생각했다.

![](https://blog.kakaocdn.net/dna/daxR96/btsPAYZdFrJ/AAAAAAAAAAAAAAAAAAAAAFLrFIqmGYY6SjJsa29XHXHa_0hVVspjqV6CasSaM3mU/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=p5IvG64x44kt%2Bb0JsFJBIHTZHRI%3D)

Qampus 대학교 맵

> 위와 같이 대한민국 지도 라이브러리에서 대학교의 위도값과 경도값을 입력하면 해당 대학교의 위치를 파악할 수 있다.

* * *

### **서버에서는 위도와 경도를 어떻게 가지고 와야하는가?**

330여개의 대학교를 필자가 1개씩 데이터베이스에 저장하고 **위도**와 **경도**를 알맞은 대학교 **데이터**와 매핑하는 방법은 어떤가? **시간 리소스**의 낭비가 엄청나고 사람이 직접 서버의 **데이터베이스**에 접속하여 **데이터**를 삽입하기 때문에 실수로 잘못된 값을 삽입할 경우가 생긴다.

이미 대학교의 위치정보가 입력되어 있는 **csv** 혹은 **엑셀** 파일의 값을 토대로 **데이터베이스**에 저장하는 건 어떤가?

이러한 방법으로 구현하는 것도 괜찮은 방법이라고 생각했지만 모든 대학교의 학생들이 우리의 플랫폼을 사용한다는 가정하에 모든 대학교들의 위치정보를 미리 데이터베이스에 넣는것은 사용되지 않는 대학교 정보들에 대해 **리소스** 낭비가 존재할 것이라고 생각했다.

이같은 문제점을 보완하고자 **공공데이터**의 사용을 고려하였고 아래와 같은 대학교 위치 **공공데이터 API**를 사용하기로 결정하였다.

[교육부\_대학교 주소기반 좌표정보\_20241030

대학교의 주소기반 좌표정보를 제공하며, 학교구분, 학교코드, 학교명, 본분교 여부, 학제, 설립구분 등 다양한 정보를 포함합니다. 또한 도로명주소, 지번주소, 위도, 경도, 영문주소, 중문주소,

www.data.go.kr](https://www.data.go.kr/tcs/dss/selectFileDataDetailView.do?publicDataPk=15138981)

## **2\. 해결과정**

* * *

```
{
  "page": 0,
  "perPage": 0,
  "totalCount": 0,
  "currentCount": 0,
  "matchCount": 0,
  "data": [
    {
      "학교구분": "string",
      "학교코드": 0,
      "학교명": "string",
      "본분교": "string",
      "학제": "string",
      "지역": "string",
      "설립구분": "string",
      "관련법령": "string",
      "법인명": "string",
      "학교상태": "string",
      "학교명(한자)": "string",
      "학교명(영문)": "string",
      "도로명주소": "string",
      "지번주소": "string",
      "위도": "string",
      "경도": "string",
      "영문주소": "string",
      "중문주소": "string",
      "우편번호": 0,
      "학교개교일": "string",
      "학교홈페이지": "string",
      "총장명": "string",
      "학교대표번호": "string",
      "학교대표팩스번호": "string"
    }
  ]
}
```

필자가 선택한 공공데이터 API의 **GET통신**을 성공할 시 위와 같은 **Json형태**로 응답값을 받는다. 이 중 **“data”**의 **“학교명”**을 바탕으로 클라이언트가 회원가입 시 입력하는 학교명과 매칭하여 **“위도”**와 **“경도”**값을 가지고 데이터베이스에 저장을 한다.

#### GetLocationUtil.java

```
@Component
public class GetLocationUtil {
    @Value("${openApi.serviceKey}")
    private String AUTH_ENCODING_KEY;

    @Value("${openApi.baseUrl}")
    private String API_URL;
    
    private final ObjectMapper objectMapper=new ObjectMapper();
    private final RestTemplate restTemplate=new RestTemplate();

    //데이터 가공
    public LocationDto findLocationByCompanyName(String universityName) throws URISyntaxException {
        int page=1;
        while (true){
            String url=API_URL+"?serviceKey="+AUTH_ENCODING_KEY+"&page="+page+"&perPage=10";
            URI uri=new URI(url);
            try {
                ResponseEntity<String> responseEntity = restTemplate.getForEntity(uri, String.class);
                String responseJson = responseEntity.getBody();
                UniversityLocationResponse response = objectMapper.readValue(responseJson, UniversityLocationResponse.class);

                if (response.getData() == null || response.getData().isEmpty()) {
                    return LocationDto.builder()
                            .경도(String.valueOf(0L))
                            .위도(String.valueOf(0L))
                            .build();
                }

                for (LocationDto university : response.getData()) {
                    if (university.get학교명().contains(universityName)) {
                        return university;
                    }
                }
                page++;
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }
    }
}
```

-   **@Component** 애노테이션으로 **Spring** 빈으로 등록한다.
-   반환값으로는 **LocationDto**로 위도와 경도, 대학교이름만을 반환하도록 설계했다.
-   **RestTemplate**로 공공데이터에게 **GET**요청을 보낼 객체를 구성한다.
-   **response.getData() == null || response.getData().isEmpty()** : 응답값이 null이거나 비어있으면 경도와 위도값에 0값을 넣어 시스템에서 임의로 대학교 엔티티의 위치정보에 Null값을 넣는 것을 방지한다.
-   페이징으로 가지고 온 데이터에서 **for**문을 통해 클라이언트가 입력한 대학교이름을 포함하는 공공데이터값이 있으면 해당 데이터의 위도와 경도를 함께 반환한다.

#### LocationDto.java

```
@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
@NoArgsConstructor
public class LocationDto {
    private String 학교명;
    private String 위도;
    private String 경도;

    @Builder
    public LocationDto(String 학교명,String 위도,String 경도){
        this.위도=위도;
        this.경도=경도;
        this.학교명=학교명;
    }
}
```

-   변수명을 영어가 아닌 한글로 설정한 것은 공공데이터 API에서 제공하는 데이터값의 key값이 한글로 이루어져 있기 때문에 각 key값에 대해 알맞은 매핑을 위해 한글로 설정했다.

## **3\. 결과**

* * *

![](https://blog.kakaocdn.net/dna/bGAA0M/btsPCjnN7bK/AAAAAAAAAAAAAAAAAAAAAPkSIXHsCLoU0g70a2JpXGfi9_bYEf_1wUNZlycUviXz/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=6dFKo1RbVA07u4b5k7E%2F9ZTQwtM%3D)

실제 회원가입이 이루어지는 **CompleteSignupService** 클래스에서 위와 같이 적용하여 클라이언트가 입력한 대학교이름을 바탕으로 위도와 경도 데이터를 **University** 엔티티의 데이터베이스에 저장한다.

![](https://blog.kakaocdn.net/dna/bGTN4z/btsPB27FWB8/AAAAAAAAAAAAAAAAAAAAAIQJ-uSW8XQT2maM1Ropz5QOtmGFV70deIWktuJ9hxib/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=BGlpub0BdtsEuFJdbQy84q206ps%3D)

실제 로컬DB에 위치 정보가 저장된 모습

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 9 }

공유하기
