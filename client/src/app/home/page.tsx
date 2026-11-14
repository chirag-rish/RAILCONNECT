
"use client";

import { CTASection } from "@/components/ui/hero-dithering-card";
import SearchTrain from "@/components/SearchTrain";
import { Train, Shield, Zap, CreditCard, Bot, TrendingUp, MapPin, Globe, ChevronRight, ArrowRight, ShieldCheck, Activity, Twitter, Github } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { tomorrowIST } from "@/utils/istTime";

export default function Home() {
  const popularRoutes = [
    { from: "NDLS", to: "BCT", name: "Delhi → Mumbai", trains: 12, code: "12951", type: "Rajdhani Express" },
    { from: "NDLS", to: "MAS", name: "Delhi → Chennai", trains: 8, code: "12622", type: "Tamil Nadu Express" },
    { from: "BCT", to: "SBC", name: "Mumbai → Bangalore", trains: 6, code: "11013", type: "Coimbatore Express" },
    { from: "HWH", to: "NDLS", name: "Kolkata → Delhi", trains: 15, code: "12301", type: "Rajdhani Express" },
    { from: "PUNE", to: "BCT", name: "Pune → Mumbai", trains: 24, code: "12128", type: "Intercity Express" }
  ];

  return (
    <main className="min-h-screen font-sans">
      <CTASection />

      {/* Search Protocol Section */}
      <section className="py-32 border-b relative overflow-hidden">
        <div className="absolute top-0 left-0 p-20 opacity-[0.03] select-none pointer-events-none">
          <MapPin className="w-96 h-96" />
        </div>
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.4em] mb-4">Grid Registry Access</p>
            <h2 className="text-5xl font-black text-slate-800 dark:text-neutral-100 tracking-tight leading-none mb-4 uppercase">
              Synchronize <span className="text-blue-600 dark:text-blue-400">Transit</span>
            </h2>
            <p className="text-slate-400 dark:text-neutral-400 font-medium max-w-lg mx-auto text-sm leading-relaxed">Access real-time inventory and authorize passage across the national corridor network.</p>
          </div>
          <div className="card p-4 rounded-[4rem]">
            <SearchTrain />
          </div>
        </div>
      </section>

      {/* Infrastructure Features */}
      <section className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-end justify-between mb-24 gap-8">
            <div className="max-w-2xl">
              <h2 className="text-5xl font-black text-slate-900 dark:text-neutral-100 tracking-tight leading-none uppercase mb-6">
                Enterprise <br />
                <span className="text-blue-600 dark:text-blue-400">Infrastructure</span>
              </h2>
              <p className="text-lg text-slate-400 dark:text-neutral-400 font-medium leading-relaxed">Standardized protocols and high-precision logistics units for the modern national rail grid.</p>
            </div>
            <div className="flex items-center gap-2 p-4 bg-slate-50 dark:bg-neutral-800 rounded-2xl border border-slate-100 dark:border-neutral-700">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-black text-slate-700 dark:text-neutral-300 uppercase tracking-widest leading-none">ISO-9001 Certified System</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            <FeatureCard
              icon={<Zap className="w-7 h-7" />}
              title="Hyper-Logic Routing"
              description="High-performance engine processing complex corridor mapping with sub-millisecond precision."
            />
            <FeatureCard
              icon={<Shield className="w-7 h-7" />}
              title="Secure Data Vault"
              description="End-to-end encryption for every transaction and traveler identity protection protocols."
            />
            <FeatureCard
              icon={<Bot className="w-7 h-7" />}
              title="AI Logistics Unit"
              description="Intelligent system assistant for route optimization and predictive maintenance logs."
            />
            <FeatureCard
              icon={<Activity className="w-7 h-7" />}
              title="Telemetry Feed"
              description="Real-time precision tracking of all active rolling stock across the national infrastructure."
            />
            <FeatureCard
              icon={<CreditCard className="w-7 h-7" />}
              title="Financial Nexus"
              description="Integrated wallet core for high-trust transaction settlement and instant audit trails."
            />
            <FeatureCard
              icon={<TrendingUp className="w-7 h-7" />}
              title="Diagnostic Analytics"
              description="Advanced business intelligence reflecting real-time inventory utilization and yield management."
            />
          </div>
        </div>
      </section>

      {/* System Metrics */}
      <section className="py-24 overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 bg-[url('/noise.svg')]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid md:grid-cols-4 gap-12 text-center">
            <StatCard number="12M+" label="Authorized Entities" />
            <StatCard number="850+" label="Active Corridors" />
            <StatCard number="0.02s" label="Response Latency" />
            <StatCard number="99.9%" label="Reliability Index" />
          </div>
        </div>
      </section>

      {/* Prime Corridors */}
      <section className="py-32 border-y">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24">
            <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.4em] mb-4">High-Frequency Transit</p>
            <h2 className="text-5xl font-black text-slate-800 dark:text-neutral-100 tracking-tight leading-none uppercase">Prime <span className="text-blue-600 dark:text-blue-400">Corridors</span></h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            {popularRoutes.map((route, index) => (
              <motion.div
                key={route.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Link
                  href={`/search?source=${route.from}&destination=${route.to}&date=${tomorrowIST()}`}
                  className="bg-white p-10 rounded-[3rem] shadow-sm hover:shadow-2xl hover:shadow-blue-50/50 transition-all border border-slate-100 hover:border-blue-400 group relative overflow-hidden block"
                >
                  <div className="flex items-center justify-between mb-8">
                    <div className="p-4 bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-300 group-hover:bg-blue-600 group-hover:text-white rounded-2xl transition-all shadow-inner group-hover:shadow-lg">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-300 dark:text-neutral-400 uppercase tracking-widest mb-1">Grid Activity</p>
                      <span className="text-xs font-black text-slate-800 dark:text-neutral-100 uppercase group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors tracking-tighter">{route.trains} Active Cycles</span>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-slate-800 dark:text-neutral-100 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition tracking-tight uppercase leading-none">
                    {route.name}
                  </h3>
                  <div className="flex items-center gap-3 mb-8">
                    <span className="bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-300 text-[9px] font-black px-2 py-0.5 rounded border border-slate-100 dark:border-neutral-700 tracking-widest uppercase">ID: {route.code}</span>
                    <div className="w-1 h-1 bg-slate-200 dark:bg-neutral-700 rounded-full" />
                    <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{route.type}</span>
                  </div>
                  <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                    <p className="text-xs font-black text-slate-700 dark:text-neutral-300 uppercase tracking-widest">Base Unit: ₹850</p>
                    <ArrowRight className="w-5 h-5 text-slate-200 dark:text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* System Invitation */}
      <section className="py-40">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 rounded-full border border-blue-100 dark:border-neutral-700 mb-10">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Secure Global Infrastructure</span>
          </div>
          <h2 className="text-6xl font-black text-slate-900 dark:text-neutral-100 tracking-tighter mb-8 leading-[0.9] uppercase">
            Join the <br />
            <span className="text-blue-600 dark:text-blue-400">RailConnect</span> Grid
          </h2>
          <p className="text-xl text-slate-400 dark:text-neutral-400 font-medium mb-16 max-w-2xl mx-auto leading-relaxed">
            Standardize your transit logistics today with India&apos;s most advanced rail management architecture. Professional, reliable, and national.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
            <Link
              href="/register"
              className="w-full sm:w-auto px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-[10px] hover:bg-slate-800 shadow-2xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-3 group"
            >
              Initialize Node <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/search"
              className="w-full sm:w-auto px-12 py-6 bg-white border-2 border-slate-100 text-slate-400 hover:text-slate-800 hover:border-slate-800 rounded-[2rem] font-black uppercase tracking-[0.3em] text-[10px] transition-all active:scale-95"
            >
              Registry Access
            </Link>
          </div>
        </div>
      </section>

      {/* Logistics Footer */}
      <footer className="py-32 border-t bg-background text-foreground">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-20">
            <div className="md:col-span-4">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-primary rounded-lg text-primary-foreground">
                  <Train className="w-5 h-5" />
                </div>
                <h3 className="text-foreground font-black text-2xl tracking-tighter uppercase leading-none">RailConnect <span className="text-primary">Pro</span></h3>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed font-medium max-w-sm mb-10">National rail infrastructure management and high-precision transit gateway. Secure. Reliable. Scalable.</p>
              <div className="flex gap-4">
                {[Twitter, Github, Globe].map((Icon, i) => (
                  <div key={i} className="p-3 bg-muted rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all cursor-pointer">
                    <Icon className="w-5 h-5" />
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-8 grid md:grid-cols-3 gap-12">
              <FooterColumn
                title="Infrastructure"
                links={[
                  { label: 'Booking Registry', href: '/search' },
                  { label: 'Network status', href: '/live-station' },
                  { label: 'Telemetry Grid', href: '/train-tracking' },
                  { label: 'ETA Forecast', href: '/eta-prediction' },
                  { label: 'Financial Hub', href: '/wallet' }
                ]}
              />
              <FooterColumn
                title="Operations"
                links={[
                  { label: 'AI Logical Unit', href: '/ai-assistant' },
                  { label: 'Support Desk', href: '/notifications' },
                  { label: 'Pathfinder', href: '/search' },
                  { label: 'Journey Wallet', href: '/wallet' }
                ]}
              />
              <FooterColumn
                title="Access"
                links={[
                  { label: 'Member Sign In', href: '/login' },
                  { label: 'Register', href: '/register' },
                  { label: 'Forgot Password', href: '/forgot-password' },
                  { label: 'Live Station', href: '/live-station' }
                ]}
              />
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="group p-10 rounded-[2.5rem] border border-slate-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-2xl hover:shadow-blue-50/50 transition-all hover:-translate-y-1">
    <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 flex items-center justify-center mb-8 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
      {icon}
    </div>
    <h3 className="text-xl font-black text-slate-800 dark:text-neutral-100 mb-4 uppercase tracking-tight">{title}</h3>
    <p className="text-sm text-slate-400 dark:text-neutral-400 font-medium leading-relaxed">{description}</p>
  </div>
);

const StatCard = ({ number, label }: { number: string; label: string }) => (
  <div>
    <p className="text-4xl md:text-5xl font-black text-slate-900 dark:text-neutral-100 tracking-tighter mb-3">{number}</p>
    <p className="text-[10px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-[0.35em]">{label}</p>
  </div>
);

const FooterColumn = ({ title, links }: { title: string; links: { label: string; href: string }[] }) => (
  <div>
    <h3 className="text-[10px] font-black text-slate-500 dark:text-neutral-400 uppercase tracking-[0.35em] mb-6">{title}</h3>
    <ul className="space-y-4">
      {links.map((link) => (
        <li key={link.label}>
          <Link href={link.href} className="text-sm text-slate-400 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);
