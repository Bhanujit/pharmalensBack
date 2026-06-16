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
                text: `You are an expert pharmaceutical OCR system.

Your ONLY task is to identify medicines from packaging images.

You MUST return ONLY valid JSON in this exact format:
{
  "medicineName": "string",
  "dosageForm": "string",
  "strength": "string"
}

ALLOWED dosageForm values (choose EXACTLY one):
- tablet
- capsule
- syrup
- suspension
- drops
- injection
- cream
- ointment
- gel
- powder
- patch
- spray
- unknown

EXTRACTION RULES:
1. Extract the PRIMARY medicine name from packaging/label (not brand owner, not company)
2. Identify the actual FORM of the medicine (is it a liquid? solid? paste?)
3. Extract the strength if visible (e.g., "500mg", "10mg/5ml")

CRITICAL:
- If you see "Oral Suspension" or "Liquid" or "Syrup" anywhere → dosageForm is "syrup"
- If you see "Tablet", "Tab" → dosageForm is "tablet"
- If you see "Capsule", "Cap" → dosageForm is "capsule"
- If you see "Drops", "Drop" → dosageForm is "drops"
- If you see a bottle/liquid bottle → likely syrup or suspension
- If you see solid round/oval shapes → likely tablet or capsule
- If you see a tube/container → likely cream or ointment

EXAMPLES:
{"medicineName": "Paracetamol", "dosageForm": "tablet", "strength": "500mg"}
{"medicineName": "Dolo", "dosageForm": "syrup", "strength": "125mg/5ml"}
{"medicineName": "Cetirizine", "dosageForm": "tablet", "strength": "10mg"}
{"medicineName": "Azithromycin", "dosageForm": "suspension", "strength": "200mg/5ml"}
{"medicineName": "Unknown", "dosageForm": "unknown", "strength": ""}

NEVER:
- Guess or invent
- Return generic terms
- Include explanations
- Add markdown
- Return anything except JSON`,
              },
            ],
          },

          contents: [
            {
              role: "user",

              parts: [
                {
                  text: `Analyze this medicine packaging image carefully.

Extract and return ONLY JSON:
{
  "medicineName": "the medicine name",
  "dosageForm": "tablet/capsule/syrup/suspension/drops/injection/cream/ointment/gel/powder/patch/spray/unknown",
  "strength": "e.g., 500mg or 10mg/5ml"
}

CRITICAL: Look at the FORM of the medicine (is it a liquid bottle? solid tablets? a tube?).
Return the actual dosageForm, not what you assume.`,
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

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      console.error(
        "❌ [detect-medicine] Failed to parse Gemini JSON",
        rawText,
      );
      return res.status(502).json({
        error: "Invalid JSON response from AI model",
      });
    }

    // Normalize response
    const medicineName = (parsed.medicineName || "Unknown")
      .trim()
      .replace(/\n/g, "")
      .replace(/["']/g, "")
      .replace(/[*`#]/g, "");

    const dosageForm = (parsed.dosageForm || "unknown").toLowerCase().trim();

    const strength = (parsed.strength || "").trim();

    // Validate dosageForm
    const validForms = [
      "tablet",
      "capsule",
      "syrup",
      "suspension",
      "drops",
      "injection",
      "cream",
      "ointment",
      "gel",
      "powder",
      "patch",
      "spray",
      "unknown",
    ];

    const finalDosageForm = validForms.includes(dosageForm)
      ? dosageForm
      : "unknown";

    console.log(
      `✅ [detect-medicine] Detected: ${medicineName} | Form: ${finalDosageForm} | Strength: ${strength}`,
    );

    return res.status(200).json({
      medicineName,
      dosageForm: finalDosageForm,
      strength,
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
