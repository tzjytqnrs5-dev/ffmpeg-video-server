import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// IMPORTANT: This should be the URL of your successfully deployed Railway rendering service
const RAILWAY_API = "https://strong-alignment-production-c935.up.railway.app/render";

Deno.serve(async (req) => {
    console.log('=== FUNCTION STARTED (Base44 Integration) ===');
    
    // --- FIX: Clone request BEFORE consuming the body ---
    // Create a disposable clone for the SDK to potentially consume headers/body for auth.
    // This prevents the original 'req' body from becoming 'unusable' before req.json() is called.
    const base44Req = req.clone(); 
    
    try {
        // Create the Base44 client using the cloned request
        const base44 = createClientFromRequest(base44Req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Now safely read the body from the original request
        const body = await req.json();
        const { topic, templateId, templateName, videoId } = body;
        
        if (!topic || !videoId) {
            return Response.json({ success: false, error: 'Topic and videoId are required' }, { status: 400 });
        }
        
        // --- STEP 1: AI SCRIPT GENERATION ---
        console.log(`🧠 Base44: Calling 'generateVideoScript' for topic: "${topic}"...`);
        const scriptResponse = await base44.functions.invoke('generateVideoScript', { topic: topic });
        const scriptResult = scriptResponse.data;
        
        if (!scriptResult || !scriptResult.title || !scriptResult.script) {
            return Response.json({ success: false, error: 'Base44 script generation failed or returned invalid format.' }, { status: 500 });
        }
        const { title, script } = scriptResult;
        console.log(`✅ Script generated. Title: ${title}`);


        // --- STEP 2: PEXELS MEDIA FETCH ---
        console.log(`🎥 Base44: Calling 'fetchPexelsVideo' for topic: "${topic}"...`);
        const mediaResponse = await base44.functions.invoke('fetchPexelsVideo', { topic: topic });
        const mediaResult = mediaResponse.data;
        
        if (!mediaResult || !mediaResult.background_media_url) {
            return Response.json({ success: false, error: 'Base44 Pexels fetching failed or returned invalid format.' }, { status: 500 });
        }
        const backgroundVideoUrl = mediaResult.background_media_url;
        console.log(`✅ Pexels URL fetched: ${backgroundVideoUrl}`);


        // --- STEP 3: RAILWAY RENDER CALL (Final API) ---
        console.log('🚀 Calling Railway API for Final Render: ' + RAILWAY_API);
        
        const renderPayload = {
            topic,
            title,
            script,
            backgroundVideoUrl,
            templateId: templateId || 'default',
            templateName: templateName || 'default',
            videoId,
            // Include AWS credentials if the rendering service requires them in the body
            // This is generally not recommended, but included for completeness if your setup needs it.
            // awsAccessKey: Deno.env.get('AWS_ACCESS_KEY_ID'), 
            // awsSecretKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
        };

        const renderResponse = await fetch(RAILWAY_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // IMPORTANT: Add your secret API key for your Railway service if it needs to be protected
                // 'Authorization': `Bearer ${Deno.env.get('RAILWAY_SERVICE_API_KEY')}`
            },
            body: JSON.stringify(renderPayload),
        });

        if (!renderResponse.ok) {
            const errorText = await renderResponse.text();
            console.error(`💥 Railway API failed with status ${renderResponse.status}: ${errorText}`);
            return Response.json({ success: false, error: `Video rendering service failed: ${renderResponse.status}` }, { status: 502 });
        }

        const renderResult = await renderResponse.json();
        
        if (!renderResult.videoUrl) {
            console.error('No video URL in Railway response:', renderResult);
            // This is the S3 error you were seeing before. It needs to be fixed on the Railway side.
            return Response.json({ success: false, error: `No video URL received. Check Railway logs for S3 Access Denied.` }, { status: 500 });
        }
        
        // --- STEP 4: RETURN SUCCESS ---
        console.log(`🎉 Video render initiated/complete. URL: ${renderResult.videoUrl}`);
        return Response.json({ 
            success: true, 
            videoUrl: renderResult.videoUrl, 
            title: title 
        });

    } catch (e) {
        console.error("💥 FATAL ERROR:", e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    } finally {
        console.log('=== FUNCTION ENDED ===');
    }
});
