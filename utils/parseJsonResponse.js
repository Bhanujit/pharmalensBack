export function parseAiJsonResponse(responseData) {
  const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error('AI response is missing expected text content');
  }

  try {
    return JSON.parse(text);
  } catch {
    const fencedJson = extractBetweenFences(text);
    if (fencedJson) {
      return JSON.parse(fencedJson);
    }

    const freeformJson = extractFirstJsonObject(text);
    if (freeformJson) {
      return JSON.parse(freeformJson);
    }

    throw new Error('Could not parse JSON from AI response');
  }
}

function extractBetweenFences(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

function extractFirstJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}
