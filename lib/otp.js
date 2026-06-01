// 이메일 OTP(일회용 코드) 인증 — 비밀번호 로그인이 안 될 때의 폴백.
// 무상태: 코드 해시를 서명된 단기 JWT 쿠키에 담아 DB 없이 검증한다.
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-production';
export const OTP_COOKIE = 'xinchao_otp_challenge';

// OTP 를 받을 수 있는 관리자 주소 화이트리스트 (그 외 주소엔 코드 안 보냄)
export const OTP_ALLOWED = (process.env.REPORT_EMAIL || 'younghan146@gmail.com,info@chaovietnam.co.kr')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export function genCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function signChallenge(email, code) {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    return jwt.sign({ email: email.toLowerCase(), codeHash }, SECRET, { expiresIn: '10m' });
}

export function verifyChallenge(token, code) {
    try {
        const p = jwt.verify(token, SECRET);
        const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex');
        if (p.codeHash === codeHash) return p.email;
    } catch {
        /* 만료/위조 */
    }
    return null;
}
