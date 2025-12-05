# VPS 배포 가이드

이 문서는 XinChao Vietnam 뉴스 시스템을 VPS 서버에 배포하는 방법을 설명합니다.

## 사전 요구사항

- Ubuntu 20.04+ 또는 Debian 11+
- Node.js 18+ (또는 20 권장)
- PM2 (프로세스 관리)
- Nginx (리버스 프록시)

---

## 1. 서버 기본 설정

### 1.1 Node.js 설치

```bash
# Node.js 20 LTS 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 버전 확인
node -v
npm -v
```

### 1.2 PM2 설치

```bash
sudo npm install -g pm2
```

### 1.3 필요한 패키지 설치

```bash
sudo apt-get update
sudo apt-get install -y git nginx
```

---

## 2. 프로젝트 배포

### 2.1 프로젝트 클론/업로드

```bash
# Git 사용 시
cd /var/www
git clone [your-repo-url] xinchao-news
cd xinchao-news

# 또는 FTP/SFTP로 파일 업로드 후
cd /var/www/xinchao-news
```

### 2.2 의존성 설치

```bash
npm install
```

### 2.3 환경 변수 설정

```bash
# .env 파일 생성
nano .env
```

**.env 파일 내용:**
```env
# 데이터베이스
DATABASE_URL="file:./prisma/dev.db"

# OpenAI API
OPENAI_API_KEY=sk-your-openai-key

# WordPress
WORDPRESS_URL=https://chaovietnam.co.kr
WORDPRESS_USERNAME=chaovietnam
WORDPRESS_APP_PASSWORD=your-app-password

# 텔레그램 알림 (선택)
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# 프로덕션 설정
NODE_ENV=production
PORT=5000
```

### 2.4 데이터베이스 초기화

```bash
npx prisma db push
```

### 2.5 프로덕션 빌드

```bash
npm run build
```

---

## 3. PM2로 실행

### 3.1 ecosystem 설정 파일 생성

```bash
nano ecosystem.config.js
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [
    {
      name: 'xinchao-web',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/xinchao-news',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
```

### 3.2 PM2로 시작

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 시스템 재부팅 시 자동 시작
```

### 3.3 PM2 명령어

```bash
pm2 status           # 상태 확인
pm2 logs xinchao-web # 로그 보기
pm2 restart xinchao-web  # 재시작
pm2 stop xinchao-web     # 중지
```

---

## 4. Nginx 리버스 프록시

### 4.1 Nginx 설정

```bash
sudo nano /etc/nginx/sites-available/xinchao-news
```

**설정 내용:**
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 도메인 또는 IP

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4.2 설정 활성화

```bash
sudo ln -s /etc/nginx/sites-available/xinchao-news /etc/nginx/sites-enabled/
sudo nginx -t  # 설정 테스트
sudo systemctl restart nginx
```

### 4.3 SSL 인증서 (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 5. 크롤러 자동 실행 (Cron Job)

### 5.1 Cron 설정

```bash
crontab -e
```

**매일 오전 8시에 크롤링:**
```cron
0 8 * * * cd /var/www/xinchao-news && /usr/bin/node scripts/crawler.js >> /var/log/xinchao-crawler.log 2>&1
```

### 5.2 로그 확인

```bash
tail -f /var/log/xinchao-crawler.log
```

---

## 6. 텔레그램 봇 설정

### 6.1 봇 생성

1. Telegram에서 `@BotFather` 검색
2. `/newbot` 명령어 입력
3. 봇 이름 입력 (예: XinChao News Bot)
4. 봇 username 입력 (예: xinchao_news_bot)
5. **API Token 저장** (예: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 6.2 Chat ID 찾기

1. 생성한 봇에게 `/start` 메시지 전송
2. 브라우저에서 접속:
   ```
   https://api.telegram.org/bot[YOUR_BOT_TOKEN]/getUpdates
   ```
3. 응답에서 `chat.id` 값 확인 (예: `123456789`)

### 6.3 .env에 추가

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

### 6.4 테스트

```bash
cd /var/www/xinchao-news
node -e "require('./lib/telegram').sendTelegramMessage('테스트 메시지입니다!')"
```

---

## 7. 백업 설정

### 7.1 데이터베이스 백업 스크립트

```bash
nano /var/www/xinchao-news/backup.sh
```

**backup.sh:**
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/xinchao"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
cp /var/www/xinchao-news/prisma/dev.db $BACKUP_DIR/dev_$DATE.db
# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
```

```bash
chmod +x /var/www/xinchao-news/backup.sh
```

### 7.2 Cron으로 자동 백업

```bash
crontab -e
```

**매일 자정에 백업:**
```cron
0 0 * * * /var/www/xinchao-news/backup.sh
```

---

## 8. 업데이트 방법

### 8.1 코드 업데이트

```bash
cd /var/www/xinchao-news
git pull origin main  # Git 사용 시

# 또는 FTP로 파일 교체 후
npm install
npm run build
pm2 restart xinchao-web
```

### 8.2 데이터베이스 스키마 변경 시

```bash
npx prisma db push
pm2 restart xinchao-web
```

---

## 9. 문제 해결

### 9.1 로그 확인

```bash
# PM2 로그
pm2 logs xinchao-web

# Nginx 로그
sudo tail -f /var/log/nginx/error.log

# 크롤러 로그
tail -f /var/log/xinchao-crawler.log
```

### 9.2 포트 확인

```bash
sudo netstat -tlnp | grep 5000
```

### 9.3 방화벽 설정

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 9.4 메모리 부족 시

```bash
# PM2 메모리 제한 조정
pm2 delete xinchao-web
pm2 start ecosystem.config.js
```

---

## 10. 보안 권장사항

1. **SSH 키 인증** 사용 (비밀번호 로그인 비활성화)
2. **방화벽** 설정 (ufw)
3. **정기적인 업데이트**: `sudo apt update && sudo apt upgrade`
4. **.env 파일 권한**: `chmod 600 .env`
5. **Fail2ban** 설치 (SSH 브루트포스 방지)

---

## 체크리스트

- [ ] Node.js 20+ 설치됨
- [ ] PM2 설치 및 설정됨
- [ ] Nginx 리버스 프록시 설정됨
- [ ] SSL 인증서 설치됨
- [ ] 환경 변수 설정됨 (.env)
- [ ] 데이터베이스 초기화됨
- [ ] 크롤러 Cron Job 설정됨
- [ ] 텔레그램 알림 설정됨
- [ ] 백업 스크립트 설정됨
- [ ] 방화벽 설정됨

---

## 파일 구조 요약

```
/var/www/xinchao-news/
├── .env                    # 환경 변수
├── ecosystem.config.js     # PM2 설정
├── prisma/
│   └── dev.db             # SQLite 데이터베이스
├── scripts/
│   └── crawler.js         # 크롤러
├── lib/
│   └── telegram.js        # 알림 모듈
└── ...
```

---

## 문의

배포 관련 문제가 있으면 에러 로그를 확인하고, AI 도구(Claude, ChatGPT)에 로그와 함께 질문하세요.
