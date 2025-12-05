const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('[Telegram] Not configured, skipping notification');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const result = await response.json();
        if (result.ok) {
            console.log('[Telegram] Message sent successfully');
            return true;
        } else {
            console.error('[Telegram] Failed to send:', result.description);
            return false;
        }
    } catch (error) {
        console.error('[Telegram] Error:', error.message);
        return false;
    }
}

async function sendCrawlerAlert(status, itemsFound, successSources, failedSources, errorDetails) {
    const emoji = status === 'SUCCESS' ? '✅' : status === 'PARTIAL' ? '⚠️' : '❌';
    const statusText = status === 'SUCCESS' ? '성공' : status === 'PARTIAL' ? '일부 실패' : '실패';
    
    let message = `${emoji} <b>크롤러 실행 결과</b>\n\n`;
    message += `📊 상태: ${statusText}\n`;
    message += `📰 저장된 뉴스: ${itemsFound}개\n\n`;
    
    if (successSources.length > 0) {
        message += `✅ 성공: ${successSources.join(', ')}\n`;
    }
    
    if (failedSources.length > 0) {
        message += `❌ 실패: ${failedSources.join(', ')}\n\n`;
        
        if (errorDetails && Object.keys(errorDetails).length > 0) {
            message += `📋 <b>에러 상세:</b>\n`;
            for (const [source, err] of Object.entries(errorDetails)) {
                const shortMsg = err.message.substring(0, 100);
                message += `• ${source}: ${shortMsg}\n`;
            }
        }
    }
    
    message += `\n🕐 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
    
    return sendTelegramMessage(message);
}

async function sendPublishAlert(newsCount, cardNewsPublished = false) {
    let message = `📢 <b>WordPress 게시 완료</b>\n\n`;
    message += `📰 게시된 뉴스: ${newsCount}개\n`;
    if (cardNewsPublished) {
        message += `🎴 카드 엽서: 게시됨\n`;
    }
    message += `\n🕐 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
    
    return sendTelegramMessage(message);
}

module.exports = {
    sendTelegramMessage,
    sendCrawlerAlert,
    sendPublishAlert
};
