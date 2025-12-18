const { PrismaClient } = require('@prisma/client');

const crawlVnExpress = require('../scripts/crawlers/vnexpress');
const crawlYonhap = require('../scripts/crawlers/yonhap');
const crawlInsideVina = require('../scripts/crawlers/insidevina');
const crawlTuoitre = require('../scripts/crawlers/tuoitre');
const crawlThanhNien = require('../scripts/crawlers/thanhnien');
const crawlVnExpressVN = require('../scripts/crawlers/vnexpress-vn');
const crawlVnaNet = require('../scripts/crawlers/vnanet');
const crawlPublicSecurity = require('../scripts/crawlers/publicsecurity');
const crawlSaigoneer = require('../scripts/crawlers/saigoneer');
const crawlSoraNews24 = require('../scripts/crawlers/soranews24');
const crawlPetNews = require('../scripts/crawlers/petnews');
const { sendCrawlerAlert } = require('./telegram');

const prisma = new PrismaClient();

let translateAndCategorize;

async function loadTranslator() {
    const translator = await import('./translator.js');
    translateAndCategorize = translator.translateAndCategorize;
}

async function runCrawlerService() {
    await loadTranslator();

    console.log('🚀 크롤러 서비스 시작...');
    console.log('================================================');

    const crawlers = [
        { name: 'VnExpress', fn: crawlVnExpress },
        { name: 'Yonhap', fn: crawlYonhap },
        { name: 'InsideVina', fn: crawlInsideVina },
        { name: 'TuoiTre', fn: crawlTuoitre },
        { name: 'ThanhNien', fn: crawlThanhNien },
        { name: 'VnExpressVN', fn: crawlVnExpressVN },
        { name: 'VNA', fn: crawlVnaNet },
        { name: 'PublicSecurity', fn: crawlPublicSecurity },
        { name: 'Saigoneer', fn: crawlSaigoneer },
        { name: 'SoraNews24', fn: crawlSoraNews24 },
        { name: 'PetNews', fn: crawlPetNews }
    ];

    const results = await Promise.allSettled(crawlers.map(c => c.fn()));

    const allItems = [];
    const successSources = [];
    const failedSources = [];
    const errorDetails = {};

    results.forEach((result, index) => {
        const crawler = crawlers[index];
        if (result.status === 'fulfilled') {
            allItems.push(...result.value);
            successSources.push(`${crawler.name}(${result.value.length})`);
            console.log(`✅ ${crawler.name}: ${result.value.length}개 수집`);
        } else {
            const errorMsg = result.reason?.message || String(result.reason);
            const errorStack = result.reason?.stack || '';
            failedSources.push(crawler.name);
            errorDetails[crawler.name] = {
                message: errorMsg,
                stack: errorStack.split('\n').slice(0, 5).join('\n'),
                time: new Date().toISOString()
            };
            console.error(`❌ ${crawler.name} 실패:`, errorMsg);
        }
    });

    console.log(`📰 총 수집: ${allItems.length}개 (${failedSources.length}개 소스 실패)`);

    let savedCount = 0;
    let translatedCount = 0;
    let translationFailedCount = 0;
    const translationFailedItems = [];

    for (const item of allItems) {
        const exists = await prisma.newsItem.findFirst({
            where: { originalUrl: item.originalUrl }
        });

        if (exists) {
            continue;
        }

        // 연합뉴스는 Korea-Vietnam 카테고리로 고정
        if (item.source === 'Yonhap News') {
            item.category = 'Korea-Vietnam';
        }

        console.log(`\n📝 [${item.source}] ${item.title.substring(0, 50)}...`);

        // GPT로 제목 번역 + 카테고리 분류 (통합 모듈 사용)
        const processed = await translateAndCategorize(item);

        // 한국어 소스는 번역이 필요 없으므로 정상 처리
        const isKoreanSource = item.source === 'Yonhap News' || item.source === 'InsideVina' || item.source === 'Saigoneer';
        
        // 번역 실패 체크 및 로깅 (한국어 소스 제외)
        if (!processed.translatedTitle && !isKoreanSource) {
            translationFailedCount++;
            const errorMsg = processed.error || 'Unknown error';
            translationFailedItems.push({
                source: item.source,
                title: item.title.substring(0, 50),
                error: errorMsg
            });
            console.warn(`   ⚠️ 번역 실패: ${errorMsg}`);
            console.warn(`   원본 제목: ${item.title}`);
        } else if (isKoreanSource) {
            console.log(`   ℹ️ 한국어 소스 (번역 불필요): ${item.title.substring(0, 50)}...`);
        } else {
            console.log(`   ✅ 번역 완료: ${processed.translatedTitle.substring(0, 50)}...`);
        }

        const finalCategory = item.source === 'Yonhap News' ? 'Korea-Vietnam' : processed.category;
        translatedCount++;

        await prisma.newsItem.create({
            data: {
                ...item,
                translatedTitle: processed.translatedTitle || null,
                category: finalCategory,
            }
        });

        savedCount++;
    }

    const status = failedSources.length === 0 ? 'SUCCESS' :
        failedSources.length === crawlers.length ? 'FAILED' : 'PARTIAL';

    // 번역 실패 정보 추가
    let translationInfo = `번역 시도: ${translatedCount}개`;
    if (translationFailedCount > 0) {
        translationInfo += `, 번역 실패: ${translationFailedCount}개`;
    }

    const logMessage = `완료. 성공: ${successSources.join(', ') || '없음'}. 실패: ${failedSources.join(', ') || '없음'}. ${translationInfo}`;

    // 번역 실패 상세 정보를 errorDetails에 추가
    const allErrorDetails = { ...errorDetails };
    if (translationFailedItems.length > 0) {
        allErrorDetails.translationFailures = {
            count: translationFailedCount,
            items: translationFailedItems
        };
    }

    await prisma.crawlerLog.create({
        data: {
            status,
            itemsFound: savedCount,
            message: logMessage,
            errorDetails: Object.keys(allErrorDetails).length > 0 ? JSON.stringify(allErrorDetails, null, 2) : null
        }
    });

    try {
        await sendCrawlerAlert(status, savedCount, successSources, failedSources, errorDetails);
    } catch (e) {
        console.log('[텔레그램] 알림 스킵:', e.message);
    }

    return {
        success: true,
        savedCount,
        translatedCount,
        translationFailedCount,
        message: logMessage
    };
}

module.exports = { runCrawlerService };
