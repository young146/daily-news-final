import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 직원 CRM 시트 (xinchao_crm 공통 source)
const SHEET_ID = '1Iue5sV2PE3c6rqLuVozrp14JiKciGyKvbP8bJheqWlA';
const CUSTOMER_TAB = '고객DB';
const CONSULT_TAB = '상담이력';

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuote) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cell += ch; }
        } else {
            if (ch === '"') inQuote = true;
            else if (ch === ',') { row.push(cell); cell = ''; }
            else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
            else if (ch === '\r') { /* skip */ }
            else { cell += ch; }
        }
    }
    if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
    return rows;
}

async function fetchTab(tabName) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&v=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${tabName} 탭 HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes('google.visualization') || text.includes('<!DOCTYPE')) {
        throw new Error(`${tabName} 탭: gviz 오류 응답`);
    }
    return parseCSV(text);
}

export async function GET() {
    const startedAt = Date.now();
    console.log('[Cron] sync-crm-customers triggered');

    const prisma = new PrismaClient();
    try {
        // 1. 시트 fetch
        const [customerRows, consultRows] = await Promise.all([
            fetchTab(CUSTOMER_TAB),
            fetchTab(CONSULT_TAB),
        ]);

        // 2. 이메일 dedupe (admin 페이지와 동일 로직)
        //   고객DB: 1행 예시("86DH Vina") + 2행 헤더("고객사") 제외
        const customerData = customerRows.filter(
            (r) => r[0] && r[0].trim() && r[0].trim() !== '고객사' && r[0].trim() !== '86DH Vina'
        );
        //   상담이력: 1행 헤더 제외
        const consultData = consultRows.slice(1).filter((r) => r[2] && r[2].trim());

        const byEmail = new Map();
        const add = (rawEmail, customer, contact, phone) => {
            const e = (rawEmail || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
            if (!EMAIL_RE.test(e)) return;
            if (byEmail.has(e)) return; // 첫 등장 데이터 유지
            byEmail.set(e, {
                email: e,
                customer: (customer || '').trim(),
                contact: (contact || '').trim(),
                phone: (phone || '').trim(),
            });
        };

        for (const r of customerData) add(r[4], r[0], r[1], r[3]);
        for (const r of consultData) add(r[6], r[2], r[3], r[5]);

        const entries = Array.from(byEmail.values());

        // 3. 발송 DB upsert
        let added = 0, promoted = 0, updated = 0, failed = 0;
        for (const e of entries) {
            try {
                const existing = await prisma.subscriber.findUnique({ where: { email: e.email } });
                if (existing) {
                    const justPromoted = !existing.isCustomer;
                    await prisma.subscriber.update({
                        where: { email: e.email },
                        data: {
                            isActive: true,
                            isCustomer: true, // 강제 승격
                            category: 'customer', // 분류도 고객으로
                            company: e.customer || existing.company,
                            name: e.contact || existing.name,
                            phone: e.phone || existing.phone,
                        },
                    });
                    if (justPromoted) promoted++; else updated++;
                } else {
                    await prisma.subscriber.create({
                        data: {
                            email: e.email,
                            company: e.customer || null,
                            name: e.contact || null,
                            phone: e.phone || null,
                            isActive: true,
                            isCustomer: true,
                            category: 'customer',
                        },
                    });
                    added++;
                }
            } catch (err) {
                failed++;
                console.error(`[Cron] sync-crm-customers: ${e.email} 실패 — ${err.message}`);
            }
        }

        const result = {
            success: true,
            sheet_total: entries.length,
            added,
            promoted,
            updated,
            failed,
            elapsed_ms: Date.now() - startedAt,
        };
        console.log('[Cron] sync-crm-customers 완료:', result);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[Cron] sync-crm-customers 실패:', error);
        return NextResponse.json(
            { success: false, error: error.message, elapsed_ms: Date.now() - startedAt },
            { status: 500 }
        );
    } finally {
        await prisma.$disconnect();
    }
}
