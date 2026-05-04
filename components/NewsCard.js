'use client';

import { useState, useEffect } from 'react';
import Link from "next/link";
import NewsImage from "./NewsImage";
import { ArrowRight, Calendar } from "lucide-react";

export default function NewsCard({ news }) {
    const [formattedDate, setFormattedDate] = useState('');

    useEffect(() => {
        if (news.publishedAt) {
            const date = new Date(news.publishedAt);
            setFormattedDate(date.toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }));
        } else if (news.date) {
            setFormattedDate(news.date);
        }
    }, [news.publishedAt, news.date]);

    return (
        <div className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 flex flex-col h-full">
            <div className="relative aspect-video w-full overflow-hidden">
                <NewsImage
                    src={news.imageUrl}
                    alt={news.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 text-xs font-bold bg-white/95 backdrop-blur-sm text-accent rounded-full shadow-sm">
                        {news.category}
                    </span>
                </div>
            </div>

            <div className="p-6 flex flex-col flex-grow">
                <div className="flex items-center text-xs text-gray-500 mb-3">
                    <Calendar size={14} className="mr-1" />
                    <span>{formattedDate}</span>
                </div>

                <h3 className="text-xl font-serif font-bold text-gray-900 mb-3 line-clamp-2 group-hover:text-accent transition-colors">
                    {news.translatedTitle || news.title}
                </h3>

                <p className="text-gray-600 text-sm line-clamp-3 mb-6 flex-grow leading-relaxed">
                    {news.translatedSummary || news.summary}
                </p>

                <div className="mt-auto pt-4 border-t border-gray-50">
                    <a
                        href={news.wordpressUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center text-sm font-semibold text-primary transition-colors ${news.wordpressUrl ? 'group-hover:text-accent' : 'text-gray-400 cursor-not-allowed'}`}
                        onClick={(e) => !news.wordpressUrl && e.preventDefault()}
                    >
                        자세히 보기 <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
                    </a>
                </div>
            </div>
        </div>
    );
}
