export async function detectMedicineHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { base64Image, mimeType } = req.body;

  if (!base64Image || typeof base64Image !== "string") {
    return res.status(400).json({
      error: "base64Image is required and must be a string",
    });
  }

  const sanitizedBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not configured");

    return res.status(500).json({
      error: "Backend not configured: GEMINI_API_KEY missing",
    });
  }

  try {
    console.log("🔍 [detect-medicine] Starting detection");

    const startTime = Date.now();

    const actualMimeType = mimeType || "image/jpeg";

    console.log(`📦 MIME Type: ${actualMimeType}`);

    console.log("🔥 Sending image to Gemini OCR");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        signal: AbortSignal.timeout(60000),

        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `
You are an advanced pharmaceutical OCR assistant specialized in medicine package analysis.

Your task is to extract medicine information from the image and return STRICT JSON.

EXTRACT EXACTLY:
1. medicineName: The exact brand/generic name printed on packaging
2. formulation: The medicine form (Tablet, Capsule, Syrup, Suspension, Injection, Cream, Ointment, Spray, Drops, Powder)
3. strength: The strength shown on packaging (e.g., "500mg", "100ml", "10%", "2%")
4. packSize: Pack size if visible (e.g., "10 tablets", "100ml", "strip of 10")
5. confidence: Your confidence level (0-100)

STRICT RULES:
- Do NOT guess or invent information.
- Extract ONLY what is clearly visible on the packaging.
- If a field is not visible, return "Unknown".
- Formulation MUST be one of: Tablet, Capsule, Syrup, Suspension, Injection, Cream, Ointment, Spray, Drops, Powder, or Unknown
- Do NOT add explanations or markdown.
- Return ONLY valid JSON.

Focus on:
- Primary text on packaging
- Brand/product name
- Form (tablets, syrup, etc.)
- Strength markings
- Pack information

JSON Schema (REQUIRED):
{
  "medicineName": "string",
  "formulation": "string",
  "strength": "string",
  "packSize": "string",
  "confidence": number
}
                `,
              },
            ],
          },

          contents: [
            {
              role: "user",

              parts: [
                {
                  text: `
Extract ONLY the medicine name from this image.

If multiple medicines exist,
return the most prominent medicine name only.
                  `,
                },

                {
                  inlineData: {
                    mimeType: actualMimeType,
                    data: sanitizedBase64,
                  },
                },
              ],
            },
          ],

          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.05,
            topP: 0.8,
            topK: 20,
            maxOutputTokens: 500,
          },

          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE",
            },
          ],
        }),
      },
    );

    const elapsed = Date.now() - startTime;

    console.log(`⏱️ [detect-medicine] Gemini responded in ${elapsed}ms`);

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `❌ [detect-medicine] Gemini API error: ${response.status}`,
        errorText.substring(0, 500),
      );

      return res.status(response.status).json({
        error: "Gemini API request failed",
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error(
        "❌ [detect-medicine] Invalid Gemini response",
        JSON.stringify(data).substring(0, 500),
      );

      return res.status(502).json({
        error: "Invalid response from AI model",
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse Gemini JSON", rawText);

      return res.status(502).json({
        error: "Invalid JSON returned by Gemini",
      });
    }

    return res.status(200).json({
      medicineName: parsed.medicineName || "Unknown",
      formulation: parsed.formulation || "Unknown",
      strength: parsed.strength || "Unknown",
      packSize: parsed.packSize || "Unknown",
      confidence: parsed.confidence || 0,
    });
  } catch (error) {
    console.error(
      `❌ [detect-medicine] Handler error:`,
      error?.message || error,
    );

    return res.status(500).json({
      error: "Internal server error during image analysis",
      details: error?.message || String(error),
    });
  }
}
