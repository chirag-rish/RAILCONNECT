
"use client"

import * as React from "react"
import { Github, Twitter, User, ShieldCheck, AtSign, KeyRound } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/utils/cn"

interface AuthFormProps {
  onSubmit: (email: string, password: string) => Promise<void>
  isLoading?: boolean
  title?: string
  subtitle?: string
  showBackButton?: boolean
  isAdmin?: boolean
}

const AuthForm: React.FC<AuthFormProps> = ({
  onSubmit,
  isLoading = false,
  title = "Authenticate Entity",
  subtitle = "Synchronize with national corridor registry",
  isAdmin = false,
}) => {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {}

    if (!email.trim()) {
      newErrors.email = "Credential email required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email designation"
    }

    if (!password) {
      newErrors.password = "Access key required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (validateForm()) {
      await onSubmit(email, password)
    }
  }

  return (
    <div className="bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 text-blue-900 selection:bg-blue-100 min-h-screen py-20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg bg-gradient-to-br from-blue-50 via-white to-slate-100 rounded-[3rem] shadow-2xl shadow-blue-100 border border-blue-100 p-10 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-10 opacity-[0.03] select-none pointer-events-none">
          <ShieldCheck className="w-64 h-64" />
        </div>

        <Logo isAdmin={isAdmin} />
        <Header title={title} subtitle={subtitle} />

        <LoginForm
          onSubmit={handleSubmit}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          errors={errors}
          setErrors={setErrors}
          isLoading={isLoading}
        />

        <Divider />
        <SocialButtons />
        <TermsAndConditions />
      </motion.div>
    </div>
  )
}

const Logo: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => (
  <div className="mb-8 flex justify-center items-center gap-3">
    <div
      className={cn(
        "p-2.5 rounded-xl shadow-lg",
        isAdmin ? "bg-blue-900 text-white" : "bg-blue-600 text-white"
      )}
    >
      {isAdmin ? (
        <ShieldCheck className="h-6 w-6" />
      ) : (
        <User className="h-6 w-6" />
      )}
    </div>
    <span className="text-xl font-black text-blue-900 uppercase tracking-tighter">
      RailConnect
    </span>
  </div>
)

const Header: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => (
  <div className="mb-10 text-center">
    <h1 className="text-3xl font-black text-blue-900 uppercase tracking-tight leading-none mb-3">
      {title}
    </h1>
    <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em]">
      {subtitle}
    </p>
  </div>
)

const SocialButtons: React.FC = () => (
  <div className="mb-8 flex gap-4">
    <SocialButton icon={<Twitter size={18} />} />
    <SocialButton icon={<Github size={18} />} />
    <SocialButton fullWidth>Global SSO Sync</SocialButton>
  </div>
)

const SocialButton: React.FC<{
  icon?: React.ReactNode
  fullWidth?: boolean
  children?: React.ReactNode
}> = ({ icon, fullWidth, children }) => (
  <button
    type="button"
    className={cn(
      "flex items-center justify-center gap-2 rounded-2xl border-2 border-blue-100 bg-blue-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-blue-400 transition-all hover:bg-white hover:border-blue-500 hover:text-blue-600 hover:shadow-lg active:scale-95",
      fullWidth ? "flex-1" : ""
    )}
  >
    {icon}
    {children && <span>{children}</span>}
  </button>
)

const Divider: React.FC = () => (
  <div className="my-8 flex items-center gap-4">
    <div className="h-[1px] w-full bg-blue-100" />
    <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest">
      Protocol
    </span>
    <div className="h-[1px] w-full bg-blue-100" />
  </div>
)

const LoginForm: React.FC<{
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
  email: string
  setEmail: (email: string) => void
  password: string
  setPassword: (password: string) => void
  errors: { email?: string; password?: string }
  setErrors: (errors: { email?: string; password?: string }) => void
  isLoading: boolean
}> = ({
  onSubmit,
  email,
  setEmail,
  password,
  setPassword,
  errors,
  setErrors,
  isLoading,
}) => {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2 group">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 group-focus-within:text-blue-600 transition-colors">
          Email Identity
        </label>
        <div className="relative">
          <AtSign className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-200 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="email"
            placeholder="IDENTITY@GRID.COM"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (errors.email) {
                setErrors({ ...errors, email: undefined })
              }
            }}
            className="w-full bg-blue-50 border-2 border-blue-100 rounded-2xl py-4 pl-14 pr-6 text-sm font-black text-blue-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-blue-200 shadow-inner"
          />
        </div>
        {errors.email && (
          <p className="text-[9px] font-black text-red-500 uppercase tracking-widest px-1">
            {errors.email}
          </p>
        )}
      </div>

      <div className="space-y-2 group">
        <div className="flex items-end justify-between px-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-focus-within:text-blue-600 transition-colors">
            Access Key
          </label>
          <a
            href="/forgot-password"
            title="Initialize Recovery Protocol"
            className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
          >
            Forgot?
          </a>
        </div>
        <div className="relative">
          <KeyRound className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-200 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (errors.password) {
                setErrors({ ...errors, password: undefined })
              }
            }}
            className="w-full bg-blue-50 border-2 border-blue-100 rounded-2xl py-4 pl-14 pr-6 text-sm font-black text-blue-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-blue-200 shadow-inner"
          />
        </div>
        {errors.password && (
          <p className="text-[9px] font-black text-red-500 uppercase tracking-widest px-1">
            {errors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white font-black uppercase tracking-[0.4em] text-[10px] py-6 px-4 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 disabled:opacity-50 mt-4 group/btn"
      >
        {isLoading ? (
          "Synchronizing..."
        ) : (
          <span className="flex items-center justify-center gap-2">
            Initiate Handshake
          </span>
        )}
      </button>
    </form>
  )
}

const TermsAndConditions: React.FC = () => (
  <p className="mt-10 text-[9px] font-black text-blue-300 uppercase tracking-widest text-center leading-relaxed">
    By initializing this session, you acknowledge the{" "}
    <a href="#" className="text-blue-600/50 hover:text-blue-600 underline">
      Terms of Access
    </a>{" "}
    and the{" "}
    <a href="#" className="text-blue-600/50 hover:text-blue-600 underline">
      Registry Protocols
    </a>.
  </p>
)

export default AuthForm
