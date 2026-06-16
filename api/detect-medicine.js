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
You are an advanced pharmaceutical OCR assistant.

Your ONLY task is to identify the medicine name visible in the image.

STRICT RULES:

- Return STRICT JSON.

{
  "medicineName": "",
  "formulation": "",
  "strength": "",
  "packSize": "",
  "confidence": 0
}

RULES:

- medicineName = brand/generic medicine name
- formulation = Tablet, Capsule, Syrup, Suspension, Drops, Cream, Ointment, Injection, Inhaler
- strength = printed strength such as 650mg, 500mg, 100ml
- packSize = printed pack size if visible
- confidence = 0-100

If unknown use "Unknown".

Do not guess.
Return JSON only.
- Do NOT explain anything.
- Do NOT add markdown.
- Do NOT add dosage unless it is part of the medicine name.
- Ignore background text.
- Ignore logos.
- Ignore packaging decoration.
- Ignore unrelated text.
- NEVER guess.
- If unclear return exactly: Unknown

You must focus on:
- strip text
- medicine packaging
- printed brand name
- tablet/capsule/syrup label

Examples of valid outputs:
Paracetamol
Dolo 650
Augmentin
Azithromycin
Pantoprazole
Unknown
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
            temperature: 0.05,
            topP: 0.8,
            topK: 20,
            maxOutputTokens: 200,
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

    let medicineName = rawText
      .trim()
      .replace(/\n/g, "")
      .replace(/["']/g, "")
      .replace(/[*`#]/g, "");

    // Extra cleanup
    medicineName = medicineName
      .replace(/^medicine\s*name\s*:/i, "")
      .replace(/^name\s*:/i, "")
      .trim();

    if (!medicineName) {
      medicineName = "Unknown";
    }

    console.log(`✅ [detect-medicine] Medicine detected: ${medicineName}`);

    return res.status(200).json({
      medicineName,
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
