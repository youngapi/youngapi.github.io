---
title: "JSP·Tiles·MyBatis 에 S3 이미지 붙이기"
description: "Spring Boot 에 JSP 와 Tiles 레이아웃을 깔고, 상품 이미지를 S3 에 올리고 지우는 흐름을 만들었다."
date: 2022-03-02
category: "backend"
subcategory: "spring"
tags: ["spring-boot", "mybatis", "jsp", "tiles", "aws-s3"]
repos: []
---

1월부터 로봇 부품을 올려 두고 보여 주는 작은 웹 서비스를 공부 삼아 만들고 있었다. 둘이서 나눠 했는데, 로그인과 검색·페이징은 같이 하던 사람이 맡았고 나는 프로젝트 뼈대와 관리자 쪽 상품 등록, 이미지 처리를 맡았다. 화면은 JSP, 데이터는 MyBatis, 이미지는 S3 에 두는 구성이었다.

## Spring Boot 위에 JSP

처음엔 컨트롤러 하나와 `home.jsp` 하나로 시작해서 jQuery, Bootstrap 같은 정적 파일부터 깔았다. Spring Boot 는 기본으로 JSP 를 지원하지 않아서 `tomcat-embed-jasper` 와 `jstl` 을 직접 넣어야 한다. 외부 톰캣에도 올릴 생각이라 `packaging` 을 `war` 로 바꾸고 `spring-boot-starter-tomcat` 은 `provided` 로 뺐다.

## Tiles 로 레이아웃 나누기

Apache Tiles 는 헤더, 내비게이션, 푸터 같은 공통 조각을 레이아웃 하나로 묶어 주는 JSP 템플릿 도구다. 페이지마다 include 를 붙이는 대신 `tiles.xml` 에 레이아웃을 정의해 두면, 컨트롤러가 돌려준 뷰 이름이 그 정의에 끼워진다. `TilesConfigurer` 에 정의 파일 위치를 주고, `UrlBasedViewResolver` 의 뷰 클래스를 `TilesView` 로 잡아 우선순위를 1로 올렸다.

## MyBatis

MyBatis 는 SQL 을 XML 에 직접 쓰고 자바 인터페이스와 이어 주는 매퍼 프레임워크다. `SqlSessionFactoryBean` 을 직접 만들어 매퍼 XML 위치를 잡고 `@MapperScan` 으로 매퍼 인터페이스를 스캔했다. `mapUnderscoreToCamelCase` 를 켜서 스네이크 케이스 칼럼이 VO 필드에 바로 들어가게 했다. DB 는 MariaDB 드라이버를 쓰고, 실행된 쿼리를 보려고 log4jdbc 를 붙였다.

## S3 업로드와 삭제

`aws-java-sdk-s3` 로 `AmazonS3Client` 빈을 만들었다. 업로드는 `MultipartFile` 을 임시 `File` 로 바꿔 `PutObjectRequest` 에 `PublicRead` ACL 을 붙여 올리고, 끝나면 임시 파일을 지운다. 키는 `서비스이름/메뉴/하위메뉴/타임스탬프_파일명` 모양이라 같은 이름 파일이 와도 겹치지 않는다. DB 에는 서비스 이름을 뺀 뒷부분만 저장했다.

2월 말부터 3월 초까지는 거의 삭제와 수정만 붙잡았다. 같은 "delete aws image" 커밋이 여러 번 이어진 게 그 흔적이다. 처음엔 삭제 API 만 만들었고, 그다음 매퍼에 delete 쿼리를 채우고, 마지막에 수정 화면까지 이었다.

- 삭제: `deleteObject` 를 먼저 부르고, 실패하면 `AmazonServiceException` 을 잡아 로그만 남긴다. S3 결과와 상관없이 DB 행은 지운다.
- 수정: 이미지를 지우라는 플래그가 오면 S3 파일을 지우고 경로 칸을 비운다. 새 파일이 오면 다시 올리고, 아무것도 안 오면 빈 문자열을 넘겨서 MyBatis `<if>` 가 그 칸을 UPDATE 에서 빼게 했다.
- 화면: 상세 화면이 수정 요청에 기존 이미지 경로를 같이 실어 보내고, 이미지가 없는 상품엔 삭제 버튼이 안 보이게 했다.

## 막혔던 것

지금 보면 엉성한 데가 있다. 삭제 컨트롤러는 이미지 경로가 비었는지 `!= null || != ""` 로 검사했는데, `||` 라서 항상 참이고 문자열 비교도 `equals` 가 아니라 의미가 없었다. 결과적으로는 늘 S3 삭제를 먼저 시도하고 DB 를 지우는 길로 갔다.

키 앞에 붙는 서비스 이름도 업로드는 `main` 에서 넣은 시스템 프로퍼티로, 삭제는 yml 값을 `@Value` 로 읽었다. 로컬에선 두 값이 같아서 문제가 안 보였는데, 이게 한 달 뒤 war 배포 때 다시 발목을 잡았다.
