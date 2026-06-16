import { parseAiJsonResponse } from "../utils/parseJsonResponse.js";

export async function medicineDetailsHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // Destruction logic matches current flow, but safely processes 'formulation' parameter if provided
  const {
    medicineName,
    formulation = "Unknown",
    userDiseases,
    preferredLanguage = "en",
  } = req.body;

  if (!medicineName || typeof medicineName !== "string") {
    return res.status(400).json({
      error: "medicineName is required and must be a string",
    });
  }

  if (!Array.isArray(userDiseases)) {
    return res.status(400).json({
      error: "userDiseases must be an array",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not configured");
    return res.status(500).json({
      error: "Backend not configured: GEMINI_API_KEY missing",
    });
  }

  const safeName = medicineName
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, 100);
  const safeFormulation =
    typeof formulation === "string"
      ? formulation
          .replace(/[\r\n\t]/g, " ")
          .trim()
          .slice(0, 50)
      : "Unknown";

  const safeConditions =
    userDiseases
      .map((condition) =>
        typeof condition === "string"
          ? condition.replace(/[\r\n\t]/g, " ").trim()
          : "",
      )
      .filter(Boolean)
      .join(", ") || "None";

  const safeLanguage =
    typeof preferredLanguage === "string"
      ? preferredLanguage.trim().slice(0, 10)
      : "en";

  try {
    console.log(
      `📋 [medicine-details] Medicine: ${safeName} | Formulation: ${safeFormulation}`,
    );
    const startTime = Date.now();
    console.log("🔥 Sending request to Gemini");

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
You are an advanced pharmaceutical AI assistant.
Your job is to provide highly accurate medicine medical analysis.

CRITICAL INSTRUCTIONS FOR FORMULATION & DOSAGE:
- You MUST evaluate the specific "Formulation Type" context provided (e.g., Syrup, Tablet, Suspension, Capsule).
- For SYRUPS, SUSPENSIONS, and LIQUIDS: The "dosage" and "routine" fields MUST use liquid volumetric measurements such as "ml", "teaspoon", or "spoonful" (e.g., "5ml", "10ml twice daily"). It is a critical hazard to mention "tablets" or "capsules" when the medicine formulation is a liquid.
- For TABLETS and CAPSULES: Use solid counts like "1 tablet" or "1 capsule".

CRITICAL INSTRUCTIONS FOR PURPOSES ("prescribedFor"):
- NEVER use vague generic filler terms like "general health", "overall wellness", "supplement", or "health maintenance".
- State the explicit therapeutic indication/action of the medicine (e.g., "Fever reduction and pain relief", "Acid reflux management", "Bacterial infection control").
- Cross-reference the "User Medical Conditions". If the medicine matches a user condition, ensure "prescribedFor" and "description" securely highlight that specific treatment value.

STRICT LANGUAGE & FORMATTING RULES:
- All user-facing text strings must be returned translated entirely into the preferred language.
- Preferred language code: ${safeLanguage}
- medicineName must remain in English as provided.
- translatedName should contain the translated/transliterated name in the preferred language. If preferredLanguage is "en", keep translatedName as an empty string "".
- description must concisely summarize what the medicine does in 1-2 clear sentences.
- If completely uncertain about the therapeutic usage, return "Unknown". Do not make up routines.
- Return ONLY valid minified JSON. No Markdown block wraps. No explanations.

Medicine timing rules:
- Acidity medicines are usually before meals.
- Antibiotics are usually after meals.
- Sleeping medicines are before sleep.
- Vitamins are usually after breakfast.
- Painkillers are usually after meals.
- Diabetes medicines depend on meal timing.

Return STRICT JSON using this schema:
{
  "medicineName": "string",
  "translatedName": "string",
  "dosage": "string",
  "prescribedFor": "string",
  "description": "string",
  "routine": {
    "beforeBreakfast": { "enabled": boolean, "minutes": number },
    "afterBreakfast": { "enabled": boolean, "minutesAfterMealEnds": number },
    "beforeLunch": { "enabled": boolean, "minutes": number },
    "afterLunch": { "enabled": boolean, "minutesAfterMealEnds": number },
    "beforeDinner": { "enabled": boolean, "minutes": number },
    "afterDinner": { "enabled": boolean, "minutesAfterMealEnds": number },
    "afterWakingUp": { "enabled": boolean, "time": "string" },
    "beforeSleep": { "enabled": boolean, "time": "string" },
    "customTime": { "enabled": boolean, "time": "string", "ampm": "AM" }
  }
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
Medicine Name: ${safeName}
Formulation Type: ${safeFormulation}
User Medical Conditions: ${safeConditions}
Preferred Language: ${safeLanguage}

Analyze this medicine using the exact formulation type provided. Determine exact medical purpose, prescribed usage details, proper dynamic dosage metrics (ml vs tablet counters), and a logical timing structure. Translate all client descriptions into the requested Preferred Language.
                  `,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.05,
            topP: 0.8,
            topK: 20,
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    console.log("✅ Gemini response received");

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemini API Error: ${response.status}`, errorText);
      return res.status(response.status).json({
        error: "Gemini API error",
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();
    let parsed;

    try {
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error("Gemini returned empty response");
      }
      parsed = JSON.parse(rawText);
      console.log(`✅ [medicine-details] Parsed successfully`);
    } catch (error) {
      console.warn("⚠️ Direct JSON parse failed. Using fallback parser.");
      parsed = parseAiJsonResponse(data);
    }

    // Final safety normalization layer
    parsed.medicineName = parsed.medicineName || safeName || "Unknown";
    parsed.translatedName =
      typeof parsed.translatedName === "string" ? parsed.translatedName : "";
    parsed.dosage = parsed.dosage || "Unknown";
    parsed.prescribedFor = parsed.prescribedFor || "Unknown";
    parsed.description = parsed.description || "Unknown";
    parsed.routine = parsed.routine || {};

    console.log(
      `✅ [medicine-details] Completed in ${Date.now() - startTime}ms`,
    );
    return res.status(200).json(parsed);
  } catch (error) {
    console.error(`❌ [medicine-details] Handler error:`, error.message);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}
