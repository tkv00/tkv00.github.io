---
title: "[Vero] NoOffset + Slice 무한 스크롤 구현하기"
date: 2025-07-26
legacyUrl: "https://codekim3570.tistory.com/10"
---**해당 글은 노션에 작성한 글을 티스토리로 재게시했습니다.**

## **1\. 배경**

* * *

![](https://blog.kakaocdn.net/dna/M0y8N/btsPAxnwSRA/AAAAAAAAAAAAAAAAAAAAAKIVXUDIPo1IpP2XB3uzhedAiLXnk3JNOThFjUhJoVUq/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=KxCQ8o98mAAVzQX%2FEQHavJOabco%3D)

Vero LLM 대화 이미지(1)

![](https://blog.kakaocdn.net/dna/bqaySD/btsPAkILfYd/AAAAAAAAAAAAAAAAAAAAAPq7pN3mmosAPOcnzZix_4N-SujQL8lMktjOeK_Nkasf/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=ilBnbcpWUZLKWK9WRSkTEcRjpy4%3D)

Vero LLM 대화 이미지(2)

위 사진들과 같이 **Vero**의 주요 기능인 다양한 **LLM**과의 대화부분에서 이전 채팅 내용을 불러와야 하는 부분이 존재했다.

## **2\. 해결과정**

* * *

### **익숙한 방법 그대로?**

처음에는 채팅 데이터를 각 테이블들의 Join을 통해서 한 번에 전체 채팅내용을 한 번에 조회하는 방법을 고려했다. 그러나 불러와야 하는 채팅의 양이 많이 존재한다면 데이터를 받는 Client는 이를 필터링하고 관리하는 데 큰 부담이 존재한다. 서버측에서도 모든 데이터를 한 번에 넘겨준다면 응답시간이 길어진다는 많은 단점이 존재할 거라 판단되었다.

### **QueryDsl의 페이징으로?**

그 다음으로 고려한 방법은 QueryDsl 기반의 페이징 쿼리를 이용하는 방법이다. 페이징을 사용한다면, 데이터를 한 번에 모두 가져오는 대신 Client가 요청한 크기만큼만 데이터를 반환할 수 있어 Client는 데이터를 관리하는데 편의성을 가져갈 수 있다. 하지만 이 방식에도 한계가 존재한다. 결국 앞선 방식과 마찬가지로 채팅의 모든 데이터를 조회한 후 offset를 통해 Client가 원하는 size만큼만 데이터를 반환한다. 이 과정에서 서버는 결국 여전히 많은 양의 데이터를 처리하고 응답해야 하기 때문에 응답시간이 길어질 수밖에 없다. 페이징 방식 역시 성능측면에서 최적화가 필요한 상황임을 알 수 있었다.

### **NoOffset + Slice?**

위의 2가지 방식의 단점을 생각한 후 NoOffset + Slice 방식으로 접근하였다. 이 방법은 offset을 사용하지 않고 이전 데이터를 기준으로 특정 크기만큼 데이터를 슬라이스하여 반환하는 방식이다. Client가 더 효율적으로 데이터를 받을 수 있도록 하며 응답시간과 데이터 가공면에서 더 나은 성능을 기대할 수 있다. 서버는 필요한 데이터만을 가져오고 Client는 이전 데이터를 기반으로 새로운 데이터를 요청하게 되어 전체 데이터의 양을 한 번에 처리하지 않아도 되므로 성능의 개선점이 뚜렷하다고 판단했다.

## **3\. 결과**

* * *

```
 @Override
    public ChatTotalDetailResponseDto getSliceOfChatting(Long chatRoomId, Long chatId,Long memberId,int size,AIModelType type) {
        //채팅 상세 목록 조회
        List<ChatDetailResponseDto> chatDetailDtoList=queryFactory
                .select(new QChatDetailResponseDto(
                        chat.chatId,
                        chat.question,
                        chat.answer,
                        chat.createdAt
                ))
                .from(chat)
                .innerJoin(chat.chatRoom,chatRoom)
                .innerJoin(chatRoom.member,member)
                .where(allEq(chatRoomId,chatId,memberId,type))
                .orderBy(chat.chatId.desc())
                .limit(size)
                .fetch();

        // 결과가 비어 있는 경우
        if (chatDetailDtoList.isEmpty()) {
            return ChatTotalDetailResponseDto.builder()
                    .lastChatId(chatId)
                    .array(Collections.emptyList())
                    .build();
        }

        ChatTotalDetailResponseDto responseDto=ChatTotalDetailResponseDto
                .builder()
                .lastChatId(chatDetailDtoList.get(chatDetailDtoList.size()-1).getChatId())
                .array(chatDetailDtoList)
                .build();

        return responseDto;
    }
```

-   **NoOffset** 방식을 이용하여 채팅 목록을 불러온다.
-   채팅 ID, 질문 내용, 답변 내용, 생성 일자의 정보를 조회한다.
-   각 채팅방에 속한 채팅과 요청을 보낸 유저의 정보를 아래의 **Boolean Builder** 조건에 맞게 **Join**한다.
-   **DataBase**에 존재하는 채팅 리스트의 크기를 측정하지 않고 **client**에서 요청한 **size**만큼 데이터를 조회 후 반환한다.
-   **client**가 스크롤을 통해 추가 API 요청 시 **lastChatId**와 함께 다음 데이터를 반환한다.

* * *

### **Boolean Builder 메서드**

#### **memberIdEq**

```
   private BooleanExpression memberIdEq(Long memberId){
        return memberId==null ? null : member.memberId.eq(memberId);
    }
```

-   유저의 Id값의 일치 여부를 확인한다.

#### **chatRoomIdEq**

```
 private BooleanExpression chatRoomIdEq(Long chatRoomId){
        return chatRoomId == null ? null : chatRoom.chatRoomId.eq(chatRoomId);
    }
```

-   채팅방의 Id값의 일치 여부를 확인한다.

#### **gtChatId**

```
private BooleanExpression gtChatId(Long chatId){
        return (chatId != null && chatId > 0) ? chat.chatId.lt(chatId) : null;
    }
```

-   Client에서 보낸 마지막 chatId에 대해 null이 아니고 chatId>0의 조건이 참일 경우 chatId보다 작은 chat.chatId를 필터링한다.

#### **aiTypeEq**

```
private BooleanExpression aiTypeEq(AIModelType ai){
        return ai==null ? null : chat.modelType.eq(ai);
    }
```

-   사용자가 요청한 대화목록에 대해 특정 LLM 종류와 일치하는지 확인한다.

#### **allEq**

```
private BooleanExpression allEq(Long chatRoomId, Long chatId, Long memberId,AIModelType type) {
        BooleanExpression condition = chatRoomIdEq(chatRoomId);
        BooleanExpression chatCondition = gtChatId(chatId);
        BooleanExpression memberCondition = memberIdEq(memberId);
        BooleanExpression aiTypeCondition=aiTypeEq(type);

        BooleanExpression result = null;

        if (condition != null) {
            result = condition;
        }
        if (chatCondition != null) {
            result = (result != null) ? result.and(chatCondition) : chatCondition;
        }
        if (memberCondition != null) {
            result = (result != null) ? result.and(memberCondition) : memberCondition;
        }
        if(aiTypeCondition!=null){
            return (result!=null) ? result.and(aiTypeCondition) : aiTypeCondition;
        }

        return result;
    }
```

-   위의 **memberIdEq,gtChatId,chatRoomId,aiTypeEq**의 결합된 조건을 반환한다.

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 10 }

공유하기
