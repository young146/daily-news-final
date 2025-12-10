'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Search, X } from 'lucide-react';

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState('');

    useEffect(() => {
        setCurrentDate(new Date().toLocaleDateString('ko-KR', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            weekday: 'long',
            timeZone: 'Asia/Bangkok'
        }));
    }, []);

    return (
        <header className="bg-white sticky top-0 z-50 shadow-sm">
            {/* Top Bar for Date/Info */}
            <div className="bg-primary text-white text-xs py-1">
                <div className="container mx-auto px-4 flex justify-between items-center">
                    <span>{currentDate || '\u00A0'}</span>
                    <span className="opacity-80">베트남-한국을 잇는 매일의 소식</span>
                </div>
            </div>

            <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                {/* Mobile Menu Button */}
                <button
                    className="md:hidden p-2 text-gray-600 hover:text-gray-900"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {/* Logo */}
                <Link href="/" className="flex-shrink-0 flex items-center gap-3">
                    <div className="relative w-10 h-10 md:w-12 md:h-12">
                        <Image
                            src="/logo.png"
                            alt="XinChao Logo"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-xl md:text-2xl font-serif font-bold text-gray-900 leading-none tracking-tight">
                            씬짜오<span className="text-accent">뉴스레터</span>
                        </h1>
                        <span className="text-[10px] text-gray-500 tracking-widest uppercase hidden sm:block">XinChao Daily News</span>
                    </div>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center space-x-8">
                    <Link href="/" className="text-base font-medium text-gray-700 hover:text-accent transition-colors">홈</Link>
                    <Link href="/category/society" className="text-base font-medium text-gray-700 hover:text-accent transition-colors">사회</Link>
                    <Link href="/category/economy" className="text-base font-medium text-gray-700 hover:text-accent transition-colors">경제</Link>
                    <Link href="/category/culture" className="text-base font-medium text-gray-700 hover:text-accent transition-colors">문화</Link>
                    <Link href="/category/policy" className="text-base font-medium text-gray-700 hover:text-accent transition-colors">정책</Link>
                </nav>

                {/* Actions */}
                <div className="flex items-center space-x-2 md:space-x-4">
                    <button className="p-2 text-gray-500 hover:text-accent transition-colors">
                        <Search size={20} />
                    </button>
                    <Link
                        href="/admin"
                        className="hidden md:inline-flex px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-orange-600 rounded-full transition-colors shadow-sm hover:shadow"
                    >
                        관리자
                    </Link>
                </div>
            </div>

            {/* Mobile Navigation Drawer */}
            {isMenuOpen && (
                <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-lg py-4 px-4 flex flex-col space-y-4 animate-in slide-in-from-top-5">
                    <Link href="/" className="text-base font-medium text-gray-700 hover:text-accent py-2 border-b border-gray-50" onClick={() => setIsMenuOpen(false)}>홈</Link>
                    <Link href="/category/society" className="text-base font-medium text-gray-700 hover:text-accent py-2 border-b border-gray-50" onClick={() => setIsMenuOpen(false)}>사회</Link>
                    <Link href="/category/economy" className="text-base font-medium text-gray-700 hover:text-accent py-2 border-b border-gray-50" onClick={() => setIsMenuOpen(false)}>경제</Link>
                    <Link href="/category/culture" className="text-base font-medium text-gray-700 hover:text-accent py-2 border-b border-gray-50" onClick={() => setIsMenuOpen(false)}>문화</Link>
                    <Link href="/category/policy" className="text-base font-medium text-gray-700 hover:text-accent py-2 border-b border-gray-50" onClick={() => setIsMenuOpen(false)}>정책</Link>
                    <Link href="/admin" className="text-base font-medium text-accent py-2" onClick={() => setIsMenuOpen(false)}>관리자 페이지</Link>
                </div>
            )}
        </header>
    );
}
