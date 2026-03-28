import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

// =========================================================================
// CONFIGURATION
// =========================================================================
// The Gemini API key is automatically provided in the environment as GEMINI_API_KEY.
// No manual configuration is required.
const apiKey = "AIzaSyBEDKdLEEeyLsNHE5Y33DbM_JBIPUghEhY";

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("Starting VaaniAI Server...");
  
  app.use(express.json({ limit: '50mb' }));

  // Helper for retrying API calls
  const callWithRetry = async (fn: () => Promise<any>, retries = 5, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        if (i === retries - 1) throw err;
        
        const isRetryable = 
          err.message?.includes("503") || 
          err.message?.includes("429") || 
          err.message?.includes("high demand") || 
          err.message?.includes("UNAVAILABLE") ||
          err.message?.includes("RESOURCE_EXHAUSTED");

        if (isRetryable) {
          // If it's a daily quota limit, don't retry, just fail fast
          if (err.message?.includes("PerDay")) {
            console.log("Daily quota limit reached, skipping retries.");
            throw err;
          }

          let waitTime = delay;
          if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
            waitTime = 5000; // Start with 5s for quota issues
            // Try to parse retry delay if available in the error message
            const match = err.message?.match(/retry in ([\d\.]+)s/);
            if (match) {
              waitTime = (parseFloat(match[1]) * 1000) + 1000;
            }
            
            // If wait time is too long (e.g. > 45s), let the frontend handle it
            if (waitTime > 45000) {
               console.log(`Wait time ${waitTime}ms is too long for backend, throwing to frontend.`);
               throw err;
            }
          }
          
          console.log(`API busy or quota hit, retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2; // Exponential backoff
          continue;
        }
        throw err;
      }
    }
  };

  // API routes
  app.post("/api/generate", async (req, res) => {
    console.log("Received generation request:", req.body);
    
    try {
      const { businessName, product, audience, language, postType, location } = req.body;

      // 1. Determine which API key to use
      let selectedKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      
      // Fallback key for development if environment variables are missing
      const fallbackKey = "AIzaSyBEDKdLEEeyLsNHE5Y33DbM_JBIPUghEhY";
      
      if (!selectedKey || selectedKey === "MY_GEMINI_API_KEY" || selectedKey.trim() === "") {
        console.log("GEMINI_API_KEY not found in environment, using fallback key.");
        selectedKey = fallbackKey;
      }

      if (!selectedKey || selectedKey.trim() === "") {
        console.error("Error: No valid Gemini API key found.");
        return res.status(500).json({ 
          error: "Gemini API key is not configured. Please ensure GEMINI_API_KEY is available in the environment." 
        });
      }

      // 2. Initialize AI
      const ai = new GoogleGenAI({ apiKey: selectedKey });
      
      const systemInstruction = `
        You are an expert advertisement creative system. Your goal is to generate high-impact, professional ad copy and matching image prompts for the Indian market.
        
        STRICT RULES:
        1. IMAGE PROMPT DERIVATION: The image prompt MUST be a highly descriptive visual scene that perfectly represents the business and product. It should feel like a professional commercial photograph.
        2. VISUAL MATCH: The image prompt MUST describe the product in a setting that matches the Target Audience and Location. For example, if it's a luxury product in Mumbai, describe a high-end Mumbai interior or skyline.
        3. NO TEXT IN IMAGE: The image prompt MUST NOT include any instructions to generate text, headlines, or logos. The UI will overlay the text. Focus entirely on the background, product, and atmosphere.
        4. CONSISTENCY: The visual (image prompt) and the copy (headline/description) MUST be perfectly synchronized. The image should tell the same story as the text.
        5. PLATFORM OPTIMIZATION: Tailor the design guidelines and image prompt specifically for the selected platform format.
        6. LANGUAGE: The ad copy (headline, description, product_highlight) MUST be in ${language}.
        7. NARRATIVE SYNC: The image_prompt should be the visual "soul" of the headline. If the headline is about "Speed", the image should show motion blur or a fast-paced environment.
      `;

      const prompt = `
        Generate a professional advertisement creative for:
        - Brand: ${businessName}
        - Product: ${product}
        - Audience: ${audience}
        - Location: ${location}
        - Format: ${postType}
        - Language: ${language}

        ---

        SUPPORTED PLATFORM FORMATS:
        - Instagram Ads: 1:1 square modern ad design
        - Poster: 3:4 high-impact print-style vertical poster
        - WhatsApp: 4:5 clean vertical marketing card
        - Facebook Ads: 1.91:1 landscape ad

        ---

        IMAGE PROMPT GUIDELINES:
        The "image_prompt" field must be a detailed description for an AI image generator.
        It should describe:
        - A high-end, photorealistic commercial scene featuring ${product} as the hero element.
        - The lighting (e.g., cinematic, soft studio, golden hour, neon accents).
        - The background/environment (e.g., modern Indian kitchen, busy Bangalore street, luxury Delhi office, serene Himalayan retreat).
        - The mood (e.g., vibrant, minimalist, premium, energetic, nostalgic).
        - SYNC REQUIREMENT: The image must visually represent the core benefit mentioned in the headline and description.
        - NO TEXT, NO HEADLINES, NO LOGOS in the image.
        - Style: Professional commercial photography, 8k, highly detailed, sharp focus on product.

        ---

        STRICTLY DO NOT INCLUDE:
        ❌ Random unrelated images or stock photo mismatches
        ❌ Social media UI elements (likes, comments, etc.)
        ❌ Video concepts or YouTube Shorts references
        ❌ Call-To-Action (CTA) buttons in the image prompt

        ---

        Return ONLY JSON:
        {
          "platform": "${postType}",
          "brand": "${businessName}",
          "headline": "Catchy headline in ${language}",
          "description": "Compelling ad copy in ${language}",
          "product_highlight": "Key feature in ${language}",
          "location": "${location}",
          "image_prompt": "Detailed prompt following the mandatory structure",
          "design_guidelines": {
            "layout": "Specific layout advice",
            "color_theme": "Suggested color palette",
            "style": "Overall visual style (e.g., Minimalist, Vibrant, Luxury)"
          }
        }
      `;

      console.log("Calling Gemini API with model: gemini-3-flash-preview...");
      
      let response;
      try {
        response = await callWithRetry(() => ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                platform: { type: Type.STRING },
                brand: { type: Type.STRING },
                headline: { type: Type.STRING },
                description: { type: Type.STRING },
                product_highlight: { type: Type.STRING },
                location: { type: Type.STRING },
                image_prompt: { type: Type.STRING },
                design_guidelines: {
                  type: Type.OBJECT,
                  properties: {
                    layout: { type: Type.STRING },
                    color_theme: { type: Type.STRING },
                    style: { type: Type.STRING }
                  },
                  required: ["layout", "color_theme", "style"]
                }
              },
              required: ["platform", "brand", "headline", "description", "product_highlight", "location", "image_prompt", "design_guidelines"]
            }
          }
        }));
      } catch (textError: any) {
        console.log("Primary text model busy or quota hit, trying fallback model gemini-3.1-flash-lite-preview...");
        try {
          response = await callWithRetry(() => ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  platform: { type: Type.STRING },
                  brand: { type: Type.STRING },
                  headline: { type: Type.STRING },
                  description: { type: Type.STRING },
                  product_highlight: { type: Type.STRING },
                  location: { type: Type.STRING },
                  image_prompt: { type: Type.STRING },
                  design_guidelines: {
                    type: Type.OBJECT,
                    properties: {
                      layout: { type: Type.STRING },
                      color_theme: { type: Type.STRING },
                      style: { type: Type.STRING }
                    },
                    required: ["layout", "color_theme", "style"]
                  }
                },
                required: ["platform", "brand", "headline", "description", "product_highlight", "location", "image_prompt", "design_guidelines"]
              }
            }
          }));
        } catch (fallbackError: any) {
          console.log("Fallback text model also busy, trying gemini-flash-latest...");
          response = await callWithRetry(() => ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  platform: { type: Type.STRING },
                  brand: { type: Type.STRING },
                  headline: { type: Type.STRING },
                  description: { type: Type.STRING },
                  product_highlight: { type: Type.STRING },
                  location: { type: Type.STRING },
                  image_prompt: { type: Type.STRING },
                  design_guidelines: {
                    type: Type.OBJECT,
                    properties: {
                      layout: { type: Type.STRING },
                      color_theme: { type: Type.STRING },
                      style: { type: Type.STRING }
                    },
                    required: ["layout", "color_theme", "style"]
                  }
                },
                required: ["platform", "brand", "headline", "description", "product_highlight", "location", "image_prompt", "design_guidelines"]
              }
            }
          }));
        }
      }

      console.log("Text content generated successfully.");
      
      if (!response.text) {
        const finishReason = response.candidates?.[0]?.finishReason;
        console.error("Empty response from Gemini API. Finish Reason:", finishReason);
        
        if (finishReason === "SAFETY") {
          throw new Error("Content generation was blocked by safety filters. Please try a different prompt.");
        }
        throw new Error(`Empty response from Gemini API (Finish Reason: ${finishReason || 'UNKNOWN'})`);
      }

      let result;
      try {
        result = JSON.parse(response.text);
      } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", response.text);
        throw new Error("The AI generated an invalid response format. Please try again.");
      }

      // 3. Generate a background image using the AI-generated image_prompt
      let imageUrl = "";
      let isFallbackImage = false;
      let imageErrorType: "QUOTA" | "SAFETY" | "OTHER" | null = null;
      
      try {
        console.log("Generating background image using AI-generated prompt...");
        
        const imagePrompt = result.image_prompt;

        // Aspect ratios based on platform
        let aspectRatio = "1:1";
        if (postType === "WhatsApp Ad") aspectRatio = "4:5";
        if (postType === "Facebook Ad") aspectRatio = "16:9"; 
        if (postType === "Poster") aspectRatio = "3:4";

        // Try gemini-3.1-flash-image-preview first
        try {
          const imageResponse = await callWithRetry(() => ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: { 
              parts: [{ 
                text: `Ad for ${businessName} - ${product}. Theme: ${result.headline}. Visual: ${imagePrompt}` 
              }] 
            },
            config: {
              imageConfig: {
                aspectRatio: aspectRatio as any,
                imageSize: "1K"
              },
            },
          }), 3, 2000);

          if (imageResponse.candidates?.[0]?.content?.parts) {
            for (const part of imageResponse.candidates[0].content.parts) {
              if (part.inlineData) {
                const base64EncodeString: string = part.inlineData.data;
                imageUrl = `data:image/png;base64,${base64EncodeString}`;
                break;
              }
            }
          }
        } catch (primaryError: any) {
          console.log("Primary image model busy or quota hit, trying fallback models...");
          
          // If it's a quota error, store it to inform the user
          if (primaryError.message?.includes("Quota exceeded") || primaryError.message?.includes("429") || primaryError.message?.includes("RESOURCE_EXHAUSTED")) {
            imageErrorType = "QUOTA";
          }

          // Try gemini-2.5-flash-image as fallback
          try {
            const fallbackImageResponse = await callWithRetry(() => ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { 
                parts: [{ 
                  text: `Ad for ${businessName} - ${product}. Theme: ${result.headline}. Visual: ${imagePrompt}` 
                }] 
              },
              config: {
                imageConfig: {
                  aspectRatio: aspectRatio as any,
                },
              },
            }), 3, 2000);

            if (fallbackImageResponse.candidates?.[0]?.content?.parts) {
              for (const part of fallbackImageResponse.candidates[0].content.parts) {
                if (part.inlineData) {
                  const base64EncodeString: string = part.inlineData.data;
                  imageUrl = `data:image/png;base64,${base64EncodeString}`;
                  break;
                }
              }
            }
          } catch (fallbackError: any) {
             console.log("Fallback image model also busy, trying gemini-2.5-flash-preview-image...");
             // Try gemini-2.5-flash-preview-image as last resort (some environments use this name)
             const lastResortResponse = await callWithRetry(() => ai.models.generateContent({
               model: 'gemini-2.5-flash-preview-image',
               contents: { 
                 parts: [{ 
                   text: `Ad for ${businessName} - ${product}. Theme: ${result.headline}. Visual: ${imagePrompt}` 
                 }] 
               },
               config: {
                 imageConfig: {
                   aspectRatio: aspectRatio as any,
                 },
               },
             }), 2, 2000);

             if (lastResortResponse.candidates?.[0]?.content?.parts) {
               for (const part of lastResortResponse.candidates[0].content.parts) {
                 if (part.inlineData) {
                   const base64EncodeString: string = part.inlineData.data;
                   imageUrl = `data:image/png;base64,${base64EncodeString}`;
                   break;
                 }
               }
             }
          }
        }
        
        if (!imageUrl) {
          throw new Error("No image data returned from Gemini API");
        }
        
        console.log("Image generated successfully.");
      } catch (imageError: any) {
        console.log("AI image generation busy or quota hit, proceeding with static fallback.");
        isFallbackImage = true;
        
        if (!imageErrorType) {
          if (imageError.message?.includes("Quota exceeded") || imageError.message?.includes("429") || imageError.message?.includes("RESOURCE_EXHAUSTED")) {
            imageErrorType = "QUOTA";
          } else if (imageError.message?.includes("SAFETY")) {
            imageErrorType = "SAFETY";
          } else {
            imageErrorType = "OTHER";
          }
        }
        
        // Fallback to Picsum with a relevant seed
        const seed = encodeURIComponent(`${businessName} ${product} ad`.replace(/\s+/g, '-').toLowerCase());
        
        let width = 1024;
        let height = 1024;
        if (postType === "WhatsApp Ad") { width = 1000; height = 1250; }
        if (postType === "Facebook Ad") { width = 1200; height = 628; }

        imageUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;
        console.log("Using fallback image:", imageUrl);
      }

      res.json({ ...result, imageUrl, isFallbackImage, imageErrorType });

    } catch (error: any) {
      console.error("--- BACKEND ERROR ---");
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
      
      let errorMessage = error.message || "An unexpected error occurred on the server.";
      
      let isQuotaError = false;
      let retryAfter = 0;
      if (error.message?.includes("Quota exceeded") || error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        isQuotaError = true;
        
        // Try to extract retry time
        const match = error.message?.match(/retry in ([\d\.]+)s/);
        if (match) {
          retryAfter = Math.ceil(parseFloat(match[1]));
        }
        
        const retryTime = match ? match[0].replace("retry in ", "") : "";
        
        errorMessage = `AI API quota exceeded. ${retryTime ? `Please retry in ${retryTime}.` : "Please try again later."} Switching to a paid API key will remove these limits.`;
      }

      res.status(error.status || 500).json({ 
        error: errorMessage,
        isQuotaError: isQuotaError,
        retryAfter: retryAfter
      });
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    try {
      const { image_prompt, postType, businessName, product, headline } = req.body;
      
      let selectedKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const fallbackKey = "AIzaSyBEDKdLEEeyLsNHE5Y33DbM_JBIPUghEhY";
      if (!selectedKey || selectedKey === "MY_GEMINI_API_KEY" || selectedKey.trim() === "") {
        selectedKey = fallbackKey;
      }

      const ai = new GoogleGenAI({ apiKey: selectedKey });

      let imageUrl = "";
      let isFallbackImage = false;
      let aspectRatio = "1:1";
      if (postType === "WhatsApp Ad") aspectRatio = "4:5";
      if (postType === "Facebook Ad") aspectRatio = "16:9"; 
      if (postType === "Poster") aspectRatio = "3:4";

      try {
        const imageResponse = await callWithRetry(() => ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: { 
            parts: [{ 
              text: `Ad for ${businessName} - ${product}. Theme: ${headline}. Visual: ${image_prompt}` 
            }] 
          },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio as any,
              imageSize: "1K"
            },
          },
        }), 3, 2000);

        if (imageResponse.candidates?.[0]?.content?.parts) {
          for (const part of imageResponse.candidates[0].content.parts) {
            if (part.inlineData) {
              const base64EncodeString: string = part.inlineData.data;
              imageUrl = `data:image/png;base64,${base64EncodeString}`;
              break;
            }
          }
        }
      } catch (err) {
        console.log("Image generation failed, using fallback.");
        isFallbackImage = true;
        const seed = encodeURIComponent(`${businessName} ${product} ad ${Date.now()}`.replace(/\s+/g, '-').toLowerCase());
        let width = 1024;
        let height = 1024;
        if (postType === "WhatsApp Ad") { width = 1000; height = 1250; }
        if (postType === "Facebook Ad") { width = 1200; height = 628; }
        imageUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;
      }

      res.json({ imageUrl, isFallbackImage });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
