"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, memo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Train, LogOut, Wallet, Menu, X } from 'lucide-react';
import UserMenu from './UserMenu';

function NavbarComponent() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    const shouldHideNavbar = pathname === '/login' || pathname === '/user/login' || pathname === '/register' || pathname === '/forgot-password' || pathname.startsWith('/reset-password/');

    useEffect(() => {
        if (!mobileOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMobileOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [mobileOpen]);

    if (shouldHideNavbar) {
        return null;
    }

    const isActive = (href: string) => (pathname === href ? 'true' : undefined);

    return (
        <nav aria-label="Primary navigation" className="border-b sticky top-0 z-[9999] shadow-sm bg-white dark:bg-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" className="flex items-center space-x-2 group">
                            <div className="bg-blue-600 dark:bg-blue-700 p-1.5 rounded-lg shadow-sm group-hover:shadow-blue-200 transition-all">
                                <Train className="h-5 w-5 text-white" aria-hidden="true" />
                            </div>
                            <span className="font-bold text-xl tracking-tight text-blue-900 dark:text-blue-200">
                                Rail
                                <span className="text-blue-600 dark:text-blue-400">Connect</span>
                            </span>
                        </Link>
                    </div>
                    <button
                        type="button"
                        className="md:hidden p-2 rounded-lg text-blue-600 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={mobileOpen}
                        aria-controls="navbar-menu"
                        onClick={() => setMobileOpen((prev) => !prev)}
                    >
                        {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                    <div className="flex items-center space-x-6">
                        <div className="hidden md:flex items-center space-x-1">
                            <NavLink href="/home">Home</NavLink>
                            <NavLink href="/search">Book Tickets</NavLink>
                            <NavLink href="/live-station">Live Status</NavLink>
                            <NavLink href="/train-tracking">Tracking</NavLink>
                            <NavLink href="/eta-prediction">ETA</NavLink>
                            <NavLink href="/wallet">Wallet</NavLink>
                            <NavLink href="/ai-assistant">AI Assistant</NavLink>
                        </div>

                        <div className="h-6 w-px bg-blue-100 hidden md:block" />

                        <div className="flex items-center space-x-3">
                            {user ? (
                                <>
                                    <div className="hidden lg:flex flex-col items-end mr-2">
                                        <span className="text-xs font-bold text-blue-900 dark:text-blue-200 leading-none mb-0.5">{user.name}</span>
                                        <span className="text-[9px] text-blue-400 dark:text-blue-300 font-bold uppercase tracking-widest">{user.role} terminal</span>
                                    </div>
                                    <Link href="/wallet" className="p-2 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all relative">
                                        <Wallet className="h-5 w-5" />
                                    </Link>

                                    {user.role === 'admin' && (
                                        <Link href="/admin" className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-900 hover:bg-blue-100 transition-all">
                                            Admin
                                        </Link>
                                    )}
                                    {user.role === 'tte' && (
                                        <Link href="/tte" className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200 transition-all uppercase tracking-tighter">
                                            Staff Portal
                                        </Link>
                                    )}
                                    <UserMenu isAdmin={user.role === 'admin'} />
                                    <button
                                        onClick={logout}
                                        className="p-2 rounded-lg text-blue-300 hover:text-red-500 hover:bg-red-100 transition-all"
                                        title="Logout"
                                    >
                                        <LogOut size={20} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <NavLink href="/login">Login</NavLink>
                                    <NavLink href="/register">Register</NavLink>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {mobileOpen && (
                <div id="navbar-menu" className="md:hidden bg-white dark:bg-slate-900 border-t border-blue-100 dark:border-slate-800">
                    <div className="px-4 py-4 space-y-2">
                        <NavLink href="/home" active={isActive('/home')} onClick={() => setMobileOpen(false)}>
                            Home
                        </NavLink>
                        <NavLink href="/search" active={isActive('/search')} onClick={() => setMobileOpen(false)}>
                            Book Tickets
                        </NavLink>
                        <NavLink href="/live-station" active={isActive('/live-station')} onClick={() => setMobileOpen(false)}>
                            Live Status
                        </NavLink>
                        <NavLink href="/train-tracking" active={isActive('/train-tracking')} onClick={() => setMobileOpen(false)}>
                            Tracking
                        </NavLink>
                        <NavLink href="/eta-prediction" active={isActive('/eta-prediction')} onClick={() => setMobileOpen(false)}>
                            ETA
                        </NavLink>
                        <NavLink href="/wallet" active={isActive('/wallet')} onClick={() => setMobileOpen(false)}>
                            Wallet
                        </NavLink>
                        <NavLink href="/ai-assistant" active={isActive('/ai-assistant')} onClick={() => setMobileOpen(false)}>
                            AI Assistant
                        </NavLink>
                    </div>
                </div>
            )}
        </nav>
    );
}

function NavLink({
    href,
    children,
    active,
    onClick,
}: {
    href: string;
    children: React.ReactNode;
    active?: string;
    onClick?: () => void;
}) {
    const isActive = active === 'true';

    return (
        <Link
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`block px-3 py-2 rounded-lg text-sm font-bold tracking-tight transition-all ${
                isActive
                    ? 'bg-blue-100 text-blue-900 dark:bg-slate-800 dark:text-blue-200'
                    : 'text-blue-900 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-slate-800'
            }`}
            onClick={onClick}
        >
            {children}
        </Link>
    );
}

export default memo(NavbarComponent);
