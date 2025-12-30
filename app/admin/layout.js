'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, FileText, Settings, LogOut, Users, Newspaper } from 'lucide-react';

export default function AdminLayout({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            }
        } catch (error) {
            console.error('Failed to fetch user:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/admin/login');
            router.refresh();
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    if (pathname === '/admin/login') {
        return children;
    }

    const navItems = [
        { href: '/admin', icon: LayoutDashboard, label: '대시보드' },
        { href: '/admin/published-news', icon: Newspaper, label: '발행된 뉴스 관리' },
        { href: '/admin/drafts', icon: FileText, label: '초안' },
        { href: '/admin/settings', icon: Settings, label: '설정' },
    ];

    if (user?.role === 'ADMIN') {
        navItems.push({ href: '/admin/users', icon: Users, label: '사용자 관리' });
    }

    return (
        <div className="flex h-screen bg-gray-100">
            <aside className="w-64 bg-slate-900 text-white flex flex-col">
                <div className="p-6 border-b border-slate-800">
                    <h1 className="text-xl font-bold font-serif">관리자 콘솔</h1>
                    <p className="text-xs text-slate-400 mt-1">신짜오 뉴스레터</p>
                </div>

                <nav className="flex-grow p-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || 
                            (item.href !== '/admin' && pathname.startsWith(item.href));
                        
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                                    isActive 
                                        ? 'bg-slate-800 text-white' 
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <Icon size={20} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    {user && (
                        <div className="px-4 py-2 mb-2 text-xs text-slate-400">
                            <div className="font-medium text-slate-300">{user.name || user.email}</div>
                            <div>{user.role === 'ADMIN' ? '관리자' : '편집자'}</div>
                        </div>
                    )}
                    <button 
                        onClick={handleLogout}
                        className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg text-red-400 hover:bg-slate-800 transition-colors"
                    >
                        <LogOut size={20} />
                        <span>로그아웃</span>
                    </button>
                </div>
            </aside>

            <main className="flex-grow overflow-auto">
                <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8">
                    <h2 className="text-lg font-semibold text-gray-800">개요</h2>
                    <div className="flex items-center space-x-4">
                        {user && (
                            <div className="flex items-center space-x-3">
                                <span className="text-sm text-gray-600">{user.email}</span>
                                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">
                                    {(user.name || user.email)[0].toUpperCase()}
                                </div>
                            </div>
                        )}
                    </div>
                </header>
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
