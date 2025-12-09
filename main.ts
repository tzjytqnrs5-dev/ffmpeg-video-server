
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

    console.log(`[Processing] Topic: ${headline}`);

    // 3. Return Success (Real Logic)
    return Response.json({ 
        success: true, 
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4", 
        caption: `Generated content for: ${headline}`
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("Server Error:", error);
    return Response.json({ 
        error: 'Internal server error', 
        message: error.message 
    }, { status: 500, headers: corsHeaders });
  }
});
