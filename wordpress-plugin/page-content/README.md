# 페이지 본문 원본

워드프레스 **페이지 본문**은 DB 에만 있어 git 이력이 남지 않는다.
그래서 우리가 쓴 본문은 여기에도 보관한다 — 되돌리거나 다른 사이트에 옮길 때 쓴다.

| 파일 | 대상 페이지 |
|---|---|
| `exchange-rate.html` | https://chaovietnam.co.kr/exchange-rate/ (page ID 186982) |

반영 방법 — REST API 로 올린다(관리자 앱 비밀번호 사용):

```js
fetch('https://chaovietnam.co.kr/wp-json/wp/v2/pages/186982', {
  method: 'POST',
  headers: { Authorization: 'Basic ' + btoa(user + ':' + appPassword),
             'Content-Type': 'application/json' },
  body: JSON.stringify({ content: fs.readFileSync('exchange-rate.html', 'utf8') })
})
```

⚠️ 올리기 전 현재 본문을 반드시 백업할 것. (`?context=edit&_fields=content` 로 읽어 저장)
