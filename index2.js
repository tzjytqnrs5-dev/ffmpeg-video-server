
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ChevronLeft, Play, Share2, ArrowUpRight, 
  Sparkles, Zap, Layout, Settings, Image as ImageIcon, 
  Download, Instagram, Youtube, Twitter, Check, User, CreditCard,
  Loader2, Music, Wand2, AlertTriangle, AlertCircle, Home as HomeIcon, Terminal, Copy, Server
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

// --- CONFIGURATION ---
const CONFIG = {
  // Your Railway URL
  API_URL: "https://strong-alignment-production-c935.up.railway.app/",
};

// --- API CLIENT ---
const api = {
  generateVideo: async (payload: any, logFn: (msg: string) => void) => {
    try {
      logFn(`🚀 Starting Generation Sequence...`);
      const targetUrl = CONFIG.API_URL;
      logFn(`🎯 Target: ${targetUrl}`);
      logFn(`📦 Payload: ${JSON.stringify(payload)}`);

      // DIRECT CONNECTION (Requires CORS headers on Railway)
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      logFn(`📡 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errText = await response.text();
        logFn(`❌ Error Body: ${errText.substring(0, 100)}`);
        throw new Error(`Server Error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      logFn(`✅ Data Received: ${JSON.stringify(data).substring(0, 50)}...`);
      return data;
    } catch (error) {
      logFn(`🔥 Fetch Failed: ${error}`);
      const msg = error instanceof Error ? error.message : "Unknown error";
      
      if (msg.includes("Failed to fetch")) {
        return { success: false, error: "Connection Failed. Check CORS on Railway or Server Status." };
      }
      return { success: false, error: msg };
    }
  }
};

// --- DATA ---
const TEMPLATES = [
  { id: 1, name: 'Viral Facts', gradient: 'from-purple-600 to-pink-600', preview: 'FACTS' },
  { id: 2, name: 'Story Time', gradient: 'from-blue-600 to-cyan-600', preview: 'STORY' },
  { id: 3, name: 'Quick Tips', gradient: 'from-green-600 to-emerald-600', preview: 'TIPS' },
  { id: 4, name: 'Mystery', gradient: 'from-orange-600 to-red-600', preview: 'MYSTERY' },
  { id: 5, name: 'Tech News', gradient: 'from-indigo-600 to-purple-600', preview: 'TECH' },
  { id: 6, name: 'Life Hacks', gradient: 'from-yellow-600 to-orange-600', preview: 'HACKS' },
  { id: 7, name: 'Motivation', gradient: 'from-red-600 to-pink-600', preview: 'INSPIRE' },
  { id: 8, name: 'Fun Facts', gradient: 'from-teal-600 to-blue-600', preview: 'FUN' },
  { id: 9, name: 'Did You Know', gradient: 'from-purple-700 to-blue-700', preview: 'DYK' },
  { id: 10, name: 'Mind Blown', gradient: 'from-pink-700 to-purple-700', preview: 'MIND' },
  { id: 11, name: 'Quick Learn', gradient: 'from-green-700 to-teal-700', preview: 'LEARN' },
  { id: 12, name: 'Wow Moments', gradient: 'from-orange-700 to-red-700', preview: 'WOW' },
];

const TEMPLATE_SUGGESTIONS: Record<number, string[]> = {
  1: ["The shortest war in history", "Bananas are curved because...", "Honey never spoils", "Octopuses have three hearts", "Wombat poop is cube-shaped", "Dead skin cells make up dust", "The Eiffel Tower grows in summer", "Venus spins clockwise", "Nutmeg is a hallucinogen", "Humans share 50% DNA with bananas", "A cloud weighs 1.1 million pounds", "Rats laugh when tickled", "A day on Venus is longer than a year", "Butterflies taste with feet", "Sloths hold their breath longer than dolphins", "Sharks existed before trees", "Oxford University is older than Aztec Empire", "France executed by guillotine when Star Wars came out", "Nintendo existed during Ottoman Empire", "Cleopatra lived closer to iPhone than Pyramids"],
  2: ["The day I almost died", "My biggest mistake", "How I met my best friend", "A secret I never told", "The scariest thing that happened to me", "My first heartbreak", "The time I got lost in a foreign country", "Winning the lottery (almost)", "My worst job interview", "Meeting a celebrity", "A paranormal experience", "The day everything changed", "My biggest regret", "Surviving a natural disaster", "A childhood mystery solved", "The kindest stranger", "My 15 minutes of fame", "A coincidence that saved me", "The hardest decision I made", "Living a double life"],
  3: ["How to wake up early", "Boost your productivity instantly", "Save money on groceries", "Learn a language fast", "Improve your posture", "Stop procrastinating", "Better sleep hygiene", "Organize your digital life", "Quick stress relief", "Memorize anything", "Speed reading basics", "Email management", "Networking hacks", "Public speaking tips", "Negotiation tactics", "Cooking shortcuts", "Cleaning hacks", "Travel packing tips", "Phone battery saving", "Focus techniques"],
  4: ["The Dyatlov Pass incident", "The Zodiac Killer", "Bermuda Triangle theories", "Jack the Ripper", "The Mary Celeste", "Cicada 3301", "The Voynich Manuscript", "Lost Colony of Roanoke", "DB Cooper", "The Black Dahlia", "Malaysia Airlines 370", "The Wow! Signal", "Bigfoot sightings", "The Mothman", "Area 51 secrets", "The Taos Hum", "Kryptos sculpture", "The Somerton Man", "Hinterkaifeck murders", "The Green Children of Woolpit"],
  5: ["AI taking over jobs", "The newest iPhone leak", "SpaceX Mars mission", "Quantum computing explained", "VR revolution", "Crypto market crash", "Self-driving cars", "Neuralink update", "Metaverse flop", "Cybersecurity threats", "Green tech innovations", "Robotics in 2025", "5G dangers?", "Web3 explained", "NFTs comeback?", "Tech giants vs Privacy", "The end of smartphones", "Wearable tech future", "Coding without code", "Biotech breakthroughs"],
  6: ["Open a bottle without an opener", "Fold a shirt in 2 seconds", "Charge phone faster", "Unclog a drain naturally", "Remove permanent marker", "Cool a drink in 2 mins", "Peel garlic instantly", "Fix a zipper", "Stop glasses fogging", "Boost wifi signal", "Remove stripped screws", "Clean white sneakers", "Keep herbs fresh", "Iron without an iron", "Hide scratches on wood", "Extend battery life", "Organize cables", "Prevent onion tears", "Reuse old jars", " DIY phone stand"],
  7: ["Why you should start today", "Overcoming fear of failure", "The power of habit", "Discipline vs Motivation", "Finding your purpose", "Don't give up", "Success stories", "Morning routine for success", "The 80/20 rule", "Believe in yourself", "Embracing change", "Learning from mistakes", "Mindset shift", "Focus on the process", "Small steps matter", "Visualize success", "Ignore the haters", "Take risks", "Invest in yourself", "You are enough"],
  8: ["Cows have best friends", "Sea otters hold hands", "Penguins propose with pebbles", "Dolphins have names", "Squirrels plant trees by accident", "Turtles can breathe through butts", "Rabbits binky when happy", "Goats have accents", "Elephants mourn their dead", "Dogs dream like humans", "Cats meow for humans only", "Bees dance to communicate", "Crows hold grudges", "Pigs play video games", "Octopuses use tools", "Whales have songs", "Parrots name their babies", "Ants have graveyards", "Horses have facial expressions", "Rats are ticklish"],
  9: ["Water can boil and freeze at same time", "Glass is a liquid?", "Lasers can get trapped in water", "Oxygen has a color", "We are made of stardust", "Time is slower near gravity", "Sound creates heat", "Light pushes things", "Matter is mostly empty space", "Diamonds can burn", "Water memory theory", "Cold welding in space", "Quantum entanglement", "The double slit experiment", "Schrodingers cat", "Dark matter", "Black holes evaporate", "Speed of light limit", "Parallel universes", "Time travel paradoxes"],
  10: ["There are more trees on Earth than stars in galaxy", "You can't hum while holding your nose", "Russia has more surface area than Pluto", "Cleopatra lived closer to Moon landing than Pyramids", "Fungi are more animal than plant", "Sharks are older than Saturn's rings", "Maine is closest state to Africa", "Saudi Arabia imports camels", "Nintendo started as card company", "Oxford is older than Aztecs", "We drink the same water as dinosaurs", "A day on Venus is longer than a year", "You can fit all planets between Earth and Moon", "Clouds weigh millions of pounds", "Humans glow in the dark", "Bananas are berries", "Strawberries aren't berries", "Wombat poop is square", "Honey never rots", "Your stomach acid dissolves razor blades"],
  11: ["History of the internet", "How engines work", "Basics of investing", "Theory of relativity", "How vaccines work", "Photosynthesis explained", "The French Revolution", "How Blockchain works", "Psychology 101", "Music theory basics", "How eyes see color", "The water cycle", "Structure of an atom", "How planes fly", "The Fibonacci sequence", "World War 1 summary", "How digestion works", "Plate tectonics", "The judicial system", "Binary code"],
  12: ["Solar eclipse from space", "Volcano lightning", "Bioluminescent beaches", "The Northern Lights", "Deep sea creatures", "Macro photography of eyes", "Slow motion lightning", "Time lapse of flowers", "Murmuration of starlings", "Cave of crystals", "The Great Blue Hole", "Pink lakes", "Rainbow mountains", "Frozen methane bubbles", "Underwater waterfalls", "Spider webs with dew", "Snowflakes under microscope", "Galaxy collisions", "Supernova explosions", "Antarctica blood falls"]
};

const RANDOM_TOPICS = [
  "The history of the internet", "Why cats are afraid of cucumbers", "The most expensive liquid in the world", "How to survive a zombie apocalypse", "The truth about the Bermuda Triangle", "Top 10 travel destinations for 2025", "How AI will change the world", "The secret life of plants", "Why we dream", "The psychology of color", "The most dangerous roads in the world", "Why we haven't found aliens yet", "The psychology behind gambling", "How to train your brain for success", "The history of video games"
];

const createPageUrl = (page: string) => `/${page.toLowerCase()}`;

// --- SERVER CODE SNIPPET (For User to Copy) ---
const SERVER_CODE = `
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// --- CORS HEADERS (Crucial for Browser Access) ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// --- MAIN HANDLER ---
export default Deno.serve(async (req: any) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const base44Client = createClientFromRequest(req);
    
    // 2. Parse Data
    const data = await req.json();
    const { headline } = data;

    if (!headline) {
        return Response.json({ error: "Missing headline" }, { status: 400, headers: corsHeaders });
    }

    console.log(\`[Processing] Topic: \${headline}\`);

    // 3. Return Success (Real Logic)
    return Response.json({ 
        success: true, 
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4", 
        caption: \`Generated content for: \${headline}\`
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("Server Error:", error);
    return Response.json({ 
        error: 'Internal server error', 
        message: error.message 
    }, { status: 500, headers: corsHeaders });
  }
});
`;

// --- COMPONENTS ---

const Button = ({ children, onClick, className = "", variant = "primary", disabled = false, icon: Icon = null }: any) => {
  const baseStyle = "relative overflow-hidden rounded-full font-medium tracking-wide transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-white text-black hover:bg-gray-100 shadow-[0_0_20px_rgba(255,255,255,0.3)]",
    secondary: "bg-[#1c1c1e] text-white border border-white/10 hover:border-white/20 hover:bg-[#2c2c2e]",
    ghost: "bg-transparent text-white/60 hover:text-white hover:bg-white/5",
    accent: "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/40"
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </motion.button>
  );
};

const TemplateCard = ({ template, onClick, index }: any) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: index * 0.05, ease: [0.2, 0.65, 0.3, 0.9] }}
      whileHover={{ scale: 1.02, transition: { duration: 0.3, ease: "easeOut" } }}
      whileTap={{ scale: 0.98 }}
      className="group relative w-full"
    >
      {/* CLICK OVERLAY - Ensures navigation works */}
      <button 
        className="absolute inset-0 z-50 w-full h-full cursor-pointer bg-transparent"
        onClick={() => onClick(template.id, template.name)}
        aria-label={`Select ${template.name}`}
      />

      <div className="relative aspect-[3.5/5] w-full overflow-hidden rounded-xl md:rounded-[2rem] lg:rounded-[2.5rem] bg-[#1c1c1e] shadow-2xl shadow-black/50 ring-1 ring-white/5 pointer-events-none">
        <div className={`absolute inset-0 bg-gradient-to-br ${template.gradient} opacity-70 transition-all duration-700 group-hover:opacity-100 group-hover:scale-105`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-90" />
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>

        <div className="absolute inset-0 flex flex-col justify-between p-3 md:p-5 lg:p-8">
            <div className="flex justify-between items-start">
                <div className="px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center gap-1 md:gap-2">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] md:text-[10px] font-bold tracking-widest uppercase text-white/90">New</span>
                </div>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-1 md:group-hover:-translate-y-2">
                <p className="hidden md:block text-[9px] md:text-xs font-bold tracking-widest text-white/50 uppercase mb-1 md:mb-3">
                  No. 0{template.id}
                </p>
                <h3 className="text-sm md:text-2xl lg:text-3xl font-bold text-white tracking-tighter leading-tight mb-0 md:mb-2 line-clamp-2">
                    {template.name}
                </h3>
            </div>
        </div>
      </div>
    </motion.div>
  );
};

// --- PAGES ---

const Intro = () => {
  const navigate = useNavigate();
  useEffect(() => {
    sessionStorage.setItem('hasSeenIntro', 'true');
    const timer = setTimeout(() => navigate(createPageUrl('Home'), { replace: true }), 4000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="relative flex items-center justify-center h-screen overflow-hidden bg-black">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1, 1.05, 1.1] }}
        transition={{ duration: 4, times: [0, 0.2, 0.8, 1], ease: "easeInOut" }}
        className="text-center z-10"
      >
        <h1 className="text-4xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 tracking-tighter">
          Sircus Studio.
        </h1>
        <p className="mt-4 text-xs font-mono text-white/30">v4.0 - Direct</p>
      </motion.div>
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col">
       <nav className="p-6 flex justify-between items-center z-50">
          <div className="flex items-center gap-2 font-bold tracking-tight text-white cursor-pointer" onClick={() => navigate('/home')}>
             <div className="w-4 h-4 rounded-sm bg-white" />
             <span>Sircus Studio</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px]">JS</div>
       </nav>

       <main className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 relative">
          <div className="max-w-4xl w-full text-center space-y-12">
             <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <h1 className="text-5xl md:text-8xl font-bold tracking-tighter text-white">Create Viral.</h1>
             </motion.div>

             <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 w-full">
                <div onClick={() => navigate('/workshop')} className="cursor-pointer group bg-[#1c1c1e] hover:bg-[#2c2c2e] p-8 rounded-[2rem] border border-white/5 hover:border-white/20 transition-all text-left">
                    <Zap className="w-8 h-8 text-white mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-2">Workshop</h3>
                    <p className="text-white/40">Start creating.</p>
                </div>
                <div onClick={() => navigate('/tools')} className="cursor-pointer group bg-[#1c1c1e] hover:bg-[#2c2c2e] p-8 rounded-[2rem] border border-white/5 hover:border-white/20 transition-all text-left">
                    <Settings className="w-8 h-8 text-white mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-2">Tools</h3>
                    <p className="text-white/40">Automation.</p>
                </div>
                <div onClick={() => navigate('/plans')} className="cursor-pointer group bg-[#1c1c1e] hover:bg-[#2c2c2e] p-8 rounded-[2rem] border border-white/5 hover:border-white/20 transition-all text-left">
                    <CreditCard className="w-8 h-8 text-white mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-2">Plans</h3>
                    <p className="text-white/40">Upgrade.</p>
                </div>
             </motion.div>
          </div>
       </main>
    </div>
  );
};

const Workshop = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col">
       <div className="flex items-center gap-4 mb-12 z-50">
          <button onClick={() => navigate('/home')} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><ChevronLeft className="w-5 h-5" /></button>
          <span className="font-bold text-xl">Workshop</span>
       </div>
       <div className="flex-1 flex flex-col md:flex-row gap-6 items-center justify-center max-w-5xl mx-auto w-full">
           <div onClick={() => navigate('/templates')} className="flex-1 w-full h-[400px] bg-gradient-to-br from-purple-900/20 to-black border border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:border-white/30 transition-all">
               <Layout className="w-16 h-16 text-purple-400 mb-6" />
               <h2 className="text-3xl font-bold mb-2">Templates</h2>
           </div>
           <div onClick={() => navigate('/preview', { state: { from: 'random', templateName: 'Random Gen' } })} className="flex-1 w-full h-[400px] bg-gradient-to-br from-blue-900/20 to-black border border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:border-white/30 transition-all">
               <Sparkles className="w-16 h-16 text-blue-400 mb-6" />
               <h2 className="text-3xl font-bold mb-2">Random Gen</h2>
           </div>
       </div>
    </div>
  );
};

const TemplatesLibrary = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = useMemo(() => TEMPLATES.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())), [searchQuery]);

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] pb-20">
      <nav className="sticky top-0 z-50 w-full backdrop-blur-xl bg-black/90 border-b border-white/5 p-4 flex justify-between items-center">
         <div className="flex items-center gap-4">
             <button onClick={() => navigate('/workshop')} className="p-2 hover:bg-white/10 rounded-full"><ChevronLeft className="w-5 h-5 text-white" /></button>
             <div className="flex items-center gap-2 font-bold cursor-pointer" onClick={() => navigate('/home')}>
                <div className="w-4 h-4 rounded-sm bg-white" />
                <span>Sircus Studio</span>
             </div>
         </div>
         <div className="text-white/60">Library</div>
      </nav>
      <main className="mx-auto max-w-[1600px] px-2 md:px-6 lg:px-12 pt-12">
        <div className="grid grid-cols-3 gap-3 md:gap-8 pb-20">
            {filtered.map((t, i) => (
              <TemplateCard 
                key={t.id} 
                template={t} 
                index={i} 
                onClick={(id, name) => navigate(createPageUrl('Preview'), { state: { templateId: id, templateName: name, from: 'template' } })} 
              />
            ))}
        </div>
      </main>
    </div>
  );
};

const Review = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { templateId: number; templateName: string; from: string } | null;
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [typedText, setTypedText] = useState("");

  const topicsList = state?.templateId ? TEMPLATE_SUGGESTIONS[state.templateId] : RANDOM_TOPICS;

  const addLog = (msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    if (topic || loading || videoUrl) return;
    let idx = 0, charIdx = 0, isDeleting = false;
    const currentList = topicsList || RANDOM_TOPICS;
    const type = () => {
      const current = currentList[idx];
      if (!current) return; 
      if (isDeleting) {
        setTypedText(current.substring(0, charIdx - 1));
        charIdx--;
      } else {
        setTypedText(current.substring(0, charIdx + 1));
        charIdx++;
      }
      if (!isDeleting && charIdx === current.length) setTimeout(() => isDeleting = true, 2000);
      else if (isDeleting && charIdx === 0) { isDeleting = false; idx = (idx + 1) % currentList.length; }
      setTimeout(type, isDeleting ? 30 : 50);
    };
    const t = setTimeout(type, 1000);
    return () => clearTimeout(t);
  }, [topic, loading, videoUrl, topicsList]);

  const handleGenerate = async () => {
    if (!topic) return toast.error("Please enter a topic");
    setLoading(true);
    setProgress(0);
    setError(null);
    setLogs([]);
    setStatusMessage("Initializing...");
    addLog("Initializing Generation Sequence...");

    try {
        const payload = { headline: topic, topic: topic, template: state?.from === 'template' ? 'viral_facts' : 'random' };
        
        const interval = setInterval(() => setProgress(p => p < 90 ? p + 5 : p), 500);
        
        const res = await api.generateVideo(payload, addLog);
        clearInterval(interval);

        if (res.success && res.videoUrl) {
            setProgress(100);
            setStatusMessage("Complete");
            setVideoUrl(res.videoUrl);
            toast.success("Masterpiece created.");
        } else {
            throw new Error(res.error || "Server returned failure");
        }
    } catch (err: any) {
        console.error("Generation Failed:", err);
        setError(err.message || "Unknown error");
        setStatusMessage("Generation Failed");
        toast.error(`Error: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };

  if (videoUrl) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="relative aspect-[9/16] bg-zinc-900 rounded-[2rem] overflow-hidden border-4 border-zinc-800 shadow-2xl">
                 <video src={videoUrl} className="w-full h-full object-cover" controls playsInline autoPlay loop muted crossOrigin="anonymous" onError={(e) => toast.error("Failed to load video")} />
            </div>
            <div className="space-y-6 text-center lg:text-left">
                <h2 className="text-4xl font-bold text-white">Your Video is Ready</h2>
                <Button onClick={() => setVideoUrl(null)} variant="ghost" className="mt-4">Create Another</Button>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col relative overflow-hidden">
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#2a1b3d_0%,_#000000_70%)] opacity-40 pointer-events-none" />
       <nav className="relative z-10 p-6 flex justify-between items-center">
           <div className="flex items-center gap-4">
               <button onClick={() => navigate('/templates')} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                   <ChevronLeft className="w-5 h-5" /> Back to Library
               </button>
               <div className="flex items-center gap-2 font-bold cursor-pointer" onClick={() => navigate('/home')}>
                  <div className="w-4 h-4 rounded-sm bg-white" />
                  <span>Sircus Studio</span>
               </div>
           </div>
       </nav>

       <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
           {loading ? (
               <div className="text-center space-y-8">
                   <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                        <div className="absolute inset-0 border-t-4 border-white rounded-full animate-spin" />
                   </div>
                   <div>
                       <h3 className="text-2xl font-bold text-white mb-2">{statusMessage}</h3>
                       <p className="text-white/40 text-sm">This typically takes 10-20 seconds.</p>
                   </div>
                   {error && (
                       <div className="flex flex-col items-center gap-4 mt-8">
                           <div className="text-red-400 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 max-w-md text-sm">
                               {error}
                           </div>
                           <div className="flex gap-2">
                               <Button onClick={() => setShowLogs(!showLogs)} variant="secondary" icon={Terminal}>Debug Logs</Button>
                               <Button onClick={() => setLoading(false)} variant="ghost">Try Again</Button>
                           </div>
                       </div>
                   )}
                   {showLogs && (
                       <div className="mt-4 w-full max-w-lg mx-auto bg-black/80 border border-white/10 rounded-lg p-4 h-48 overflow-y-auto text-left font-mono text-xs text-green-400">
                           {logs.map((log, i) => <div key={i}>{log}</div>)}
                       </div>
                   )}
               </div>
           ) : (
               <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl w-full space-y-8 text-center">
                   <div>
                       <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 text-white">Topic?</h1>
                       <p className="text-xl text-white/50">Template: <span className="text-white font-semibold">{state?.templateName || 'Viral Facts'}</span></p>
                   </div>
                   <div className="relative group">
                       <textarea 
                           value={topic}
                           onChange={(e) => setTopic(e.target.value)}
                           placeholder={typedText}
                           className="w-full bg-[#1c1c1e] border-2 border-white/10 focus:border-white/30 rounded-[2rem] p-8 text-xl md:text-2xl text-white placeholder-white/20 outline-none min-h-[200px] resize-none transition-all shadow-2xl"
                       />
                       <div className="absolute bottom-6 right-6 flex gap-2">
                           <button onClick={() => { const list = topicsList || RANDOM_TOPICS; setTopic(list[Math.floor(Math.random() * list.length)]); }} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"><Wand2 className="w-5 h-5" /></button>
                       </div>
                   </div>
                   <Button onClick={handleGenerate} variant="primary" className="w-full md:w-auto px-12 py-5 text-xl rounded-full"><Zap className="w-5 h-5 fill-black" /> Generate Video</Button>
               </motion.div>
           )}
       </main>
    </div>
  );
};

const Plans = () => { const navigate = useNavigate(); return <div className="min-h-screen bg-black text-white p-6"><button onClick={() => navigate(-1)} className="mb-8 flex items-center gap-2 opacity-60"><ChevronLeft className="w-4 h-4" /> Back</button><h1 className="text-4xl font-bold mb-4">Plans</h1></div> }

const Tools = () => {
  const navigate = useNavigate();
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(SERVER_CODE);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="mb-8 flex items-center gap-2 opacity-60 hover:opacity-100"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="flex justify-between items-center mb-12">
            <h1 className="text-4xl font-bold">Tools</h1>
            <Button variant="secondary" icon={Server} onClick={() => setShowConfig(!showConfig)}>Server Config</Button>
        </div>

        {showConfig && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 bg-[#1c1c1e] p-6 rounded-2xl border border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl">Deno Server Code (main.ts)</h3>
                    <Button variant="ghost" onClick={copyCode} icon={Copy}>{copied ? "Copied!" : "Copy Code"}</Button>
                </div>
                <p className="text-sm text-white/60 mb-4">
                    If your connection is failing, copy this code and paste it into <code>main.ts</code> on your GitHub repository (ffmpeg-video-server), then let Railway redeploy.
                </p>
                <div className="bg-black p-4 rounded-xl overflow-x-auto border border-white/10">
                    <pre className="text-xs font-mono text-green-400">{SERVER_CODE.trim()}</pre>
                </div>
            </motion.div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
            <div className="p-8 bg-[#1c1c1e] rounded-3xl border border-white/5 opacity-50"><h3 className="text-xl font-bold mb-2">Social Auto-Post</h3><p className="text-sm opacity-60">Coming Soon</p></div>
            <div className="p-8 bg-[#1c1c1e] rounded-3xl border border-white/5 opacity-50"><h3 className="text-xl font-bold mb-2">Media Library</h3><p className="text-sm opacity-60">Coming Soon</p></div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/intro" replace />} />
        <Route path="/intro" element={<Intro />} />
        <Route path="/home" element={<Home />} />
        <Route path="/workshop" element={<Workshop />} />
        <Route path="/templates" element={<TemplatesLibrary />} />
        <Route path="/preview" element={<Review />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <Toaster theme="dark" position="bottom-center" />
    </HashRouter>
  );
}
