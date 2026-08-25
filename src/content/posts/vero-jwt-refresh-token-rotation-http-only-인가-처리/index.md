---
title: "[Vero] JWT+Refresh Token Rotation+HTTP Only 인가 처리"
date: 2025-07-08
legacyUrl: "https://codekim3570.tistory.com/3"
---## **1.배경**

* * *

보안을 주제로 하는 웹/앱 공모전 중 우리 플랫폼의 세부주제는 **AI 보안 솔루션제공**이다. 따라서, 기업 또는 개인이 **Vero**를 안전하게 사용할 수 있도록 가장 첫 번째 단계인 회원가입과 로그인 단계에서부터 보안성을 강화하는 것이 중요하다. 현재 가장 안전한 회원가입/로그인 방법으로는 **OAuth 2.0** 방식이 널리 사용된다. 이 방식은 쉽게 말하면 SNS 로그인이고 개발 플랫폼에 알맞는 외부 어플리케이션(Naver,Google,Kakao)이 해당 어플리케이션의 인증과정을 대신 처리해주는 방식이다. 사실 **Kakao로그인**을 **Vero**에 적용하고자 하였지만 이전 프로젝트 경험 중 구현하는데 있어 많은 시간을 허비한 경험이 있어 약 1달 정도남은 시점에서 **Kakao로그인**을 구현하는 것보다는 기존 해오던 방식(JWT:Json Web Token)을 유지하면서 보안적으로 좀 더 강화된 회원가입과 로그인을 진행하자는 백엔드 팀원 박재성과의 논의를 통해 결정한 사항이다.

그렇다면 어떤 방식으로 기존 **JWT**만을 이용하던 방법에서 보안을 더욱 강화하여 토큰의 탈취 위험을 줄이는 방법은 무엇이 있을까?

수많은 **구글링**과 **Spring Security in Action** 책을 참고하여 5가지 방식을 추가하도록하였다.

> Refresh Token + RTR(Refresh Token Rotation)기법 + HTTP Only + CoolSms인증 + Google Gmail 이메일 인증

## **2.해결과정**

* * *

#### **기존 JWT만의 문제점**

**AccessToken**은 발급된 이후 별도로 서버에 저장되지 않고 자체적인 검증을 통해 사용자 권한을 인증하는 **stateless**한 특징이 있다. 하지만 이러한 **stateless** 특징 때문에 **AccessToken**이 해커에 의해 탈취된다면해당 토큰을 가진 해커는 사용자 권한을 행사할 수 있는 보안 취약점이 발생할 수 있어 이러한 문제점을 보완하기 위해서 **AccessToken**의 만료 기간을 짧게 설정하는 것이 일반적인 보안 전략이다.

**AccessToken**의 만료기간이 짧게 된다면 사용자가 짧은 주기로 재 로그인을 진행해야 되기 때문에 사용자 편의성이 저하될 수 있다.이러한 사용자 불편을 해결하기 위해 만료기간이 **AccessToken**보다 긴 **RefreshToken**을 적용했다.

* * *

#### **Refresh Token은 어디에서 관리하는가?**

**RefreshToken**을 관리하는 방법에는 여러 가지가 있지만 제일 먼저 생각나는 방법은 **MySQL** 기반의 **RDB**저장, **Redis**와 같은 **인메모리 데이터** 저장소를 활용하는 방법이였다.

각 사용자별로 로그인 할 때 **RefreshToken**를 조회해서 유효성을 검사한 후 새로운 **RefreshToken**의 발급과 이를 DB에 저장하는 동시에 이전 **RefreshToken**은 삭제한다. 이러한 과정에서 빈번한 조회,삭제 연산등이 발생하는데 **key-value**형식의 **Redis**를 활용하면 속도에서의 이점과 함께 서버 리소스 부담을 줄이는 이점도 얻을 수 있다고 생각하여 **Redis**를 통한 **RefreshToken**관리를 선택하였다. 여기서 드는 의문점이 하나 있지 않은가? 서버측에서는 위와 같은 방법으로 비교적 안전하게 **RefreshToken**를 저장하면되지만 **Client**는 어떻게 **RefreshToken**을 관리해야 하는가이다!

* * *

#### **Client에서 Refresh Token를 어떻게 저장하도록 하는가?**

**RefreshToken**를 저장하는 방법으로는 크게 3가지가 있다.

-   **로컬 스토리지**
    -   로컬스토리지는 클라이언트 측에서 데이터를 영구적으로 저장하는 방법으로 명시적으로 삭제하지 않는 한 계속해서 존재한다. 하지만 XSS(JavaScript 기반 악성코드를 브라우저에서 실행하도록 하는 공격) 공격에 취약하여, 악성 스크립트에 의해 로컬스토리지에 저장된 RefreshToken이 탈취될 수 있는 위험이 존재한다.
-   **세션 스토리지**
    -   세션 스토리지는 브라우저가 닫히면 데이터가 삭제되며, 같은 탭에서만 유효하다. 로컬스토리지에 비해 안전한 방식이지만 여전히 XSS공격에 취약하다.
-   **쿠키**

이 중 우리 서비스는 **쿠키**에 저장하는 방식을 선택했고 왜 쿠키 저장방식을 적용했는지는 아래와 같은 이유가 존재한다.

위의 2가지 방식의 취약점을 보완하기 위해 쿠키방식을 적용했다. 쿠키는 **HTTP**의 **stateless** 특성을 보완하기 위해 등장한 데이터 쪼가리로 모든 클라이언트 요청에 자동적으로 포함된다는 특징을 가지고 있다. 쿠키는 앞선 2가지 방식에서의 XSS 공격 취약점을 어느 정도 보완할 수 있으며 **HTTPOnly**와 **Secure**플래그도 함께 적용함으로써 JavaScript에서 쿠키에 접근할 수 없게 하고 **HTTPS** 연결에서만 쿠키가 전송되게 하여 \*\*중간자 공격(MITM)\*\*으로터 쿠키를 보호할 수 있게 하였다.

* * *

#### **Refresh Token의 탈취 위험은 어떻게 해결할 것인가?**

**AccessToken**의 탈취위험을 예방하기 위해 만료 기간을 짧게 설정하며 **RefreshToken**의 도입을 적용했다. 하지만 비교적 만료기간이 긴 **RefreshToken**의 탈취 가능성에 대한 문제는 어떻게 해결할 것인가? 바로 RTR(Refresh Token Rotation)기법을 적용하여 보완한다. 즉, 유효한 **RefreshToken**으로 사용자가 로그인을 요청할 때 **AccessToken**을 발급하는 동시에 새로운 **RefreshToken**를 발급하는 것이다.

전체 과정은 아래와 같다.

![](https://blog.kakaocdn.net/dna/Xiwh4/btsPa03wHtA/AAAAAAAAAAAAAAAAAAAAADPM5VlmYN6eCU4fUOYFqOjGUK49tK4p8p4g5jkTqvrw/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=1iYb3MimOsx9mzh33%2FOir8c5qZY%3D)

동작 과정

1.  사용자가 Vero에 로그인을 시도한다.
2.  서버는 로그인 성공 시 AccessToken과 Refresh토큰을 생성하고 RefreshToken은 Redis에 저장한다.
3.  생성한 AccessToken , RefreshToken를 사용자가 반환한다.
4.  Refresh Token를 클라이언트측의 HttpOnly쿠키방식으로 저장한다.
5.  만료된 AccessToken으로 요청한다.
6.  401 Error가 발생한다.
7.  사용자가 유효한 AccessToken과 RefereshToken으로 로그인을 시도한다.
8.  AccessToken에서 추출한 유저의 고유 ID값과 RefreshToken의 조합을 key값으로 하는 Redis의 value조회를 통해 유효한 Refresh Token인지 확인한다.
9.  새로운 AccessToken발급과 새 RefreshToken를 저장하며 이전 RefreshToken은 삭제한다.
10.  새로 발급된 Access Token를 사용자에게 반환한다.

## **3\. 구현**

* * *

유저가 로그인 성공 시 **accessToken**과 함께 성공메시지,코드를 반환한다.유저의 이름과 유저의 권한을 함께 반환함으로써 메인 페이지 상단에 위치한 유저 프로필 정보를 불러올 수 있도록 설계하였다.

```
@Getter
@Builder
public class AccessTokenResponseDto {
    private String accessToken;
    private String message;
    private Integer code;
    private String userName;
    private MemberStatus role;

}
```

\- **RefreshToken**의 유효기간을 3일로 설정.

\- 사용자의 RefreshToken를 \*\*“refresh 유저ID”\*\*형태의 key를 사용하여 저장한다.

\- 이때, 위에서 설정한 만료기간 3일이 지나면 자동으로 삭제된다.

\- **refresh \*패턴**으로 구성된 모든 **RefreshToken**을 삭제한다.

\- 여러 기기에서 로그인한 사용자의 모든 **RefreshToken**을 삭제함으로써 토큰을 만료시킨다.

```
@RequiredArgsConstructor
@Component
public class RefreshToken {
    private  final RedisCustomService redisCustomService;

    //Refresh Token 설정 시간 - 3일
    private static final Long REFRESH_EXPIRATION_TIME=259200000L;

    //리프레쉬 토큰 가져오기
    public String getRefreshToken(final String refreshToken){
        return Optional.ofNullable(redisCustomService.getRedisData(refreshToken))
                .orElseThrow(()->new RestApiException(SecurityErrorCode.NOT_EXIST_REFRESH_TOKEN));
    }
    //리프레쉬 토큰 저장
    //id : 유저 id값
    public void putRefreshToken(final String refreshToken,Long id){
        redisCustomService.saveRedisData("refresh "+id,refreshToken,REFRESH_EXPIRATION_TIME);
    }

    //리프레쉬 토큰 삭제
    public void removeRefreshToken(final Long id){
        redisCustomService.deleteRedisData("refresh "+id);
    }

    //유저의 리프레쉬 토큰 삭제
    public void removeUserRefreshToken(final Long id){
        Set<String> keys=redisCustomService.getKeysByPattern("refresh *");
        for (String key:keys){
            String storedId=redisCustomService.getRedisData(key);
            if(storedId!=null && storedId.equals("refresh "+id)){
                redisCustomService.deleteRedisData(storedId);
            }
        }
    }
}
```

```
 @Slf4j
@Component
public class JwtUtil {
    private final Key key;
    private final long accessTokenExpTime;

    public JwtUtil(
            @Value("${spring.jwt.secret}") String secretKey,
            @Value("${spring.jwt.expiration_time}") long accessTokenExpTime
    ) {
        byte[] keyBytes = Decoders.BASE64URL.decode(secretKey);
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.accessTokenExpTime = accessTokenExpTime;
    }
  	
  	jwt관련 로직 생략...
  	
  	
  	public String generateRefreshToken(final long id) {
        return doGenerateRefreshToken(String.valueOf(id));
    }

    public String doGenerateRefreshToken(final String id) {
        return Jwts.builder()
                .setId(id)
                .setExpiration(new Date(System.currentTimeMillis() + (long) 259200000))
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .compact();
    }
     public String doGenerateRefreshToken(final String id) {
        return Jwts.builder()
                .setId(id)
                .setExpiration(new Date(System.currentTimeMillis() + (long) 259200000))
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .compact();
    }
    
    ...
     
  }
```

### **AuthServiceImpl** - 인증 관련 비즈니스 로직 구현 크래스

코드가 길어 가독성이 떨어지므로 주요 메서드를 나누어서 설명하도록 하겠다.

### **loginMember** - 유저의 로그인을 처리하는 메서드

-   login의 전체과정이 아닌 RefreshToken 부분만 설명하도록 하겠다.
-   **memberId**로 기존 **RefreshToken**를 삭제한다.
-   새로운 **AccessToken**과 **RefreshToken**를 생성하고 **RefreshToken**을 **memberId**를 통해 구분하여 Redis에 저장한다.
-   쿠키의 **HttpOnly**설정을 통해 **RefreshToken**를 **Client**측의 쿠키형태로 저장하도록 한다.
-   **Client**에게 성공메시지 및 코드와 함께 **AccessToken**을 반환한다.

```
@Override
    public AccessTokenResponseDto loginMember(MemberLoginDto loginDto, HttpServletResponse response) {
        String email = loginDto.getEmail();
        String password = loginDto.getPassword();
        Member findMember = memberRepository.findByEmail(email).orElseThrow(
                () -> new RestApiException(AuthErrorCode.INVALID_EMAIL_OR_PASSWORD)
        );

        //계정 잠금 여부 확인
        if (findMember.isAccountLocked()) {
            throw new RestApiException(AuthErrorCode.IS_LOCKED);
        }

        customAuthenticationFailureHandler.filteringLoginAttempts(email);

        if (!encoder.matches(password, findMember.getPassword())) {
            throw new RestApiException(AuthErrorCode.INVALID_EMAIL_OR_PASSWORD);
        }

        CustomMemberInfoDto infoDto = new CustomMemberInfoDto(
                findMember.getMemberId(),
                email,
                password,
                findMember.getMemberStatus(),
                false
        );
        //기존 refresh 삭제
        refresh.removeUserRefreshToken(infoDto.getMemberId());

        //Jwt 토큰 생성
        String accessToken = jwtUtil.createAccessToken(infoDto);
        //Refresh token 생성
        String refreshToken = jwtUtil.generateRefreshToken(infoDto.getMemberId());

        //HTTP-ONL 쿠키 설정
        setRefreshToken(refreshToken, response);

        refresh.putRefreshToken(refreshToken, infoDto.getMemberId());

        //로그인 초과 기록 삭제
        if (redisCustomService.hasKey(PREFIX + email)) {
            redisCustomService.deleteRedisData(PREFIX + email);
        }

        return AccessTokenResponseDto.builder()
                .userName(findMember.getUserName())
                .accessToken(accessToken)
                .message("토큰 반환 성공")
                .code(200)
                .role(findMember.getMemberStatus())
                .build();
    }
```

### **refreshAccessToken** - RefreshToken를 이용하여 새로운 AccessToken발급

-   **checkRefreshToken** 메서드를 이용해 유효한 토큰인지 검증한다.
-   **RefreshToken**에서 **memberId**를 추출하여 **Redis**에 저장된 토큰과 비교하여 유효성을 한 번 더 검사한다.
-   현재 사용중인 사용자의 **RefreshToken**를 모두 삭제한다.
-   **memberRepository**에서 **memberId**를 이용하여 회원의 정보를 토대로 새로운 **AccessToken** 및 **RefreshToken**을 생성한다.

```
 @Override
    public AccessTokenResponseDto refreshAccessToken(String refreshToken, HttpServletResponse response) {
        //refresh Token 유효성 검증
        checkRefreshToken(refreshToken);

        //Redis에 리프레시 토큰 저장유무 확인
        Long memberId = jwtUtil.getMemberId(refreshToken);
        String storedToken = refresh.getRefreshToken(refreshToken);

        if (!refreshToken.equals(storedToken)) {
            throw new RestApiException(SecurityErrorCode.INVALID_TOKEN);
        }

        //기존 Refresh Token 삭제
        refresh.removeUserRefreshToken(memberId);

        //새 토큰 발급
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new RestApiException(MemberErrorCode.MEMBER_NOT_FOUND));
        CustomMemberInfoDto infoDto = CustomMemberInfoDto
                .builder()
                .memberId(memberId)
                .accountLocked(false)
                .memberStatus(member.getMemberStatus())
                .email(member.getEmail())
                .password(member.getPassword())
                .build();

        String newAccessToken = jwtUtil.createAccessToken(infoDto);
        String newRefreshToken = jwtUtil.generateRefreshToken(memberId);

        //새 Refresh 저장
        refresh.putRefreshToken(newRefreshToken, memberId);

        //새로운 Refresh 쿠키 설정
        setRefreshToken(refreshToken, response);

        return AccessTokenResponseDto
                .builder()
                .code(200)
                .accessToken(newAccessToken)
                .userName(member.getUserName())
                .message("엑세스 토큰 재발행 성공")
                .role(member.getMemberStatus())
                .build();
    }
```

### **setRefreshToken & checkRefreshToken**

**setRefreshToken**

-   쿠키의 만료시간을 RefreshToken의 만료기간인 3일로 동일하게 적용한다.
-   HttpOnly 속성과 secure(true)를 통해 HTTPS에서만 전송가능하도록 설정한다.

**checkRefreshToken**

-   전달받은 **RefreshToken**이 유효한 **JWT**인지 검증한다.
-   유효하지않은 경우 **RestApiException**를 통해 예외처리한다

```
private static void setRefreshToken(String refreshToken, HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", refreshToken)
                .path("/")
                .maxAge(3 * 24 * 60 * 60)
                .httpOnly(true)
                .secure(true)
                .sameSite("None")
                .build();

        response.addHeader("Set-Cookie",cookie.toString());
    }

    private void checkRefreshToken(String refreshToken) {
        if (Boolean.FALSE.equals(jwtUtil.validateToken(refreshToken))) {
            throw new RestApiException(SecurityErrorCode.INVALID_TOKEN);

        }
    }
```

더보기

전체 코드 보기

```
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthServiceImpl implements AuthService {
    private final JwtUtil jwtUtil;
    private final MemberRepository memberRepository;
    private final PasswordEncoder encoder;
    private final RefreshToken refresh;
    private final CustomAuthenticationFailureHandler customAuthenticationFailureHandler;
    private final RedisCustomService redisCustomService;
    private final String PREFIX = "login :";

    @Override
    public AccessTokenResponseDto loginMember(MemberLoginDto loginDto, HttpServletResponse response) {
        String email = loginDto.getEmail();
        String password = loginDto.getPassword();
        Member findMember = memberRepository.findByEmail(email).orElseThrow(
                () -> new RestApiException(AuthErrorCode.INVALID_EMAIL_OR_PASSWORD)
        );

        //계정 잠금 여부 확인
        if (findMember.isAccountLocked()) {
            throw new RestApiException(AuthErrorCode.IS_LOCKED);
        }

        customAuthenticationFailureHandler.filteringLoginAttempts(email);

        if (!encoder.matches(password, findMember.getPassword())) {
            throw new RestApiException(AuthErrorCode.INVALID_EMAIL_OR_PASSWORD);
        }

        //계정 잠금 유무 확인
        if (findMember.isAccountLocked()) {
            throw new RestApiException(AuthErrorCode.LOCKED_ACCOUT);
        }

        CustomMemberInfoDto infoDto = new CustomMemberInfoDto(
                findMember.getMemberId(),
                email,
                password,
                findMember.getMemberStatus(),
                false
        );
        //기존 refresh 삭제
        refresh.removeUserRefreshToken(infoDto.getMemberId());

        //Jwt 토큰 생성
        String accessToken = jwtUtil.createAccessToken(infoDto);
        //Refresh token 생성
        String refreshToken = jwtUtil.generateRefreshToken(infoDto.getMemberId());

        //HTTP-ONL 쿠키 설정
        setRefreshToken(refreshToken, response);

        refresh.putRefreshToken(refreshToken, infoDto.getMemberId());

        //로그인 초과 기록 삭제
        if (redisCustomService.hasKey(PREFIX + email)) {
            redisCustomService.deleteRedisData(PREFIX + email);
        }

        //기존 가지고 있는 사용자 refresh Token제거
        return AccessTokenResponseDto.builder()
                .userName(findMember.getUserName())
                .accessToken(accessToken)
                .message("토큰 반환 성공")
                .code(200)
                .role(findMember.getMemberStatus())
                .build();
    }

    @Override
    public AccessTokenResponseDto refreshAccessToken(String refreshToken, HttpServletResponse response) {
        //refresh Token 유효성 검증
        checkRefreshToken(refreshToken);

        //Redis에 리프레시 토큰 저장유무 확인
        Long memberId = jwtUtil.getMemberId(refreshToken);
        String storedToken = refresh.getRefreshToken(refreshToken);

        if (!refreshToken.equals(storedToken)) {
            throw new RestApiException(SecurityErrorCode.INVALID_TOKEN);
        }

        //기존 Refresh Token 삭제
        refresh.removeUserRefreshToken(memberId);

        //새 토큰 발급
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new RestApiException(MemberErrorCode.MEMBER_NOT_FOUND));
        CustomMemberInfoDto infoDto = CustomMemberInfoDto
                .builder()
                .memberId(memberId)
                .accountLocked(false)
                .memberStatus(member.getMemberStatus())
                .email(member.getEmail())
                .password(member.getPassword())
                .build();

        String newAccessToken = jwtUtil.createAccessToken(infoDto);
        String newRefreshToken = jwtUtil.generateRefreshToken(memberId);

        //새 Refresh 저장
        refresh.putRefreshToken(newRefreshToken, memberId);

        //새로운 Refresh 쿠키 설정
        setRefreshToken(refreshToken, response);

        return AccessTokenResponseDto
                .builder()
                .code(200)
                .accessToken(newAccessToken)
                .userName(member.getUserName())
                .message("엑세스 토큰 재발행 성공")
                .role(member.getMemberStatus())
                .build();
    }

   ...

    private static void setRefreshToken(String refreshToken, HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", refreshToken)
                .path("/")
                .maxAge(3 * 24 * 60 * 60)
                .httpOnly(true)
                .secure(true)
                .sameSite("None")
                .build();

        response.addHeader("Set-Cookie",cookie.toString());
    }

    private void checkRefreshToken(String refreshToken) {
        if (Boolean.FALSE.equals(jwtUtil.validateToken(refreshToken))) {
            throw new RestApiException(SecurityErrorCode.INVALID_TOKEN);

        }
    }
}
```
