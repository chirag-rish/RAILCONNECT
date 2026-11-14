
"use client";

import React, { useRef, useEffect, useState } from "react";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
}

const Button = ({
  children,
  variant = "default",
  className = "",
  ...props
}: ButtonProps) => {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

  const variantStyles = {
    default:
      "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200",
    outline:
      "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

const Input = ({ className = "", ...props }: InputProps) => {
  return (
    <input
      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm text-gray-800 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
};

type RoutePoint = {
  x: number;
  y: number;
  delay: number;
};

type Route = {
  start: RoutePoint;
  end: RoutePoint;
  color: string;
};

type Dot = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
};

const routes: Route[] = [
  {
    start: { x: 100, y: 150, delay: 0 },
    end: { x: 200, y: 80, delay: 2 },
    color: "#2563eb",
  },
  {
    start: { x: 200, y: 80, delay: 2 },
    end: { x: 260, y: 120, delay: 4 },
    color: "#2563eb",
  },
  {
    start: { x: 50, y: 50, delay: 1 },
    end: { x: 150, y: 180, delay: 3 },
    color: "#2563eb",
  },
  {
    start: { x: 280, y: 60, delay: 0.5 },
    end: { x: 180, y: 180, delay: 2.5 },
    color: "#2563eb",
  },
];

const generateDots = (width: number, height: number): Dot[] => {
  const dots: Dot[] = [];
  const gap = 12;
  const dotRadius = 1;

  for (let x = 0; x < width; x += gap) {
    for (let y = 0; y < height; y += gap) {
      const isInMapShape =
        ((x < width * 0.25 && x > width * 0.05) &&
          (y < height * 0.4 && y > height * 0.1)) ||
        ((x < width * 0.25 && x > width * 0.15) &&
          (y < height * 0.8 && y > height * 0.4)) ||
        ((x < width * 0.45 && x > width * 0.3) &&
          (y < height * 0.35 && y > height * 0.15)) ||
        ((x < width * 0.5 && x > width * 0.35) &&
          (y < height * 0.65 && y > height * 0.35)) ||
        ((x < width * 0.7 && x > width * 0.45) &&
          (y < height * 0.5 && y > height * 0.1)) ||
        ((x < width * 0.8 && x > width * 0.65) &&
          (y < height * 0.8 && y > height * 0.6));

      if (isInMapShape && Math.random() > 0.3) {
        dots.push({
          x,
          y,
          radius: dotRadius,
          opacity: Math.random() * 0.5 + 0.2,
        });
      }
    }
  }

  return dots;
};

const DotMap = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;

      setDimensions({ width, height });
      canvas.width = width;
      canvas.height = height;
    });

    resizeObserver.observe(parent);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!dimensions.width || !dimensions.height) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasContext = canvas.getContext("2d");

    if (canvasContext === null) {
      return;
    }

    const ctx: CanvasRenderingContext2D = canvasContext;

    const dots = generateDots(dimensions.width, dimensions.height);
    let animationFrameId: number;
    let startTime = Date.now();

    function drawDots() {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      dots.forEach((dot) => {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(37, 99, 235, ${dot.opacity})`;
        ctx.fill();
      });
    }

    function drawRoutes() {
      const currentTime = (Date.now() - startTime) / 1000;

      routes.forEach((route) => {
        const elapsed = currentTime - route.start.delay;
        if (elapsed <= 0) return;

        const duration = 3;
        const progress = Math.min(elapsed / duration, 1);

        const x =
          route.start.x + (route.end.x - route.start.x) * progress;
        const y =
          route.start.y + (route.end.y - route.start.y) * progress;

        ctx.beginPath();
        ctx.moveTo(route.start.x, route.start.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = route.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(route.start.x, route.start.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = route.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#3b82f6";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
        ctx.fill();

        if (progress === 1) {
          ctx.beginPath();
          ctx.arc(route.end.x, route.end.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = route.color;
          ctx.fill();
        }
      });
    }

    function animate() {
      drawDots();
      drawRoutes();

      const currentTime = (Date.now() - startTime) / 1000;

      if (currentTime > 15) {
        startTime = Date.now();
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    animate();

    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
};

interface SocialButtonProps {
  icon?: string;
  label: string;
}

const SocialButton = ({ label }: SocialButtonProps) => (
  <button
    type="button"
    onClick={() => toast.error("Coming soon")}
    className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-xs font-bold text-slate-600 uppercase tracking-widest"
  >
    {label}
  </button>
);

const axiosErrorMessage = (error: unknown): string | undefined => {
  if (
    typeof error !== "object" ||
    error === null ||
    !("response" in error)
  ) {
    return undefined;
  }

  const response = error.response;

  if (
    typeof response !== "object" ||
    response === null ||
    !("data" in response)
  ) {
    return undefined;
  }

  const data = response.data;

  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return undefined;
};

const SignInCard = () => {
  const router = useRouter();
  const { login } = useAuth();

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      await login({ email, password });
      toast.success("Login successful!");
    } catch (error: unknown) {
      const message = axiosErrorMessage(error) || "Login failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    router.push("/home");
  };

  return (
    <div className="flex w-full min-h-screen items-center justify-center py-8 px-2 md:px-0 bg-transparent">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-4xl overflow-visible rounded-[2.5rem] flex flex-col md:flex-row bg-white shadow-2xl shadow-blue-200/50 border border-blue-200"
      >
        <div className="hidden md:flex md:w-2/5 h-[650px] relative overflow-hidden bg-slate-50 border-r border-blue-100 items-center justify-center">
          <DotMap />

          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 z-10 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="mb-8"
            >
              <div className="h-16 w-16 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-200">
                <ArrowRight className="text-white h-8 w-8" />
              </div>
            </motion.div>

            <h2 className="text-3xl font-black mb-3 text-slate-800 tracking-tight">
              RailConnect
            </h2>

            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
              Infrastructure Command & Transit Management
            </p>
          </div>
        </div>

        <div className="w-full md:w-3/5 p-8 md:p-12 flex flex-col justify-center bg-white min-h-[650px]">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl font-black mb-2 text-slate-900 tracking-tight">
              System Login
            </h1>

            <p className="text-slate-400 font-bold uppercase tracking-widest text-[12px] mb-8">
              Secure Access Gateway
            </p>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1"
                >
                  Email Identity{" "}
                  <span aria-hidden="true" className="text-red-500">
                    *
                  </span>
                </label>

                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@organization.com"
                  required
                  aria-required="true"
                  aria-describedby="email-hint"
                  className="bg-slate-50 border-slate-200 h-12 px-4 rounded-xl text-slate-900 focus:ring-slate-900 focus:border-slate-900"
                />

                <p
                  id="email-hint"
                  className="text-[10px] text-slate-400 mt-2"
                >
                  We&apos;ll never share your email. Used for login and notifications.
                </p>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1"
                >
                  Access Key{" "}
                  <span aria-hidden="true" className="text-red-500">
                    *
                  </span>
                </label>

                <div className="relative">
                  <Input
                    id="password"
                    type={isPasswordVisible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    aria-required="true"
                    aria-describedby="password-hint"
                    className="bg-slate-50 border-slate-200 h-12 px-4 rounded-xl text-slate-900 pr-12 focus:ring-slate-900 focus:border-slate-900"
                  />

                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 transition-colors"
                    onClick={() =>
                      setIsPasswordVisible(!isPasswordVisible)
                    }
                    aria-label={
                      isPasswordVisible ? "Hide password" : "Show password"
                    }
                  >
                    {isPasswordVisible ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>

                <p
                  id="password-hint"
                  className="text-[10px] text-slate-400 mt-2"
                >
                  Use at least 8 characters, including symbols and numbers.
                </p>

                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => router.push("/forgot-password")}
                    className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors"
                  >
                    Reset Credentials
                  </button>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl text-base uppercase tracking-widest transition-all active:scale-95"
                >
                  {isLoading ? "Validating..." : "Authorize"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSkip}
                  className="w-full h-12 rounded-xl text-base uppercase tracking-widest"
                >
                  Skip for now
                </Button>
              </div>

              <div className="relative my-8 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>

                <span className="relative px-4 bg-white text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
                  Alternate Entry
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SocialButton icon="google" label="Google" />
                <SocialButton icon="github" label="GitHub" />
              </div>

              <p className="mt-8 text-center text-xs text-slate-400 font-medium">
                Don&apos;t have clearance?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/register")}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Create Registry
                </button>
              </p>
            </form>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

const TravelConnectSignIn = () => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="flex w-full items-center justify-center">
        <SignInCard />
      </div>
    </div>
  );
};

export default TravelConnectSignIn;
