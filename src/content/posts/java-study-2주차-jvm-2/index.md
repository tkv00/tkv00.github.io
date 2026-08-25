---
title: "[JAVA-STUDY] 2주차 - JVM 2"
date: 2026-02-03
legacyUrl: "https://codekim3570.tistory.com/27"
---# 📘 1. 힙 영역

## 1) 힙 영역 -  Heap Area

: JVM이 관리하는 프로그램상에서 데이터를 저장하기 위해 런타임 시 동적으로 할당하여 사용하는 영역. new 연산자로 생성되는 객체와 배열이 생성되는 영역.

> **Q. static이 아니라 new 생성자, 메서드들도 Heap영역에 저장하는 이유?**  
>   
> **A.** 클래스가 로딩될 때, 클래스의 모든 메서드 정보가 메서드 영역에 저장됨. 이 클래스를 이용하여 인스턴스를 사용할 때마다 heap 영역에 고유 주소값을 가진 인스턴스가 저장. 클래스라는 설계도를 가지고 생성된 객체들은 설계도에 적힌 메서드를 사용한다. 만약, 메서드 영역에 생성자, 메서드를 저장하지 않는다면 heap 영역에 있는 인스턴스들이 메서드 호출마다 메모리에 접근하게 되어 성능 저하 발생.

-   단 하나의 Heap영역이 생성되어 모든 스레드가 공유하는 자원.
-   method Area 영역에 저장된 클래스만을 생성 되어 적재.
-   가비지 컬렉션의 대상이 되는 공간.
-   생명주기는 JVM이 동작하고 클래스가 로딩된 후 GC에 의해 제거의 대상이 되지 않는다면 프로그램이 종료될 때까지.
-   힙 영역에 생성된 객체와 배열은 **Reference Type**으로 **JVM 스택 영역의 변수**나 다른 객체의 필드에서 참조됨.
-   메모리가 초과되는 경우 ⇒ OOM 발생(Out Of Memory Error)
-   속도 : Stack > Heap ⇒ 가비지 컬랙션과 같은 Stack보다 더 복잡한 메모리 관리를 요구하기 때문에 Heap이 Stack보다 느리다.

![](https://blog.kakaocdn.net/dna/cbAdxy/dJMcafFs4I6/AAAAAAAAAAAAAAAAAAAAADP9A2cH7W7HTeBo8iEQ7xQsCUqMiArKKfgfh9plPe_q/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=Y%2FWcIDyAry3Z6VenrZt2qQZnu%2F0%3D)

**👇힙 영역과 스택영역의 관계 - Gemini**

더보기

**Heap Area**(실제 물건) / **Stack Area**(물건을 가르키는 리모컨)

-   **Heap Area**
    -   덩치가 크고 가변적인 데이터(객체, 배열) 저장.
-   **Stack Area**
    -   덩치가 작고 실행이 끝나면 바로 사라지는 데이터(참조 변수, 지역 변수) 저장.

```
public void method(){
	int age = 24;                      //기본 타입
	String name = new String("hello"); //참조 타입
	int[] scores = {20, 30, 40};       //배열(참조 타입)
}

=> name 변수 자체에는 "hello"라는 글자가 들어가 있지 않음
```

-   **힙** : 힙 영역의 빈 공간에 실제 **데이터 객체**가 생성, 이때, 해당 객체는 **메모리 주소**(예. 0x100)를 가짐.
-   **스택** : name이라는 **변수 공간**이 생기고, 여기에 실제 데이터 대신 **힙**에 있는 객체 주소값(0x100) 저장.
