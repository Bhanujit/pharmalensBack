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
    strength = "Unknown",
    packSize = "Unknown",
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
You are a STRICT pharmaceutical information AI. Your responses must be PRECISE and FACTUAL ONLY.

=== FORMULATION CONSTRAINT (CRITICAL) ===
Formulation Type Provided: ${safeFormulation}
- You MUST ONLY use this formulation type in your dosage field.
- If Formulation is "Syrup", dosage MUST describe syrup (e.g., "100 ml syrup", "5 ml syrup").
- If Formulation is "Tablet", dosage MUST describe tablets (e.g., "500 mg tablet", "1 tablet").
- If Formulation is "Capsule", dosage MUST describe capsules (e.g., "500 mg capsule", "1 capsule").
- If Formulation is "Suspension", dosage MUST describe suspension (e.g., "200 mg/5ml suspension").
- If Formulation is "Injection", dosage MUST describe injection (e.g., "1ml injection", "50 mg/ml").
- NEVER return dosage that contradicts the formulation type.
- NEVER invent quantity per day (e.g., "2 tablets daily", "5 ml twice daily").

=== PRESCRIBEDFOR FIELD (ABSOLUTE RULES) ===
FORBIDDEN TERMS (NEVER use these):
❌ "general health"
❌ "overall wellness"
❌ "supplement"
❌ "health maintenance"
❌ "nutritional support"
❌ "well-being"
❌ "health support"
❌ "nutritional purposes"

REQUIRED: State SPECIFIC therapeutic action:
✅ "Fever and pain relief"
✅ "Bacterial infection treatment"
✅ "Blood pressure management"
✅ "Thyroid hormone replacement"
✅ "Acid reflux treatment"
✅ "Antibiotic for respiratory infection"
✅ "Vitamin B12 deficiency treatment"

IF medicine matches user conditions from: ${safeConditions}
HIGHLIGHT that specific condition in prescribedFor and description.

IF completely uncertain about therapeutic use:
Return "Unknown" - DO NOT GUESS.

=== DOSAGE FIELD RULES ===
Dosage must describe ONLY:
- Product strength (e.g., "500 mg", "100 ml")
- Formulation type (e.g., "tablet", "syrup", "capsule")
- Combined format: "500 mg tablet", "100 ml syrup"

Dosage MUST NOT include:
❌ Frequency (daily, twice daily)
❌ Quantity per administration (2 tablets, 5 ml)
❌ Administration instructions (take after meals, before sleep)
❌ Duration (for 5 days)
❌ Route assumptions

=== LANGUAGE & OUTPUT ===
Preferred Language: ${safeLanguage}
- medicineName: Keep in ENGLISH (original)
- translatedName: Translate to ${safeLanguage} (empty string if ${safeLanguage}="en")
- description: Translate to ${safeLanguage}
- prescribedFor: Translate to ${safeLanguage}
- All routine timing descriptions: Translate to ${safeLanguage}

=== TIMING RULES ===
Based on medicine type (strict guidelines):
- Acidity/Antacid medicines: beforeLunch=true, beforeDinner=true
- Antibiotics: afterBreakfast=true, afterLunch=true, afterDinner=true
- Sleeping aids: beforeSleep=true
- Vitamins: afterBreakfast=true
- Painkillers: afterMeals (breakfast, lunch, dinner as needed)

IF formulation=${safeFormulation} is NOT in your knowledge:
Return empty routine: { "beforeBreakfast": { "enabled": false }, ... all false ...}

RETURN STRICT MINIFIED JSON ONLY:
{
  "medicineName": "string (English, as provided)",
  "translatedName": "string (in ${safeLanguage}, empty if en)",
  "dosage": "string (format + strength ONLY, matching ${safeFormulation})",
  "prescribedFor": "string (specific therapeutic action, NEVER generic)",
  "description": "string (1-2 sentences, what medicine does)",
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
                  text: `Analyze medicine and return JSON.

Medicine Name: ${safeName}
Formulation Type: ${safeFormulation}
User Medical Conditions: ${safeConditions}
Preferred Language: ${safeLanguage}

CRITICAL REQUIREMENTS:
1. Dosage must match formulation type: ${safeFormulation}
2. prescribedFor must be specific therapeutic use (NEVER generic health terms)
3. Use provided formulation type ONLY - do not contradict it
4. If uncertain about any field, return "Unknown"

Return ONLY valid JSON matching the schema provided.`,
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
