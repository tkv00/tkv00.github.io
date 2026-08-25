---
title: "[Qampus] AWS S3 이미지 업로드 테스트 코드"
date: 2025-07-26
legacyUrl: "https://codekim3570.tistory.com/8"
---**해당 글은 노션에 작성한 글을 티스토리로 재게시했습니다.**

## **1\. 배경**

* * *

SWYP 8기의 서비스의 제출 및 시연이 2주정도밖에 남지 않았다. 우리의 서비스 Quampus의 주요 질문 및 답변의 CRUD작성은 같은 백엔드 팀원분인 재하님이 어느정도 완료를 해주셨고 서비스의 주요기능이 대학생들간의 전공지식을 서로 질문하고 답변하며 학교별 순위측정이다 보니 질문과 답변을 게시하는 과정에서 이미지를 공유해야하는 일이 발생한다. 이전 **Yeungnam-Nyang** 프로젝트과정에서 프론트엔드파트로도 진행하며 경험하였던 AWS S3를 통한 이미지 정적 관리를 이용하여 이미지를 관리하려고 했지만 SWYP측에서 Naver Cloud의 20만원 크레딧을 지원해주어서 NCP를 이용하기로 결정했다. NCP 공식문서를 읽어보니 Amazon S3와 호환이되어 Amazon S3 자바 라이브러리를 이용하여 쉽게 이미지 호스팅을 할 수 있었다.

조금 아쉬운 점이라면 라이브러리의 업데이트가 매우 빈도가 낮다는 점..(제일 최신버젼이 23년 2월이다)  
  

## **2\. 해결과정**

* * *

-   사용 라이브러리

```
implementation 'io.awspring.cloud:spring-cloud-starter-aws:2.3.0'
implementation 'com.amazonaws:aws-java-sdk-s3:1.12.781'
```

![](https://blog.kakaocdn.net/dna/AZWkh/btsPzPbod3d/AAAAAAAAAAAAAAAAAAAAAGJ1L6iPnWkF0i_jmef-NvZ5tgVJPN-M51dPxWwQPpzP/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=8XzIKWhqMYOtPXEcOKjEgihX3zI%3D)

Spring Cloud AWS Starter 라이브러리

-   **NCP(Naver Cloud Platform)** 개인 설정을 통해 **secretKey**와 **accessKey**를 발급을 받고 아래와 같이 버킷을 생성한 후 디렉토리를 구성.
-   **Qampus** 에서 이미지를 사용하는 부분이 질문과 답변이므로 **question**과 **answer**로 디렉토리를 설정.

![](https://blog.kakaocdn.net/dna/mDCn5/btsPzTLpe3W/AAAAAAAAAAAAAAAAAAAAAA63KVk_eEbSqMMEiJOPs_bGXa9GGHKWM56CnI8069Ll/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=d3zV3DGd59vqBcX2JicSnl%2FvdVY%3D)

NCP 사진 디렉토리 설정

* * *

### **서비스 로직**

```
@Service
@RequiredArgsConstructor
public class ImageServiceImpl implements ImageService {
    private static final String BUCKET_NAME="quampus";
    private static final String DIRECTORY_OF_QUESTION="/question";
    private static final String DIRECTORY_OF_ANSWER="/answer";
    private final AmazonS3Client objectStorageClient;
    @Override
    public List<String> putFileToBucket(List<MultipartFile> files, String type) {
        //질문하기 디렉토리
        String FILE_DIRECTORY="";
        List<String> urls=new ArrayList<>();
        //TODO:testCode작성
        if(type.equals("QUESTION")){
            FILE_DIRECTORY=BUCKET_NAME+DIRECTORY_OF_QUESTION;
            //답변하기 디렉토리
        } else if (type.equals("ANSWER")) {
            FILE_DIRECTORY=BUCKET_NAME+DIRECTORY_OF_ANSWER;
        }
        for (MultipartFile file:files){
            ObjectMetadata objectMetadata=new ObjectMetadata();
            objectMetadata.setContentType(file.getContentType());
            objectMetadata.setContentLength(file.getSize());

            String fileName= UUID.randomUUID()+"_"+file.getOriginalFilename();
            try {
                //사진 업로드 및 url저장
                PutObjectRequest request=new PutObjectRequest(FILE_DIRECTORY,fileName,file.getInputStream(),objectMetadata);
                objectStorageClient.putObject(request);
                urls.add(objectStorageClient.getUrl(BUCKET_NAME,fileName).toString());

            }catch (IOException e){
                throw new RestApiException(ImageErrorCode.FAILED_UPLOAD);
            }

        }
        return urls;
    }
}
```

서비스 로직을 간단하게 설명하면 다음과 같다.

-   **QuestionServiceImpl**과 **AnswerServiceImpl**에서 의존성을 주입받아 **putFileBucket**메서드를 이용하여 한 번의 POST API 요청으로 질문과 답변의 내용과 함께 **MultiFile** 형태로 이미지 업로드를 진행한다.
-   매개변수 type에 질문에서의 이미지 업로드인지 답변에서의 이미지 업로드인지 구별하기 위해 String으로 **ANSWER**, **QUESTION**를 명시한다.
    -   type를 생각할 때도 Boolean이나 ENUM를 사용하는 것도 생각해봤는데 우선은 2가지 경우만 존재하니 ENUM은 과도한 클래스 생성이라고 생각했다. Boolean 같은 경우 다른 사람이 내 코드를 사용할 때 해당사항을 알지 못하면 어려움이 존재할 것이라고 생각하여 가장 직관적인 String으로 사용하였다.
    -   나중에 서비스 확장시에는 ENUM으로 관리하여 유지보수성을 높이는 방안이 좋을 듯 싶다.
-   List형식의 이미지를 제공받아 for문을 통해 모든 이미지 파일의 메타데이터를 저장한다.
-   UUID형식으로 이미지의 파일명을 생성하고, **AWS S3 라이브러리**의 **PutObjectRequest** 객체를 이용하여 생성한 파일이름과 함께 파일을 업로드한 후 업로드한 파일이름을 다른 서비스 계층에서 DB에 저장하기 위해 String 리스트로 반환한다.

![](https://blog.kakaocdn.net/dna/KYeU8/btsPAYkGCZP/AAAAAAAAAAAAAAAAAAAAAGYjxs--UvJBZ0DXPqO5wKwk_8Ryx262fYnS60d1ob-h/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=Pl%2BvVX9sCT95iZI25h1i7%2B6b0Fg%3D)

업로드된 이미지

여기까지는 문제가 없었다. 이전에 이미지 업로드를 경험해보기도 하였고 AWS를 작년에 조금 많이 써보다보니 큰 이슈없이 금방 구현할 수 있었다.

> 여기서 문제점이 위의 코드들은 외부 라이브러리를 통해 구현이 되는데 테스트 코드를 어떻게 작성해야하는가이다.❗️❗️❗️❗️❗️

## **3\. 결과**

* * *

1.  기존 외부라이브러리 구현이 되어 있는 **AWS S3 Client**를 직접 **service interface**와 **serviceImpl**로 분할하여 구현한다.
    -   기존 **AmazonClient** 대신 직접 구현한 **AmazonS3Service**를 주입한다

```
public interface AmazonS3Service {
    void putObject(PutObjectRequest request);
    URL getUrl(String bucketName, String fileName);
}
```

```
@RequiredArgsConstructor
@Service
public class AmazonServiceImpl implements AmazonS3Service{
    private final AmazonS3Client amazonS3Client;

    @Override
    public void putObject(PutObjectRequest request) {
        amazonS3Client.putObject(request);
    }

    @Override
    public URL getUrl(String bucketName, String fileName) {
        return amazonS3Client.getUrl(bucketName,fileName);
    }
}
```

```
@Service
@RequiredArgsConstructor
public class ImageServiceImpl implements ImageService {
    private static final String BUCKET_NAME="quampus";
    private static final String DIRECTORY_OF_QUESTION="/question";
    private static final String DIRECTORY_OF_ANSWER="/answer";
    private final AmazonS3Service objectStorageClient;
    @Override
    public List<String> putFileToBucket(List<MultipartFile> files, String type) {
        //질문하기 디렉토리
        String FILE_DIRECTORY="";
        List<String> urls=new ArrayList<>();
        //TODO:testCode작성
        if(type.equals("QUESTION")){
            FILE_DIRECTORY=BUCKET_NAME+DIRECTORY_OF_QUESTION;
            //답변하기 디렉토리
        } else if (type.equals("ANSWER")) {
            FILE_DIRECTORY=BUCKET_NAME+DIRECTORY_OF_ANSWER;
        }
        for (MultipartFile file:files){
            ObjectMetadata objectMetadata=new ObjectMetadata();
            objectMetadata.setContentType(file.getContentType());
            objectMetadata.setContentLength(file.getSize());

            String fileName= UUID.randomUUID()+"_"+file.getOriginalFilename();
            try {
                //사진 업로드 및 url저장
                PutObjectRequest request=new PutObjectRequest(FILE_DIRECTORY,fileName,file.getInputStream(),objectMetadata);
                objectStorageClient.putObject(request);
                urls.add(objectStorageClient.getUrl(BUCKET_NAME,fileName).toString());

            }catch (IOException e){
                throw new RestApiException(ImageErrorCode.FAILED_UPLOAD);
            }

        }
        return urls;
    }
}
```

2\. 테스트 코드는 아래와 같이 성공케이스와 실패케이스로 분할하여 구성하였다.

```
@SpringBootTest
class ImageServiceImplTest {

    @Autowired
    private ImageService imageService;

    @MockitoBean
    private AmazonS3Service amazonS3Service;

    @Mock
    private MultipartFile multipartFile;
    //버킷 이름
    private static final String FILE_BUCKET_NAME="quampus";

    //파일 이름 설정
    private static final String FILE_URL="https://quampus.kr.object.ncloudstorage.com/test.jpg";
    private static final String FILE_NAME="test.jpg";
    @Test
    @DisplayName("[성공케이스]-이미지 업로드 성공시 Url를 반한합니다.")
    void imageUpload_SUCCESS() throws IOException {
        //given
        byte[] fileContent="fakeFile".getBytes();
        InputStream inputStream = new ByteArrayInputStream(fileContent);

        when(multipartFile.getContentType()).thenReturn("image/jpeg");
        when(multipartFile.getSize()).thenReturn((long)fileContent.length);
        when(multipartFile.getOriginalFilename()).thenReturn(FILE_NAME);
        when(multipartFile.getInputStream()).thenReturn(inputStream);

        doNothing().when(amazonS3Service).putObject(any(PutObjectRequest.class));
        when(amazonS3Service.getUrl(eq(FILE_BUCKET_NAME),any())).thenReturn(new URL(FILE_URL));

        //when
        List<String> resultUrls=imageService.putFileToBucket(List.of(multipartFile),"ANSWER");

        //then
        assertNotNull(resultUrls);
        assertThat(resultUrls).hasSize(1);
        assertThat(resultUrls.get(0)).isEqualTo(FILE_URL);

        verify(amazonS3Service,times(1)).putObject(any(PutObjectRequest.class));
        verify(amazonS3Service,times(1)).getUrl(eq(FILE_BUCKET_NAME),any(String.class));
    }
    @Test
    @DisplayName("[실패케이스]-이미지 업로드 실패시 예외를 반한합니다.")
    void imageUpload_FAILED() throws IOException {
        //given
        byte[] fileContent="fakeFile".getBytes();
        InputStream inputStream = new ByteArrayInputStream(fileContent);

        when(multipartFile.getContentType()).thenReturn("image/jpeg");
        when(multipartFile.getSize()).thenReturn((long)fileContent.length);
        when(multipartFile.getOriginalFilename()).thenReturn(FILE_NAME);
        when(multipartFile.getInputStream()).thenReturn(inputStream);

        //실패 상황 예외던지기
        when(multipartFile.getInputStream())
                .thenThrow(new IOException());

        //when then
        RestApiException exception = assertThrows(RestApiException.class, () ->
                imageService.putFileToBucket(List.of(multipartFile), "ANSWER"));

        assertThat(exception.getMessage()).isEqualTo("이미지 업로드를 실패했습니다.");
    }
}
```

-   실제 AWS S3 이미지 API를 호출하여 비용을 소모하는 방법보다 **@MockitoBean**를 이용하여 가짜 의존성을 주입하여 테스트를 진행했다.

```
when(multipartFile.getContentType()).thenReturn("image/jpeg");
        when(multipartFile.getSize()).thenReturn((long)fileContent.length);
        when(multipartFile.getOriginalFilename()).thenReturn(FILE_NAME);
        when(multipartFile.getInputStream()).thenReturn(inputStream);
```

-   **MutipartFile**를 직접 만들지 않고 **@Mock**를 이용하여 가짜객체로 사용함으로써 실제 서비스에 작동할 때 호출되는 메서드에 대해 예측값들을 미리 넣어준다.
-   서비스단에서 **AmazonS3Service**의 메서드 **putObject**, **getUrl**이 각각 1번씩 호출되었는지 확인하고 성공 케이스 테스트를 종료한다.
-   이미지 업로드 예외인 **IOException**값을 **RestApiException**으로 예외를 제대로 던지는지 확인하고 해당 예외처리 메시지를 확인하며 테스트를 종료한다.

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 8 }

공유하기
