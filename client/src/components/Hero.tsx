"use client";

import { useEffect } from "react";
import Link from "next/link";
import { renderCanvas } from "@/components/ui/canvas"
import { Shapes, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
    useEffect(() => {
        renderCanvas();
    }, []);

    return (
        <section id="home" className="relative min-h-[90vh] overflow-hidden flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900">
            <div className="animation-delay-8 animate-fadeIn flex flex-col items-center justify-center px-4 text-center z-10">
                <div className="mb-6 mt-10 md:mt-20">
                    <div className="relative flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs leading-6 shadow-md bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400">
                        <Shapes className="h-5 p-1 text-blue-400" /> New Features.
                        <Link
                            href="/live-station"
                            className="ml-1 flex items-center font-semibold hover:text-blue-600 transition"
                        >
                            Explore Live Status{" "}
                            <ArrowRight className="h-4 w-4 ml-1" />
                        </Link>
                    </div>
                </div>

                <div className="mb-10 mt-4 md:mt-6">
                    <div className="px-2">
                        <div className="relative mx-auto h-full max-w-7xl border p-6 rounded-3xl [mask-image:radial-gradient(800rem_96rem_at_center,white,transparent)] md:px-12 md:py-20 shadow-xl">
                            <h1 className="flex select-none flex-col px-3 py-2 text-center text-5xl font-extrabold leading-none tracking-tight md:text-8xl text-slate-900 dark:text-neutral-100">
                                <Plus
                                    strokeWidth={4}
                                    className="text-blue-400 absolute -left-5 -top-5 h-10 w-10 animate-pulse"
                                />
                                <Plus
                                    strokeWidth={4}
                                    className="text-blue-400 absolute -bottom-5 -left-5 h-10 w-10 animate-pulse"
                                />
                                <Plus
                                    strokeWidth={4}
                                    className="text-blue-400 absolute -right-5 -top-5 h-10 w-10 animate-pulse"
                                />
                                <Plus
                                    strokeWidth={4}
                                    className="text-blue-400 absolute -bottom-5 -right-5 h-10 w-10 animate-pulse"
                                />
                                RailConnect
                            </h1>
                            <p className="text-xl md:text-3xl font-light text-blue-700 dark:text-blue-400 mt-4">
                                Experience the Journey
                            </p>

                            <div className="flex items-center justify-center gap-2 mt-6">
                                <span className="relative flex h-3 w-3 items-center justify-center">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                                </span>
                                <p className="text-xs text-green-600 dark:text-green-400 font-bold">System Online & Live</p>
                            </div>
                        </div>
                    </div>

                    <p className="md:text-lg mx-auto mb-10 mt-8 max-w-2xl px-6 text-blue-500 dark:text-blue-400">
                        The fastest, smoothest way to book your train tickets across the nation.
                        <br />
                        <span className="font-bold text-blue-700 dark:text-blue-300">Secure. Reliable. Smart.</span>
                    </p>

                    <div className="flex justify-center gap-4">
                        <Link href="/register">
                            <Button variant="default" size="lg" className="rounded-full px-8 shadow-lg">
                                Get Started
                            </Button>
                        </Link>
                        <Link href="/login">
                            <Button variant="outline" size="lg" className="rounded-full px-8">
                                Login
                            </Button>
                        </Link>
                        <Link href="/wallet">
                            <Button variant="secondary" size="lg" className="rounded-full px-8">
                                Wallet
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
            <canvas
                className="pointer-events-none absolute inset-0 mx-auto opacity-30"
                id="canvas"
            ></canvas>
        </section>
    );
};
