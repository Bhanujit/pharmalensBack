import { parseAiJsonResponse } from "../utils/parseJsonResponse.js";

export async function medicineDetailsHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { medicineName, userDiseases, preferredLanguage = "en" } = req.body;

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
    console.log(`📋 [medicine-details] Medicine: ${safeName}`);

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

Your job is to provide highly accurate medicine analysis.

STRICT RULES:
- All user-facing text must be returned in the user's preferred language.
- Preferred language code: ${safeLanguage}
- medicineName should remain in English.
- translatedName should contain the translated/transliterated medicine name in the preferred language.
- If preferredLanguage is "en", translatedName should be an empty string.
- prescribedFor should be in the preferred language.
- dosage should be in the preferred language.
- description should be in the preferred language.
- description should briefly explain what the medicine is used for.
- description should be concise (1-2 sentences).
- If uncertain return "Unknown".
- NEVER guess medicine names.
- NEVER invent medicine purposes.
- NEVER hallucinate dosage.
- NEVER use generic phrases like "general health".
- If uncertain, return "Unknown".
- Prefer medically realistic routines.
- Return ONLY valid minified JSON.
- No markdown.
- No explanations.
- No extra text.

CRITICAL: prescribedFor MUST be SELECTED ONLY from the user's medical conditions list.
- You are NOT allowed to invent new conditions.
- You are NOT allowed to return generic terms like "General Health", "Wellness", "Prevention", "Immune Support", or "General Care".
- If none of the user's conditions match the medicine's actual purpose, return exactly: "Unknown"

Medicine timing rules:

- Acidity medicines are usually before meals.
- Antibiotics are usually after meals.
- Sleeping medicines are before sleep.
- Vitamins are usually after breakfast.
- Painkillers are usually after meals.
- Diabetes medicines depend on meal timing.

You must determine:

- accurate medicine purpose
- dosage guidance
- prescribed usage
- short medicine description
- realistic timing routine
- short medicine description in the preferred language
- Return all explanations in the preferred language.
1. The medicine's PRIMARY medical indication.
2. Compare that indication against the user's medical conditions.
3. prescribedFor MUST be the single best matching condition from the user's condition list.
4. If the medicine is not commonly used for any of the user's conditions, return "Unknown".
5. Never return a condition that is not present in the user's condition list.
You must focus on:
- strip text
- medicine packaging
- printed brand name
- tablet/capsule/syrup label
- make sure to consider the user's medical conditions when determining the medicine's purpose and usage.
- analyze the medicine carefully and provide accurate information based on the medicine name and user's medical conditions.
Return STRICT JSON using this schema:

{
  "medicineName": "string",
    "translatedName": "string",
  "dosage": "string",
  "prescribedFor": "string",
   "description": "string",
  "routine": {
    "beforeBreakfast": {
      "enabled": boolean,
      "minutes": number
    },
    "afterBreakfast": {
      "enabled": boolean,
      "minutesAfterMealEnds": number
    },
    "beforeLunch": {
      "enabled": boolean,
      "minutes": number
    },
    "afterLunch": {
      "enabled": boolean,
      "minutesAfterMealEnds": number
    },
    "beforeDinner": {
      "enabled": boolean,
      "minutes": number
    },
    "afterDinner": {
      "enabled": boolean,
      "minutesAfterMealEnds": number
    },
    "afterWakingUp": {
      "enabled": boolean,
      "time": "string"
    },
    "beforeSleep": {
      "enabled": boolean,
      "time": "string"
    },
    "customTime": {
      "enabled": boolean,
      "time": "string",
      "ampm": "AM"
    }
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
Medicine Name:
${safeName}

User Medical Conditions:
${safeConditions}

Preferred Language:
${safeLanguage}

CRITICAL INSTRUCTIONS:

prescribedFor MUST be selected ONLY from the user's medical conditions list above.

Procedure:
1. Determine what this medicine's most likely medical indication is.
2. Compare that indication against the user's medical conditions list.
3. Choose the SINGLE BEST matching condition from their list.
4. If NONE of the user's conditions clearly match, return exactly: "Unknown"

Examples:
- Medicine: Metformin | User Conditions: Diabetes, Hypertension → prescribedFor: "Diabetes"
- Medicine: Amlodipine | User Conditions: Diabetes, Hypertension → prescribedFor: "Hypertension"
- Medicine: Vitamin D | User Conditions: Diabetes, Hypertension → prescribedFor: "Unknown"

Analyze this medicine carefully.

Determine:
- exact medicine purpose
- prescribed usage
- proper dosage guidance
- realistic medicine timing
- whether it should be taken before food, after food, or before sleep
- The BEST matching disease from user's condition list for prescribedFor

Return all explanations in the Preferred Language.
Keep only the medicine name in English.
Provide translatedName in the preferred language.
If uncertain, return "Unknown" for prescribedFor.
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

    // Final safety normalization

    parsed.medicineName = parsed.medicineName || safeName || "Unknown";
    parsed.translatedName =
      typeof parsed.translatedName === "string" ? parsed.translatedName : "";
    parsed.dosage = parsed.dosage || "Unknown";
    parsed.description = parsed.description || "Unknown";
    parsed.routine = parsed.routine || {};
    const normalizedConditions = userDiseases.map((d) =>
      String(d).trim().toLowerCase(),
    );

    const aiCondition = String(parsed.prescribedFor || "")
      .trim()
      .toLowerCase();

    if (
      aiCondition !== "unknown" &&
      !normalizedConditions.includes(aiCondition)
    ) {
      console.warn(
        `Invalid prescribedFor returned by AI: ${parsed.prescribedFor}`,
      );

      parsed.prescribedFor = "Unknown";
    }
    // STRICT VALIDATION: Ensure prescribedFor is from user's disease list or "Unknown"
    const validConditions = userDiseases
      .map((d) => d.toLowerCase().trim())
      .filter(Boolean);

    const aiPrescribedFor =
      typeof parsed.prescribedFor === "string"
        ? parsed.prescribedFor.toLowerCase().trim()
        : "";

    // Check if AI's answer is in the user's disease list (case-insensitive)
    const isValidCondition = validConditions.some(
      (condition) => condition === aiPrescribedFor,
    );

    if (!isValidCondition && aiPrescribedFor !== "") {
      console.warn(
        `⚠️ [medicine-details] AI returned "${parsed.prescribedFor}" which is NOT in user's conditions. Setting to "Unknown".`,
      );
      parsed.prescribedFor = "Unknown";
    } else if (!aiPrescribedFor) {
      parsed.prescribedFor = "Unknown";
    }

    // Preserve original casing from user's disease list if matched
    const matchedOriginal = userDiseases.find(
      (d) => d.toLowerCase().trim() === aiPrescribedFor,
    );
    if (matchedOriginal && isValidCondition) {
      parsed.prescribedFor = matchedOriginal;
    }

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
