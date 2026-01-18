# 씬짜오베트남 앱 딥링크 구현 가이드

## 📋 개요

웹사이트(https://chaovietnam.co.kr/daily-news-terminal/)에서 앱으로 연결하는 딥링크 기능을 구현해야 합니다.

### 목표
- SNS(카카오톡, 텔레그램 등)에서 공유된 링크 클릭 시
- "앱으로 보시겠습니까?" 팝업이 뜨고
- 앱 설치자 → 앱이 열림
- 미설치자 → 앱스토어/플레이스토어로 이동

---

## 🔧 1단계: URL Scheme 설정

### Expo 사용 시 (app.json)

```json
{
  "expo": {
    "name": "씬짜오베트남 매거진",
    "slug": "xinchao-vietnam",
    "scheme": "xinchao",
    ...
  }
}
```

### Bare React Native (Expo 없이)

#### Android: `android/app/src/main/AndroidManifest.xml`

`<activity>` 태그 안에 추가:

```xml
<activity
  android:name=".MainActivity"
  ...>
  
  <!-- 기존 intent-filter 외에 추가 -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="xinchao" />
  </intent-filter>
  
</activity>
```

#### iOS: `ios/YourAppName/Info.plist`

`<dict>` 태그 안에 추가:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.yourname.chaovnapp</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>xinchao</string>
    </array>
  </dict>
</array>
```

---

## 🔧 2단계: 딥링크 처리 코드

### 방법 A: Expo Linking 사용 (권장)

#### 설치
```bash
npx expo install expo-linking
```

#### App.js 또는 최상위 컴포넌트

```javascript
import React, { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';

export default function App() {
  const navigation = useNavigation();

  useEffect(() => {
    // 앱이 이미 열려있을 때 딥링크로 열리면
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // 앱이 닫혀있다가 딥링크로 열리면
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (event) => {
    const { url } = event;
    console.log('딥링크 URL:', url);
    
    // URL 파싱
    const { path, queryParams } = Linking.parse(url);
    console.log('경로:', path, '파라미터:', queryParams);

    // 경로에 따라 화면 이동
    switch (path) {
      case 'daily-news':
        navigation.navigate('DailyNews');
        break;
      case 'article':
        // 예: xinchao://article?id=123
        if (queryParams.id) {
          navigation.navigate('ArticleDetail', { id: queryParams.id });
        }
        break;
      default:
        // 기본: 홈 화면
        navigation.navigate('Home');
        break;
    }
  };

  return (
    // ... 앱 컴포넌트
  );
}
```

### 방법 B: React Navigation 딥링크 설정 (더 깔끔함)

#### NavigationContainer에 linking 설정

```javascript
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';

const prefix = Linking.createURL('/');

const linking = {
  prefixes: ['xinchao://', prefix],
  config: {
    screens: {
      // 스크린 이름: 딥링크 경로
      Home: '',
      DailyNews: 'daily-news',
      ArticleDetail: {
        path: 'article/:id',
        parse: {
          id: (id) => id,
        },
      },
      // 더 많은 스크린 추가 가능
    },
  },
};

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      {/* Navigator 컴포넌트들 */}
    </NavigationContainer>
  );
}
```

---

## 🔧 3단계: 테스트

### 시뮬레이터/에뮬레이터에서 테스트

#### iOS 시뮬레이터
```bash
npx uri-scheme open "xinchao://daily-news" --ios
```

#### Android 에뮬레이터
```bash
npx uri-scheme open "xinchao://daily-news" --android
```

또는 adb 사용:
```bash
adb shell am start -W -a android.intent.action.VIEW -d "xinchao://daily-news"
```

### 실제 기기에서 테스트

1. 앱을 빌드하여 기기에 설치
2. Safari(iOS) 또는 Chrome(Android)에서 주소창에 입력:
   ```
   xinchao://daily-news
   ```
3. "이 페이지를 앱에서 여시겠습니까?" 확인 → 앱이 열리면 성공!

---

## 📱 지원할 딥링크 URL 목록

| URL | 설명 | 이동할 화면 |
|-----|------|------------|
| `xinchao://` | 기본 | 홈 화면 |
| `xinchao://daily-news` | 오늘의 뉴스 | DailyNews 화면 |
| `xinchao://article?id=123` | 특정 기사 | ArticleDetail 화면 |

---

## 🌐 웹사이트 측 구현 (이미 완료됨)

WordPress 플러그인(`jenny-daily-news.php`)에 다음 기능이 추가되었습니다:

1. 모바일 사용자 감지
2. 앱 설치 유도 팝업 표시
3. "앱으로 보기" 클릭 시:
   - `xinchao://daily-news` 스킴으로 앱 열기 시도
   - 앱 미설치 시 자동으로 스토어로 이동:
     - iOS: https://apps.apple.com/app/id6754750793
     - Android: https://play.google.com/store/apps/details?id=com.yourname.chaovnapp

---

## ⚠️ 주의사항

1. **앱 재빌드 필요**: URL Scheme 설정 후 반드시 앱을 다시 빌드해야 합니다.
   ```bash
   # Expo
   eas build --platform all
   
   # 또는 로컬 빌드
   npx expo run:ios
   npx expo run:android
   ```

2. **스토어 재배포 필요**: URL Scheme이 포함된 새 버전을 앱스토어/플레이스토어에 업로드해야 합니다.

3. **Android Play Store 링크 확인**: 현재 설정된 패키지 ID가 `com.yourname.chaovnapp`인데, 실제 패키지 ID와 일치하는지 확인 필요.

---

## 📞 문의

구현 중 문제가 있으면 알려주세요!

---

## 체크리스트

- [ ] app.json에 `"scheme": "xinchao"` 추가
- [ ] 딥링크 핸들러 코드 추가 (방법 A 또는 B)
- [ ] 시뮬레이터에서 테스트
- [ ] 실제 기기에서 테스트
- [ ] 새 버전 빌드
- [ ] 스토어에 업데이트 배포
