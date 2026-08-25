---
title: "[JAVA-STUDY] 1주차"
date: 2026-01-04
legacyUrl: "https://codekim3570.tistory.com/25"
---# 📘 1. JVM의 개념

## 1) 기본 개념

**: Java Virtual Machine 자바를 실행하기 위한 가상 기계**

-   **Java**는 OS(운영체제)에 종속받지 않고 실행할 수 있다.
-   C언어 같은 경우 **소스 코드**를 작성 → **컴파일러** : **기계어**로 해석 → **실행 프로그램(**.exe) 생성(Binary code)
    -   특정 OS나 CPU 구조에 의해 컴파일러마다 다르게 컴파일이 수행됨 ⇒ 이식성 ⬇️
-   **Java** 어플리케이션은 **JVM**를 한 번 더 거쳐 하드웨어에 맞게 완전하게 컴파일되는 것이 아니라 실행시에 **interpret** (**JVM**하고만 상호작용)되기 때문에 OS에 **종속적이지 않다**.

> **💡JVM은 OS에 종속적인가?  
> **  
> YES! 자바 가상 머신은 OS에 종속적이다. 따라서, 각 OS에 맞는 자바 가상 머신을 설치해야 한다.  
> C언어랑 그러면 이식성면에서 차이가 없지 않을까? C언어는 코드에 대해서 실행 파일을 OS마다 다르게 해석하여 컴파일이 실행되는거고 Java는 해석을 동일하게 되어도 결국 JVM이 다시 해석 과정을 진행하므로 OS에 대해서 완전히 종속적이지는 않다.  
> 하지만, 개발자 입장에서 윈도우 C코드와 리눅스 C코드로 작성된 프로그램을 각각 만들어야 하는 수고와 또 이들을 유지보수하기 위한 불편함을 가진다. JAVA는 한 번만 작성되면 OS에 맞게 JVM만을 설치하여 구동시킬 수 있으므로 효율성과 생산성이 높아진다.

-   단점 : **interpret**되는 과정이 존재 ⇒ 속도가 느리다.
-   요즘에서는 컴파일된 **자바코드**(Byte code)를 기계어로 바로 변환하는 **JIT** 컴파일러 + 최적화 기술로 속도 ⬆️

> **\[바이너리 코드\]**  
> 컴퓨터가 인식할 수 있는 0과 1로 구성된 코드, 환경에 종속적이고 실행하지 못한다. ‘링커’에 의해 메모리 주소값을 반영하고 CPU가 직접 해독 후 실행할 수 있도록 수정되어야 기계어가 된다. 기계어와 가장 유사한 레벨의 코드.  
>   
> **\[바이트 코드\]**  
> 가상머신이 이해할 수 있는 중간 레벨로 컴파일한 것.어셈블리어와 유사한 형태를 띄고 있으며, 실행되기 위해서는 컴파일러에 의해서 한 번 더 변환되어야 한다.

## 2) 특징

-   ***스택 기반의 가상 머신***
    -   ARM 아키텍처 인텔 x86 아키텍처와 같은 hw는 레지스터를 기반으로 동작하는 반면, JWM은 스택 기반으로 동작.
-   ***심볼릭 레퍼런스***
    -   primitive type를 제외한 모든 타입(클래스, 인터페이스)을 명시적 메모리 주소 기반의 레퍼런스가 아닌 **심볼릭 레퍼런스**를 통해 참조.

> 💡JAVA 소스 코드를 컴파일하면 .class 파일이 생성된다. 이때, 클래스 파일 내부의 상수 풀(Constant Pool)에 해당 클래스가 참조하는 다른 클래스, 메서드, 필드 정보 저장된다.  
>   
> 참조 대상의 실제 메모리 주소를 저장하는 것이 아니라 대상의 이름을 저장하는데 이것을 **심볼릭 레퍼런스**라고 한다.

-   ***가비지 컬렉션***
    -   클래스 인스턴스는 개발자에 의해 명시적으로 생성되고 가비지 컬렉션에 의해 자동으로 파괴된다.
-   ***기본 자료형을 명확하게 정의하여 플랫폼 독립성 보장***
    -   C/C++등의 언어들은 OS에 따라서 int형 크기가 변하지만, JVM은 기본 자료형을 명확하게 정의하여, 호환성을 유지하고 플랫폼 독립성을 보장.
-   ***네트워크 바이트 오더***
    -   자바 클래스 파일은 네트워크 바이트 오더를 사용. 네트워크 오더를 사용하는 이유는 각 hw 아키텍처 사이에서 독립성을 유지하여 고정된 바이트 오더를 유지한다.

> **빅엔디안** : 상위 바이트의 값이 메모리상에 먼저 표시  
> **리틀엔디안** : 하위 바이트 값이 메모리상에 먼저 표시

# 📘 2. JVM 동작 방식

![](https://blog.kakaocdn.net/dna/s4KNo/dJMcagEctaD/AAAAAAAAAAAAAAAAAAAAABTdx-Pc1dvpJpWfCj5Ib5zWX1iNakHMc0Z-0cBzQ1SZ/img.jpg?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=tp3fJQwN4pnFmw%2BOWa%2FKL940yl8%3D)

1.  JAVA 프로그램 실행 시 JVM은 OS로부터 메모리를 할당 받는다.
2.  **자바 컴파일러(javac)**가 **자바 소스코드(.java)**를 **자바 바이트 코드(.class)**로 컴파일한다.
3.  **Class Loader**는 동적 로딩을 통해 필요 클래스들을 **로딩** 및 **링킹**하여 **Runtime Data Area**(실질적으로 메모리를 할당받아 관리하는 영역)에 올린다.
4.  **Runtime Data Area**에 로딩된 바이트 코드는 **Execution Engine**를 통해 해석된다.
5.  **Exectution Engine**에 의해 **Garbage Collector**의 동작과 **Thread 동기화**.

## 1) Class Loader - 클래스 로더

: JVM으로 **클래스 파일(.class)**을 동적으로 로드하고, 링크를 통해 배치하는 작업을 수행하는 **모듈**. **바이트 코드(.class)**을 엮어서 JVM의 메모리 영역인 **Runtime Data Area**에 배치.

![](https://blog.kakaocdn.net/dna/bSgbSK/dJMcadtR2nY/AAAAAAAAAAAAAAAAAAAAAPA9Kq1Ymu4wBrtGZuNyj-JsreRKcySTV49cTfYFEtrF/img.webp?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=7e0FlKsfCovJ1E6GO33RMwl4pE0%3D)

1.  ***Loading(로딩) : 클래스 파일을 가져와 JVM의 메모리에 로드.***
    1.  Class Loader가 클래스 파일을 읽고 내용에 따라 적절한 바이너리 코드를 만들어 메소드 영역에 저장.
    2.  메소드 영역에 저장되는 데이터
        -   Fully Quallified Class Name
        -   클래스 / 인터페이스 / ENUM
        -   메소드 / 변수
    3.  로딩이 끝나면 해당 클래스 타입의 class객체 생성 ⇒ 힙 영역에 저장.
2.  ***Linking(링킹) : 클래스 파일을 사용하기 위해 검증.***
    1.  **Verify(검증)** : .class 파일의 유효성 검증
    2.  **Preparation(준비)** : 클래스 변수(static 변수)와 기본값이 필요한 메모리 준비.
    3.  **Resolve(분석)** : 심볼릭 메모리 컨퍼런스를 메모리 영역에 있는 실제 래퍼런스로 교체
3.  ***Initialization(초기화) : 클래스 변수들을 적절한 값으로 초기화.***
    -   static 변수의 값을 할당.

## 2) Execution Engine - 실행 엔진

: 실행 엔진은 Class Loader를 통해 Data Area에 배치된 바이트 코드를 명령어 단위로 읽어 실행.

-   실행 방식
    -   **인터프리터(Interpreter)** : 바이트 코드 명령어를 1줄씩 읽어 해석하며 바로 실행. 속도⬇️
    -   **JIT(Just-In-Time) 컴파일러** : 반복되는 코드를 발견하여 바이트 코드 컴파일 → Native Code로 변경 → 해당 메서드를 인터프리팅하지 않고 캐싱 → 네이티브 코드로 직접 실행 / 속도⬆️⇒ 기본적으로는 인터프리터 방식으로 실행하고 일정 기준이 넘어가면 JIT 컴파일 방식으로 명령어 실행.

### ▸ 1. 인터프리터

-   **바이트 코드** 명령어를 1개씩 읽고 해석하며 바로 실행.
-   기본적으로 **인터프리터** 방식 사용.
-   속도면에서 느림.

### ▸ 2. JIT 컴파일러(Just-In-Time Compiler)

-   **인터프리터**의 속도 단점을 보완하기 위해 도입된 방식.
-   반복되는 코드를 발견하여 **바이트 코드** 전체를 컴파일하여, **Native Code**로 변경 → 해당 메서드는 **캐싱** → **네이티브 코드**로 직접 실행

⇒ **네이티브 코드**의 전체적인 실행속도는 **인터프리팅** 방식보다 빠름.

### ▸ 3. 가비지 컬렉터(Garbage Collector)

-   **GC**를 이용하여 **Heap 메모리 영역**에서 더는 사용하지 않는 **메모리**를 자동으로 회수
-   개발자가 따로 설정할 필요 없이 자동으로 **메모리**를 실시간으로 최적화.
-   **Full GC**가 발생하는 경우 **GC**를 제외한 모든 스레드가 중지되므로 장애 발생 가능성.

## 3) Runtime Data Area - 런타임 데이터 영역

: 자바 애플리케이션이 실행될 때 JVM이 OS로부터 할당받는 **메모리** 공간.

![](https://blog.kakaocdn.net/dna/canWPK/dJMcacV4KEt/AAAAAAAAAAAAAAAAAAAAAE4IT3qypFdmN-LFb5W0olAuS9TFBf7alxjXjkSRsyBr/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=eB3eYNL7LMrgiBn2gOqzP0mIwTk%3D)

> **\[모든 쓰레드가 공유하는 영역\]**  
> Method Area  
> Heap Area  
>   
> **\[각 쓰레드마다 생성되는 영역\]**  
> Stack Area  
> PC Register  
> Native Method Stack

### ▸ 1. 메서드 영역 (Method Area)

: JVM이 시작될 때 생성되는 공간으로 **바이트 코드(.class)**를 처음 메모리 공간에 올릴 때 초기화되는 대상을 저장하기 위한 **메모리 공간**, **클래스**가 로드되는 시점에 적재되어 프로그램이 종료될 때까지 저장됨.

-   **Field Info** : 멤버 변수 이름, 데이터 타입, 접근 제어자의 정보
-   **Method Info** : 메서드 이름, Return 타입, 함수 매개변수, 접근 제어자 정보
-   **Type Info** : Class인가 Interface인지 여부, Type 속성, 이름 Super Class

⇒ **정적 필드** + **클래스 구조**

### ▸ 2. 힙 영역(Heap Area)

: JVM이 관리하는 프로그램상에서 데이터를 저장하기 위해 런타임 시 동적으로 할당하여 사용하는 영역. **new 연산자**로 생성되는 **객체**와 **배열**이 생성되는 영역.

-   method Area 영역에 저장된 클래스만을 생성 되어 적재.
-   가비지 컬렉션의 대상이 되는 공간.’
-   힙 영역에 생성된 객체와 배열은 **Reference Type**으로 **JVM 스택 영역의 변수**나 다른 객체의 필드에서 참조됨.

![](https://blog.kakaocdn.net/dna/bcZs9m/dJMcafyuWkA/AAAAAAAAAAAAAAAAAAAAAHbHFK8Gyu4XJrZ9dGpGTXaa5egTb0dCLUhxWi-C2njh/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=e9c6T%2BU4k4Mrz%2Fpdvm7o%2BDNMI8A%3D)

-   힙 영역과 스택영역의 관계 
    
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
-   **Heap Area**(실제 물건) / **Stack Area**(물건을 가르키는 리모컨)

![](https://blog.kakaocdn.net/dna/ztESA/dJMcaaRvaQE/AAAAAAAAAAAAAAAAAAAAALFF3S3kPp1iUQRTyQ5vx9d0HY5RBgoR_sZxlq2BUh5t/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=zHFFPUiTvL%2B1YJml1E%2F59%2FJD3c8%3D)

Heap Area 구조

-   **Young Generation** : 생명 주기가 짧은 객체를 GC대상으로 하는 영역
    -   Eden : new를 통해 새로 생성된 객체. 정기적 Garbage 수집 후 살아 남은 객체들은 Survivor로 이동.
    -   Survivor : 각 영역이 채워지면 살아남은 객체는 비워진 Survivor로 순차적 이동
-   **Old Generation** : 생명 주기가 긴 객체를 GC 대상으로 하는 영역. Young Generation에서 살아남은 객체들 이동.

### ▸ 3. 스택 영역(Stack Area)

: 지역 변수, 파라미터, 리턴 값, 연산에 사용되는 임시 값등이 생성되는 영역으로 클래스 수준의 정보를 저장하고 공유.

```
int a = 10;

=> 'a'라는 메모리 영역을 잡고 해당 영역에 10을 할당. 스택에 'a'라는 이름의 값이 10인 메모리 공간을 만듦.
```

-   메서드 호출마다 각각의 **스택 프레임**(그 메서드만을 위한 공간)이 생성되고 메서드 안에서 사용되는 값들을 저장, 호출된 메서드의 **매개변수**, **지역변수**, **리턴** 값 및 **연산 시 일어나는 값**들 저장.
-   각 쓰레드마다 1개씩 존재하고 쓰레드가 시작될 때 할당.
-   프로세스가 메모리에 로드될 때 스택 사이즈가 고정 → 런타임 시 스택 사이즈 변경 불가.

### ▸ 4. PC 레지스터(Program Counter Register)

: 현재 실행하는 자바 메소드의 바이트 코드 중, 어떤 명령어를 수행하고 있는지에 대한 인덱스를 관리.

> **Register VS PC Register**  
>   
> PC Register는 값을 직접 저장하는 것이 아니라, 이 레지스터에 대한 정보가 어느 메서드의 바이트 코드 배열의 몇 번째 바이트인지를 특정할 수 있는 참조값을 가짐.  
>   
> 자바는 현재 작업하는 내용을 CPU에게 연산으로 제공하며, 이를 위한 버퍼 공간으로서 PC Register라는 메모리 영역을 만듦.

-   스레드가 자바 메서드를 수행 → JVM 명령(Instruction)의 주소를 **PC Register**에 저장.
-   자바가 아닌 다른 언어의 메서드 수행 → **undefined** 상태

### ▸ 5. Native Method Library

: C, C++로 작성된 라이브러리.

-   자바 코드 상 native 키워드를 사용해 선언된 메서드 호출 시, JVM이 해당 네이티브 메서드 실행을 위해 사용하는 별도의 스택 영역.
-   **JNI** 규약에 따라 **네이티브 메서드 스택**의 **생명 주기**가 관리됨.

### ▸ 6. JNI(Java Native Interface)

: 자바가 다른 언어로 만들어진 어플리케이션과 상호작용할 수 있는 인터페이스를 제공하는 프로그램

-   JNI는 JVM이 Native Method를 적재하고 실행할 수 있도록 함.

### ▸ 7. 네이티브 메서드 스택(Native Method Stack)

: 자바 코드 상 native 키워드를 사용해 선언된 메서드를 호출할 때, JVM이 해당 네이티브 메서드를 실행하기 위해 사용하는 별도의 스택 영역.

![](https://blog.kakaocdn.net/dna/xKVaw/dJMcahpy6dQ/AAAAAAAAAAAAAAAAAAAAAMx8z08QhIjwbq2mKjq2Eav8ufHsudXfv3bJWdXwSq0T/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1788188399&allow_ip=&allow_referer=&signature=1QYc0WJr5tekNFBS330hFe0OmZ8%3D)

-   자바가 컴파일되어 생성되는 바이트 코드가 아닌 실제 기계어로 작성된 프로그램을 실행.
-   JIT 컴파일러에 의해 변환된 Native Code가 해당 부분에서 실행.
-   JNI가 사용되면 네이티브 메서드 스택에서 바이트 코드로 전환되어 저장됨.
-   메소드 실행 시 **JVM 스택**에 쌓이다가 해당 메소드 내부에 **native 방식**을 사용하는 메소드가 있으면 해당 메소드는 **Native Stack**에 쌓임.
-   **네이티브 메소드**의 수행이 끝나면 다시 **Java Stack**으로 돌아와 다시 작업 수행.

window.ReactionButtonType = 'reaction'; window.ReactionApiUrl = '//codekim3570.tistory.com/reaction'; window.ReactionReqBody = { entryId: 25 }

공유하기
