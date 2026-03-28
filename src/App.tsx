import { useState, useEffect, FormEvent, useRef } from "react";

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

import { motion, AnimatePresence } from "motion/react";
import { domToPng } from "modern-screenshot";
import { 
  Send, 
  Sparkles, 
  Instagram, 
  MessageSquare, 
  Facebook, 
  Image as ImageIcon,
  TrendingUp,
  Lightbulb,
  Loader2,
  ChevronRight,
  Download,
  Share2,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Type as TypeIcon,
  RefreshCw
} from "lucide-react";

type PostType = "Instagram Ad" | "Poster" | "WhatsApp Ad" | "Facebook Ad";

interface GeneratedContent {
  platform: string;
  brand: string;
  headline: string;
  description: string;
  product_highlight: string;
  location: string;
  image_prompt: string;
  imageErrorType?: "QUOTA" | "SAFETY" | "OTHER";
  design_guidelines: {
    layout: string;
    color_theme: string;
    style: string;
  };
  imageUrl?: string;
  isFallbackImage?: boolean;
  styling?: {
    headlineSize: number;
    descriptionSize: number;
    fontFamily: string;
    descriptionLines: number;
  };
}

export default function App() {
  const [formData, setFormData] = useState({
    businessName: "",
    product: "",
    audience: "",
    location: "",
    language: "Hindi",
    postType: "Instagram Ad" as PostType
  });

  const resetForm = () => {
    setFormData({
      businessName: "",
      product: "",
      audience: "",
      location: "",
      language: "Hindi",
      postType: "Instagram Ad"
    });
    setResult(null);
    setError(null);
    setIsQuotaError(false);
  };

  const [loading, setLoading] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [hasKey, setHasKey] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer for quota retries
  useEffect(() => {
    if (retryAfter > 0) {
      timerRef.current = setInterval(() => {
        setRetryAfter((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            handleSubmit(); // Auto-retry
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [retryAfter]);

  const checkKey = async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    }
  };

  const openKeyDialog = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  useEffect(() => {
    checkKey();
  }, []);

  const languages = ["Hindi", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Marathi", "Gujarati", "English"];
  const postTypes: PostType[] = ["Instagram Ad", "Poster", "WhatsApp Ad", "Facebook Ad"];

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setIsQuotaError(false);
    setRetryAfter(0);
    setResult(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      setIsQuotaError(data.isQuotaError || false);
      if (data.retryAfter) setRetryAfter(data.retryAfter);

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate content. Please try again.");
      }

      const resultWithStyling = {
        ...data,
        styling: {
          headlineSize: 100,
          descriptionSize: 100,
          fontFamily: 'font-sans',
          descriptionLines: 4
        }
      };
      setResult(resultWithStyling);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateImage = async () => {
    if (!result) return;
    
    setIsRegeneratingImage(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_prompt: result.image_prompt,
          postType: result.platform,
          businessName: result.brand,
          product: result.product_highlight,
          headline: result.headline
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to regenerate image");

      setResult({
        ...result,
        imageUrl: data.imageUrl,
        isFallbackImage: data.isFallbackImage
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  const downloadImage = async () => {
    if (!contentRef.current || downloading) return;
    
    setDownloading(true);
    try {
      // Ensure images are loaded before capturing
      const images = contentRef.current.getElementsByTagName('img');
      await Promise.all(Array.from(images).map(img => {
        const image = img as HTMLImageElement;
        if (image.complete) return Promise.resolve();
        return new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
      }));

      // Small delay for layout stabilization
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await domToPng(contentRef.current, {
        scale: 3,
        quality: 1,
        backgroundColor: "#000000",
      });
      
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `VaaniAI-${formData.postType.replace(/\s+/g, "-")}-${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
      setError("Failed to download image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const shareContent = async () => {
    if (!result) return;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Ad Creative for ${result.brand}`,
          text: `Check out this ${result.platform} generated by VaaniAI for ${result.brand} in ${result.location}!`,
          url: window.location.href,
        });
      } else {
        // Fallback: Copy to clipboard
        const textToCopy = `${result.brand} - ${result.platform}\n\n${
          result.headline
        }\n${result.description}\n${result.location}\n\nGenerated by VaaniAI`;
        await navigator.clipboard.writeText(textToCopy);
        alert("Content copied to clipboard!");
      }
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied to clipboard!`);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const getDynamicFontSize = (text: string, type: 'headline' | 'description', platform: string) => {
    const len = text.length;
    const isFacebook = platform === "Facebook Ad";
    
    if (type === 'headline') {
      if (isFacebook) {
        if (len < 20) return "text-4xl md:text-5xl";
        if (len < 40) return "text-3xl md:text-4xl";
        return "text-2xl md:text-3xl";
      } else {
        if (len < 20) return "text-5xl md:text-7xl";
        if (len < 40) return "text-4xl md:text-6xl";
        if (len < 60) return "text-3xl md:text-5xl";
        return "text-2xl md:text-4xl";
      }
    } else {
      // Description
      if (isFacebook) {
        if (len < 60) return "text-sm md:text-base";
        if (len < 120) return "text-xs md:text-sm";
        return "text-[10px] md:text-xs";
      } else {
        if (len < 60) return "text-xl md:text-2xl";
        if (len < 120) return "text-lg md:text-xl";
        if (len < 180) return "text-base md:text-lg";
        return "text-sm md:text-base";
      }
    }
  };

  const getIcon = (type: PostType) => {
    switch (type) {
      case "Instagram Ad": return <Instagram className="w-5 h-5" />;
      case "WhatsApp Ad": return <MessageSquare className="w-5 h-5" />;
      case "Facebook Ad": return <Facebook className="w-5 h-5" />;
      case "Poster": return <ImageIcon className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-500/30">
      {/* API Key Selection Overlay */}
      {!hasKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="max-w-md p-8 bg-white/[0.03] border border-white/10 rounded-3xl text-center shadow-2xl">
            <Sparkles className="w-12 h-12 text-purple-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-4">API Key Required</h2>
            <p className="text-white/60 mb-8 leading-relaxed">
              To use the high-quality image generation features, you need to select a Gemini API key from a paid Google Cloud project.
            </p>
            <div className="space-y-4">
              <button
                onClick={openKeyDialog}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-purple-500/20"
              >
                Select API Key
              </button>
              <a
                href="https://ai.google.dev/gemini-api/docs/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-white/40 hover:text-white/60 underline underline-offset-4"
              >
                Learn about billing & API keys
              </a>
            </div>
          </div>
        </div>
      )}
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <header className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-purple-400 text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Create your add now</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              VaaniAI
            </h1>
            <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
              Create professional advertisement creatives for your business. 
              Optimized for Indian markets with native language support.
            </p>
          </motion.div>
        </header>

        <main className="space-y-12">
          {/* Input Form Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl"
          >
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/60 ml-1">Business Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Ramesh Kirana Store"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-white/20"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/60 ml-1">Product or Service</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Fresh Organic Vegetables"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-white/20"
                  value={formData.product}
                  onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/60 ml-1">Target Audience</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Health-conscious families"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-white/20"
                  value={formData.audience}
                  onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/60 ml-1">Location</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Hyderabad, Mumbai"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-white/20"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/60 ml-1">Language</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all appearance-none cursor-pointer"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                >
                  {languages.map(lang => <option key={lang} value={lang} className="bg-[#1a1a1a] text-white">{lang}</option>)}
                </select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-white/60 ml-1">Post Type</label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {postTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, postType: type })}
                      className={`flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                        formData.postType === type 
                        ? "bg-purple-500/20 border-purple-500/50 text-purple-300" 
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                      }`}
                    >
                      {getIcon(type)}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-8 py-5 rounded-2xl font-bold text-lg border border-white/10 hover:bg-white/5 transition-all text-white/60"
                >
                  Reset
                </button>
                <button
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 py-5 rounded-2xl font-bold text-lg shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-3 group"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      Generate Ad Creative
                      <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 rounded-3xl bg-red-500/10 border border-red-500/20 text-center space-y-4"
              >
                <p className="text-red-400 text-sm">{error}</p>
                {isQuotaError && (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-white/40 text-xs max-w-md mx-auto">
                      {retryAfter > 0 
                        ? `Retrying automatically in ${retryAfter} seconds...`
                        : "The free tier quota for Gemini AI has been exceeded. To continue generating content immediately, you can switch to a paid API key from your Google Cloud project."
                      }
                    </p>
                    <div className="flex gap-4">
                      <button
                        onClick={openKeyDialog}
                        className="px-6 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-bold hover:bg-blue-600/30 transition-all"
                      >
                        Switch to Paid Key
                      </button>
                      <button
                        onClick={() => handleSubmit()}
                        disabled={retryAfter > 0}
                        className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:bg-white/10 disabled:opacity-50 transition-all"
                      >
                        {retryAfter > 0 ? `Retrying (${retryAfter}s)` : "Retry Now"}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results Display */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Visual Preview Area */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <ImageIcon className="w-5 h-5 text-purple-400" />
                          Visual Preview
                        </h3>
                        {result.isFallbackImage && (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <div className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border flex items-center gap-1 animate-pulse ${
                              result.imageErrorType === "QUOTA" 
                                ? "text-orange-400 bg-orange-400/10 border-orange-400/20" 
                                : "text-white/50 bg-white/5 border-white/10"
                            }`}>
                              <Sparkles className="w-3 h-3" />
                              {result.imageErrorType === "QUOTA" 
                                ? "AI Quota reached (Paid Key Required)" 
                                : result.imageErrorType === "SAFETY"
                                ? "Image blocked by safety filters"
                                : "AI Image generation failed"}
                            </div>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={handleSubmit}
                                className="text-[10px] uppercase tracking-wider text-white/50 hover:text-white underline underline-offset-2 transition-colors"
                              >
                                Retry
                              </button>
                              <button 
                                onClick={async () => {
                                  await window.aistudio.openSelectKey();
                                  handleSubmit();
                                }}
                                className="text-[10px] uppercase tracking-wider text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                              >
                                {result.imageErrorType === "QUOTA" ? "Switch to Paid Key" : "Change API Key"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => copyToClipboard(`${result.headline}\n${result.description}`, "Ad Text")}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
                          title="Copy Headline & Subheading"
                        >
                          <Share2 className="w-4 h-4" />
                          Copy Text
                        </button>
                        <button 
                          onClick={downloadImage}
                          disabled={downloading}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-bold shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                        >
                          {downloading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {downloading ? "Processing..." : "Download PNG"}
                        </button>
                        <button 
                          onClick={shareContent}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
                        >
                          <Share2 className="w-4 h-4" />
                          Share
                        </button>
                      </div>
                    </div>

                    {/* The Visual Content Container */}
                    <div className="flex flex-col items-center gap-6">
                      <div 
                        ref={contentRef}
                        className={`relative overflow-hidden shadow-2xl bg-black border border-white/10 flex items-center justify-center ${
                          result.platform === "WhatsApp Ad"
                            ? "w-full max-w-[400px] aspect-[4/5]"
                            : result.platform === "Facebook Ad"
                            ? "w-full max-w-[600px] aspect-[1.91/1]"
                            : result.platform === "Poster"
                            ? "w-full max-w-[400px] aspect-[3/4]"
                            : "w-full max-w-[500px] aspect-square"
                        }`}
                      >
                        {/* Background Image */}
                        {result.imageUrl && (
                          <img 
                            src={result.imageUrl} 
                            alt="Background" 
                            className="absolute inset-0 w-full h-full object-cover opacity-70"
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/60" />

                        {/* Ad Content Overlay */}
                        <div className="relative z-10 w-full h-full p-8 md:p-12 flex flex-col justify-between text-center">
                          {/* Top Brand Name */}
                          <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center gap-1"
                          >
                            <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.5em] text-white/90 drop-shadow-md">
                              {result.brand}
                            </span>
                            <div className="h-[2px] w-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" />
                          </motion.div>

                          {/* Center Content */}
                          <div className="flex flex-col items-center justify-center flex-1 gap-4 md:gap-6 overflow-hidden py-4">
                            <motion.h2 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              style={{ 
                                fontSize: result.styling?.headlineSize ? `${result.styling.headlineSize}%` : undefined 
                              }}
                              className={`font-display uppercase tracking-tighter leading-[0.95] text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.9)] w-full break-words ${
                                getDynamicFontSize(result.headline, 'headline', result.platform)
                              } ${result.styling?.fontFamily || ''}`}
                            >
                              {result.headline}
                            </motion.h2>
                            
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.2 }}
                              className="px-4 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg shrink-0"
                            >
                              <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-purple-300">
                                {result.product_highlight}
                              </span>
                            </motion.div>
 
                            <motion.p 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.3 }}
                              style={{ 
                                fontSize: result.styling?.descriptionSize ? `${result.styling.descriptionSize}%` : undefined,
                                WebkitLineClamp: result.styling?.descriptionLines || 4,
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                              className={`text-white/90 font-medium leading-tight max-w-[95%] drop-shadow-md w-full break-words ${
                                getDynamicFontSize(result.description, 'description', result.platform)
                              } ${result.styling?.fontFamily || ''}`}
                            >
                              {result.description}
                            </motion.p>
                          </div>

                          {/* Bottom Location */}
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="flex flex-col items-center gap-2"
                          >
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                              <CheckCircle2 className="w-3 h-3 text-blue-400" />
                              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/80">
                                {result.location}
                              </span>
                            </div>
                          </motion.div>
                        </div>

                        {/* Subtle Texture Overlay */}
                        <div className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

                        {/* Watermark Branding */}
                        <div className="absolute bottom-2 left-0 right-0 z-20 text-center pointer-events-none px-4">
                          <span className="text-[7px] md:text-[9px] text-white/20 font-medium tracking-widest uppercase">
                            Vaani AI – Advertize your business
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Edit Sidebar */}
                  <div className="lg:col-span-4 space-y-6">
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl"
                    >
                      <div className="flex items-center gap-2 mb-6 text-purple-400">
                        <Pencil className="w-5 h-5" />
                        <h4 className="font-bold uppercase tracking-wider text-xs">Edit Ad Content</h4>
                      </div>
                      
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Brand Name</label>
                          <input 
                            type="text"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                            value={result.brand}
                            onChange={(e) => setResult({...result, brand: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Headline</label>
                          <textarea 
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                            value={result.headline}
                            onChange={(e) => setResult({...result, headline: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Product Highlight</label>
                          <input 
                            type="text"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                            value={result.product_highlight}
                            onChange={(e) => setResult({...result, product_highlight: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Description</label>
                          <textarea 
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                            value={result.description}
                            onChange={(e) => setResult({...result, description: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Location</label>
                          <input 
                            type="text"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                            value={result.location}
                            onChange={(e) => setResult({...result, location: e.target.value})}
                          />
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-4">
                          <div className="flex items-center gap-2 text-blue-400 mb-2">
                            <TypeIcon className="w-4 h-4" />
                            <h5 className="text-[10px] font-black uppercase tracking-widest">Typography & Style</h5>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Headline Size</label>
                              <input 
                                type="range" min="50" max="200" step="5"
                                className="w-full accent-purple-500"
                                value={result.styling?.headlineSize || 100}
                                onChange={(e) => setResult({...result, styling: {...result.styling!, headlineSize: parseInt(e.target.value)}})}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Desc Size</label>
                              <input 
                                type="range" min="50" max="200" step="5"
                                className="w-full accent-purple-500"
                                value={result.styling?.descriptionSize || 100}
                                onChange={(e) => setResult({...result, styling: {...result.styling!, descriptionSize: parseInt(e.target.value)}})}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Font Style</label>
                            <select 
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                              value={result.styling?.fontFamily || 'font-sans'}
                              onChange={(e) => setResult({...result, styling: {...result.styling!, fontFamily: e.target.value}})}
                            >
                              <option value="font-sans" className="bg-[#1a1a1a]">Modern Sans</option>
                              <option value="font-serif" className="bg-[#1a1a1a]">Elegant Serif</option>
                              <option value="font-mono" className="bg-[#1a1a1a]">Technical Mono</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Max Desc Lines</label>
                            <input 
                              type="number" min="1" max="10"
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                              value={result.styling?.descriptionLines || 4}
                              onChange={(e) => setResult({...result, styling: {...result.styling!, descriptionLines: parseInt(e.target.value)}})}
                            />
                          </div>

                          <button
                            onClick={handleRegenerateImage}
                            disabled={isRegeneratingImage}
                            className="w-full mt-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 ${isRegeneratingImage ? 'animate-spin' : ''}`} />
                            {isRegeneratingImage ? 'Regenerating...' : 'Regenerate Image'}
                          </button>
                        </div>
                      </div>
                    </motion.div>

                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                      <h5 className="font-bold text-sm mb-2">Editor Mode 🎨</h5>
                      <p className="text-xs text-white/40 leading-relaxed">
                        Changes made here reflect instantly on the preview. Use this to fine-tune your ad before downloading.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="mt-20 pt-10 border-t border-white/5 text-center text-white/30 text-sm space-y-1">
          <p>© 2026 VaaniAI</p>
        </footer>
      </div>
    </div>
  );
}
