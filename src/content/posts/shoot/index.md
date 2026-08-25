---
title: "[Shoot"
date: 2025-09-05
legacyUrl: "https://codekim3570.tistory.com/15"
---## **1\. 배경**

* * *

Shoot-Pointer 프로젝트를 진행하던 중 유저가 자신의 하이라이트 영상을 올릴 수 있는 게시판을 구현하던 중에 좋아요의 개수를 Post 테이블에서 관리하면서 동시성 문제가 발생할 것 같다고 예상할 수 있었습니다. 동시에 여러명의 클라이언트가 요청을 보내게 되면 좋아요의 개수에 대한 **정합성** 문제가 발생할 수 있습니다. 물론, 좋아요의 개수를 증가시키고 좋아요 객체를 생성하는 서비스 로직에서 **@Transactinal** 애노테이션을 통해 하나의 단위 작업으로 설정하였지만, 이는 여러 스레드 환경에서는 데이터 **정합성**을 보장할 수 없습니다. 멀티 스레드 환경에서의 이러한 문제를 도식화하면 아래와 같습니다.

![](https://blog.kakaocdn.net/dna/bNPjdv/btsQl2sShGD/AAAAAAAAAAAAAAAAAAAAANHBNmtWvqrvACgRKQCAXV4FEDw_mcEjp5VIZfmLuYEa/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=MRPhlwHGwIn6%2BpiOzmo%2BCpGYBQs%3D)

동시성 문제

**ExecutorService**와 **CountDownLatch**를 이용하여 아래와 같은 시나리오로 좋아요의 개수를 증가시켜 보겠습니다.

> 10,000 명의 유저가 동시에 좋아요 요청을 보냅니다.

**👇 테스트 코드 보기**

더보기

동시성 제어를 하지 않은 코드

```
@SpringBootTest
@ActiveProfiles("test")
class LikeManagerConcurrencyTest {
    @Autowired
    private LikeManager likeManager;

    @Autowired
    private LikeHelper likeHelper;

    @Autowired
    private PostHelper postHelper;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private PostCommandRepository postCommandRepository;

    @Autowired
    private PostQueryRepository postQueryRepository;

    @Autowired
    private LikeCommandRepository likeCommandRepository;

    /**
     * 좋아요할 게시물 Id
     */
    private static Long postId;
    private static final List<Member> memberList=new ArrayList<>();

    @BeforeEach
    void setUp(){
        /**
         * 더미 게시판 작성.
         */
        Member savedMember=memberRepository.saveAndFlush(makeMockMember());
        postId=postCommandRepository.saveAndFlush(makeMockPost(savedMember)).getPostId();

        /**
         * 더미 멤버 삽입
         */
        for (int i=0;i<INF;i++){
            memberList.add(memberRepository.save(makeMockMember()));
        }
    }

    @AfterEach
    void tearDown(){
        likeCommandRepository.deleteAll();
        postCommandRepository.deleteAll();
        memberRepository.deleteAll();
    }

    private final int INF=10000;
    @Test
    @DisplayName("동시에 10000개의 요청으로 좋아요 수를 증가시킵니다.")
    void increate_10000_request_of_like() throws InterruptedException {
        //given
        final int threadCount=INF;
        final ExecutorService executorService= Executors.newFixedThreadPool(32);
        final CountDownLatch countDownLatch=new CountDownLatch(threadCount);

        //when
        for (int i=0;i<threadCount;i++){
            final int idx=i;
            executorService.submit(()->{
                try {
                    likeManager.increase(postId,memberList.get(idx));
                }finally {
                    countDownLatch.countDown();
                }
            });
        }
        countDownLatch.await();
        final PostEntity post=postQueryRepository.findByPostId(postId).orElseThrow();

        //then
        assertThat(post.getLikeCnt()).isEqualTo(INF);
    }
```
