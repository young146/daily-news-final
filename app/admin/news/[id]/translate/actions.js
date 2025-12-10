'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { translateNewsItem } from '@/lib/translator';

const prisma = new PrismaClient();

export async function saveTranslation(formData) {
    const id = formData.get('id');
    const translatedTitle = formData.get('translatedTitle');
    const translatedSummary = formData.get('translatedSummary');
    const translatedContent = formData.get('translatedContent');
    const imageUrl = formData.get('imageUrl');

    await prisma.newsItem.update({
        where: { id },
        data: {
            translatedTitle,
            translatedSummary,
            translatedContent,
            imageUrl,
            translatedContent,
            imageUrl,
            translationStatus: 'COMPLETED' // Mark as completed when saved
        }
    });

    revalidatePath('/admin');
    // We don't redirect here to allow continuing editing, or we can redirect back to the same page
    // redirect(`/admin/news/${id}/translate`); 
    return { success: true };
}

export async function completeReview(formData) {
    const id = formData.get('id');
    const translatedTitle = formData.get('translatedTitle');
    const translatedSummary = formData.get('translatedSummary');
    const translatedContent = formData.get('translatedContent');
    const imageUrl = formData.get('imageUrl');

    await prisma.newsItem.update({
        where: { id },
        data: {
            translatedTitle,
            translatedSummary,
            translatedContent,
            imageUrl,
            translationStatus: 'COMPLETED'
        }
    });

    revalidatePath('/admin');
    return { success: true };
}

export async function generateTranslationAction(id) {
    try {
        const item = await prisma.newsItem.findUnique({ where: { id } });
        if (!item) throw new Error("Item not found");

        const { translatedTitle, translatedSummary, translatedContent } = await translateNewsItem(
            item.title,
            item.summary,
            item.content || item.summary
        );

        await prisma.newsItem.update({
            where: { id },
            data: {
                translatedTitle,
                translatedSummary,
                translatedContent,
                translationStatus: 'DRAFT'
            }
        });

        revalidatePath(`/admin/news/${id}/translate`);
        return { success: true, data: { translatedTitle, translatedSummary, translatedContent } };
    } catch (error) {
        console.error("Translation failed:", error);
        return { success: false, error: error.message };
    }
}

export async function skipItemAction(id) {
    await prisma.newsItem.update({
        where: { id },
        data: { translationStatus: 'SKIPPED' }
    });
    revalidatePath('/admin');
    return { success: true };
}
