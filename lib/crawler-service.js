const { PrismaClient } = require('@prisma/client');

const crawlVnExpress = require('../scripts/crawlers/vnexpress');
const crawlYonhap = require('../scripts/crawlers/yonhap');
const crawlInsideVina = require('../scripts/crawlers/insidevina');
const crawlTuoitre = require('../scripts/crawlers/tuoitre');
const crawlThanhNien = require('../scripts/crawlers/thanhnien');
const crawlVnExpressVN = require('../scripts/crawlers/vnexpress-vn');
const crawlVnExpressEconomy = require('../scripts/crawlers/vnexpress-economy');
const crawlCafef = require('../scripts/crawlers/cafef');
const crawlPublicSecurity = require('../scripts/crawlers/publicsecurity');
const crawlSaigoneer = require('../scripts/crawlers/saigoneer');
const crawlSoraNews24 = require('../scripts/crawlers/soranews24');
const crawlTheDodo = require('../scripts/crawlers/thedodo');
const crawlPetMD = require('../scripts/crawlers/petmd');
const crawlBonAppetit = require('../scripts/crawlers/bonappetit');
const crawlHealth = require('../scripts/crawlers/health');
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

    // 1. 시작 로그 기록 (추후 추적을 위해)
    await prisma.crawlerLog.create({
        data: {
            status: 'STARTED',
            message: '크롤러 서비스가 실행되었습니다.',
            itemsFound: 0
        }
    });

    try {
        const crawlers = [
            { name: 'VnExpress', fn: crawlVnExpress },
            { name: 'Yonhap', fn: crawlYonhap },
            { name: 'InsideVina', fn: crawlInsideVina },
            { name: 'TuoiTre', fn: crawlTuoitre },
            { name: 'ThanhNien', fn: crawlThanhNien },
            { name: 'VnExpressVN', fn: crawlVnExpressVN },
            { name: 'VnExpress Economy', fn: crawlVnExpressEconomy },
            { name: 'Cafef', fn: crawlCafef },
            { name: 'PublicSecurity', fn: crawlPublicSecurity },
            { name: 'Saigoneer', fn: crawlSaigoneer },
            { name: 'SoraNews24', fn: crawlSoraNews24 },
            { name: 'The Dodo', fn: crawlTheDodo },
            { name: 'PetMD', fn: crawlPetMD },
            { name: 'Bon Appétit', fn: crawlBonAppetit },
            { name: 'Health', fn: crawlHealth }
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

        // 1단계: 중복 체크 (병렬 처리)
        console.log('\n📋 중복 체크 중...');
        const newItems = [];
        const checkPromises = allItems.map(async (item) => {
            const exists = await prisma.newsItem.findFirst({
                where: { originalUrl: item.originalUrl }
            });
            if (!exists) {
                // 연합뉴스는 Korea-Vietnam 카테고리로 고정
                if (item.source === 'Yonhap News') {
                    item.category = 'Korea-Vietnam';
                }
                newItems.push(item);
            }
        });
        await Promise.all(checkPromises);
        console.log(`✅ 중복 체크 완료: ${allItems.length}개 중 ${newItems.length}개 신규`);

        // 2단계: 병렬 번역 (배치 처리)
        let savedCount = 0;
        let translatedCount = 0;
        let translationFailedCount = 0;
        const translationFailedItems = [];

        // 병렬 번역 (배치 처리) - 성능 개선
        const BATCH_SIZE = 10; // 동시에 10개씩 번역 (배치 크기 증가)
        console.log(`\n🔄 병렬 번역 시작 (배치 크기: ${BATCH_SIZE}개, 총 ${newItems.length}개)...`);
        
        for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
            const batch = newItems.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(newItems.length / BATCH_SIZE);
            
            console.log(`\n📦 배치 ${batchNum}/${totalBatches} 처리 중 (${batch.length}개)...`);

            // 배치 내 병렬 번역
            const translationResults = await Promise.allSettled(
                batch.map(async (item) => {
                    console.log(`   🔄 [${item.source}] ${item.title.substring(0, 40)}...`);
                    const processed = await translateAndCategorize(item);
                    return { item, processed };
                })
            );

            // 번역 결과 병렬 저장 (순차 저장 대신)
            const savePromises = translationResults.map(async (result) => {
                if (result.status === 'fulfilled') {
                    const { item, processed } = result.value;
                    const isKoreanSource = item.source === 'Yonhap News' || item.source === 'InsideVina';
                    
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
                    } else if (isKoreanSource) {
                        console.log(`   ℹ️ 한국어 소스 (번역 불필요): ${item.title.substring(0, 40)}...`);
                    } else {
                        console.log(`   ✅ 번역 완료: ${processed.translatedTitle.substring(0, 40)}...`);
                    }

                    const finalCategory = item.source === 'Yonhap News' ? 'Korea-Vietnam' : processed.category;
                    translatedCount++;

                    // 병렬 저장
                    await prisma.newsItem.create({
                        data: {
                            ...item,
                            translatedTitle: processed.translatedTitle || null,
                            category: finalCategory,
                        }
                    });

                    savedCount++;
                    return { success: true };
                } else {
                    console.error(`   ❌ 번역 실패:`, result.reason);
                    return { success: false };
                }
            });

            // 모든 저장 작업 완료 대기
            await Promise.all(savePromises);
            
            console.log(`   ✅ 배치 ${batchNum} 완료 (${savedCount}/${newItems.length}개 저장됨)`);
            
            // 배치 간 짧은 대기 (rate limit 방지) - 딜레이 감소
            if (i + BATCH_SIZE < newItems.length) {
                await new Promise(resolve => setTimeout(resolve, 200)); // 500ms -> 200ms
            }
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
    } catch (error) {
        console.error('[Cron] Crawler service critical failure:', error);
        
        // 치명적 에러 발생 시 로그 기록
        await prisma.crawlerLog.create({
            data: {
                status: 'FAILED',
                message: `치명적 오류 발생: ${error.message}`,
                errorDetails: JSON.stringify({
                    stack: error.stack,
                    time: new Date().toISOString()
                }, null, 2)
            }
        });

        throw error;
    }
}

module.exports = { runCrawlerService };
