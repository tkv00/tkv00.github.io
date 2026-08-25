---
title: "[Vero] SMS 인증 서비스의 관심사 분할"
date: 2025-08-09
legacyUrl: "https://codekim3570.tistory.com/12"
---해당 글을 노션에 작성한 글을 티스토리로 재게시했습니다.

## **1\. 배경**

* * *

```
@Service
@RequiredArgsConstructor
public class SmsServiceImpl implements SmsService{
    @Value("${coolsms.api.key}")
    private String apiKey;
    @Value("${coolsms.api.secret}")
    private String apiSecretKey;
    @Value("${coolsms.api.senderNumber}")
    private String sendNumber;

    private DefaultMessageService messageService;
    private SmsUtil smsUtil;
    private final RedisCustomServiceImpl redisCustomService;
    private final String SMS_PREFIX="sms: ";

    @PostConstruct
    private void init(){
        this.messageService= NurigoApp.INSTANCE.initialize(apiKey,apiSecretKey,"https://api.coolsms.co.kr");
    }
    @Override
    public SingleMessageSentResponse sendOne(String to, String verificationCode) {
        Message message=new Message();
        message.setFrom(sendNumber);
        message.setTo(to);

        message.setText("[Vero AI]\n아래의 휴대폰 인증번호를 입력해주세요\n✅ "
                + verificationCode + " ✅\n(5분 내 입력해 주세요)");
        SingleMessageSentResponse response=this.messageService.sendOne(new SingleMessageSendingRequest(message));
        return response;
    }

    @Override
    public void sendSms(SmsCertificationRequestDto smsCertificationRequestDto) {
        String to=smsCertificationRequestDto.getPhoneNumber();
        String random= CreateRandom.createRandomNumber();
        smsUtil.sendOne(to,random);
        redisCustomService.saveRedisData(SMS_PREFIX+to,smsCertificationRequestDto.getCertificationCode(), (long) (5*60));
    }

    @Override
    public void verifySms(SmsCertificationRequestDto smsCertificationRequestDto) {
        if(isVerify(smsCertificationRequestDto)){
            throw new RestApiException(MemberErrorCode.INVALID_CERTIFICATION_CODE);
        }
        //인증번호 검증 완료시
        String VALIDATION_PREFIX = "cer: ";
        redisCustomService.saveRedisData(VALIDATION_PREFIX +smsCertificationRequestDto.getPhoneNumber(),"TRUE", (long) (10*60));
        redisCustomService.deleteRedisData(SMS_PREFIX+smsCertificationRequestDto.getPhoneNumber());
    }

    private boolean isVerify(SmsCertificationRequestDto smsCertificationRequestDto) {
        return !(redisCustomService.hasKey(SMS_PREFIX+smsCertificationRequestDto.getPhoneNumber())&&
                redisCustomService.getRedisData(SMS_PREFIX+smsCertificationRequestDto.getPhoneNumber())
                        .equals(smsCertificationRequestDto.getCertificationCode())
        );
    }
}
```

#### 주요 메서드 설명.

-   **void init()**
    -   **NurigoApp** 라이브러리를 이용하여 **coolsms**의 **message** **api** 초기화 메서드.
-   **SingleMessageSentResponse sendOne(String to, String verificationCode)**
    -   **coolsms api**의 단건 메세지 전송 객체를 생성하는 메서드.
-   **sendSms(SmsCertificationRequestDto smsCertificationRequestDto)**
    -   **SmsCertificationRequestDto**로 받은 유저의 휴대폰 번호로 랜덤숫자 6자리를 발송하고, **redisCustomService**에 구현된 **'key=sms: 01012345678, value=랜덤숫자 6자리'**의 형태로 **redis**에 저장
-   **VerifySms(SmsCertificationRequestDto smsCertificationRequestDto)**
    -   -   **SmsCertificationRequestDto**로 받은 유저의 **휴대폰 번호**와 **인증번호 6자리**를 **isVerify**메서드에서 **true**값 즉,
            1.  해당 유저의 휴대폰 번호로 하는 키가 존재하지 않는 경우.
            2.  해당 유저의 휴대폰 번호로 하는 **redis server**에 존재하는 키값의 value가 유저가 전송한 데이터(**smsCertificationRequestDto**)의 인증번호와 일치하지 않는 경우.
        -   위 2가지 경우 중 위배되는 경우 **Custom 예외 처리**로 다음과 같은 에러 메세지를 클라이언트에게 반환.
        -   예외처리를 통과한 경우 유저가 회원가입하는 과정에서 아래의 2가지 경우를 만족해야 하는데 2가지 경우 중 1개의 값에 대해 **'key=cer: 01012345678, value=TRUE'** 값을 **redis server**에 저장.
            -   1.  이메일 인증 유효
                2.  휴대폰 메시지 인증 유효

![](https://blog.kakaocdn.net/dna/TmnMl/btsPLideu8J/AAAAAAAAAAAAAAAAAAAAAAKmfDNBeliXdXtLH8LA7k48jCAuVIYRsaFqEvlSWI9A/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=pTeG6C5P2hhNQIP0UlDltKtorH8%3D)

Custom 예외 처리 에러 메세지

> 얼핏 보면 괜찮은 코드이며 서비스 계층에서 구현할만한 메서드들의 관계입니다. sms서비스단의 큰 흐름은 '유저의 휴대폰 번호로 인증 메세지를 보내고 인증을 확인한다' 라는 과정입니다.  
>   
> 여기서⚠️문제⚠️가 해당 서비스는 sms전송 + 인증이라는 2가지의 책임을 담당하는데 이는 **SRP(Single Responsibility Principle:단일 책임 원칙)**에 위배되는 Architecture입니다.

## **2\. 해결과정**

* * *

2가지의 해결방법이 떠올랐습니다.

1.  옵저버 패턴을 이용하여 sms전송에 따라 **smsServiceImpl**를 비동기적으로 처리하는 방법.
2.  sms 형식을 단순히 생성하고, 전송을 담당하는 **smsServiceImpl** **클래스**와 **redis server**를 이용하여 **sms 인증처리**를 담당하는 **smsVerificationService 클래스**의 분할로 역할을 분할하는 방법. 

> 1번 방법으로 결정하였습니다. 추후에 다시 사용할 **sms 서비스**같은 경우 비밀번호 재발행, 아이디 찾기 정도인데 다음과 같은 경우는 sms으로 해당 값을 전송할 뿐 **redis server**에 해당 값을 저장하는 **Event**가 발생하지 않습니다. 또한, 위와 같은 sms관련 서비스 구현을 위해 **MemberController**와 **MemberService**에서의 sms로직을 다루는 것이 아니라 따로 분할해야 한다고 생각했습니다.

## **3\. 구현**

* * *

#### SmsVerificationService 인터페이스

```
public interface SmsVerificationService {
    void verifySms(SmsCertificationRequestDto smsCertificationRequestDto);
}
```

#### SmsVerificationServiceImpl

```
@Service
@RequiredArgsConstructor
public class SmsVerificationServiceImpl implements SmsVerificationService{
    private final RedisCustomService redisCustomService;
    private final String SMS_PREFIX="sms: ";
    @Override
    @Transactional(readOnly = true)
    public void verifySms(SmsCertificationRequestDto smsCertificationRequestDto) {
        if(isVerify(smsCertificationRequestDto)){
            throw new RestApiException(MemberErrorCode.INVALID_CERTIFICATION_CODE);
        }
        //인증번호 검증 완료시
        String VALIDATION_PREFIX = "cer: ";
        redisCustomService.saveRedisData(VALIDATION_PREFIX +smsCertificationRequestDto.getPhoneNumber(),"TRUE", (long) (10*60));
        redisCustomService.deleteRedisData(SMS_PREFIX+smsCertificationRequestDto.getPhoneNumber());
    }

    private boolean isVerify(SmsCertificationRequestDto smsCertificationRequestDto) {
        return !(redisCustomService.hasKey(SMS_PREFIX+smsCertificationRequestDto.getPhoneNumber())&&
                redisCustomService.getRedisData(SMS_PREFIX+smsCertificationRequestDto.getPhoneNumber())
                        .equals(smsCertificationRequestDto.getCertificationCode())
        );
    }
}
```

sms 인증번호 검증 행위는 **SmsVerificationServiceImpl**에서만 실행하고 sms를 보내는 행위는 **SmsService**에서만 실행됩니다.

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 12 }

공유하기
